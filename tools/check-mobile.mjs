import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const url = process.argv[2] ?? 'http://localhost:5317';
const browser = await chromium.launch({ channel: 'chrome', headless: true,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
  const errors = [];
  const terrainRequests = new Set();
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('request', request => {
    if (/\/(historic\.webp|ortho_\w+\.webp|urban_mask\.png)$/.test(request.url())) terrainRequests.add(new URL(request.url()).pathname);
  });
  page.on('response', response => {
    if (response.status() >= 400 && new URL(response.url()).origin === new URL(url).origin) errors.push(`${response.status()} ${response.url()}`);
  });
  await page.goto(url);
  await page.waitForFunction(() => window.__ronda?.stats(), { timeout: 60000 });
  await page.evaluate(() => { window.__ronda.view(1793, 'general'); window.__ronda.resume(); });
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);
  const budget = await page.evaluate(() => {
    const r = window.__ronda;
    return { ...r.stats(), samples: r.dbg.composer.renderTarget1.samples,
      shadowSize: r.dbg.sun.shadow.mapSize.x, aoWidth: r.dbg.gtao.width };
  });
  assert.equal(budget.quality, 0, 'Phones must start with a small GPU budget');
  assert.equal(budget.pixelRatio, 1);
  assert.equal(budget.samples, 0);
  assert.equal(budget.shadowSize, 1024);
  assert.equal(budget.aoWidth, 1, 'Disabled AO must not reserve full-screen buffers');
  // A phone can lose its WebGL context when backgrounded or under GPU memory pressure.
  const before = await page.evaluate(() => {
    const r = window.__ronda;
    const extension = r.dbg.renderer.getContext().getExtension('WEBGL_lose_context');
    if (!extension) throw new Error('Context loss extension unavailable');
    const stats = r.stats();
    window.__contextRestored = false;
    r.dbg.renderer.domElement.addEventListener('webglcontextrestored', () => {
      window.__contextRestored = true;
    }, { once: true });
    r.dbg.renderer.domElement.addEventListener('webglcontextlost', () => {
      setTimeout(() => extension.restoreContext(), 100);
    }, { once: true });
    extension.loseContext();
    return stats;
  });
  await page.waitForFunction(() => window.__contextRestored);
  await page.waitForTimeout(500);
  const after = await page.evaluate(() => window.__ronda.stats());
  assert.ok(after.renderedFrames > before.renderedFrames,
    'The paused visualization must redraw after WebGL context restoration');
  assert.ok(after.triangles > 0, 'The restored scene must draw geometry');

  // Exercise lazy modern imagery, timeline changes and screen rotation on a touch device.
  await page.evaluate(() => { window.__ronda.view(2026, 'estacion'); window.__ronda.resume(); });
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500);
  for (const [width, height] of [[320, 568], [390, 844], [844, 390]]) {
    await page.setViewportSize({ width, height });
    await page.waitForFunction(([w, h]) => innerWidth === w && innerHeight === h, [width, height]);
    await page.evaluate(() => { window.__ronda.view(-25000, 'general'); window.__ronda.resume(); });
    const layout = await page.locator('#language-select').evaluate(select => {
      const r = select.getBoundingClientRect();
      return { x: r.x, right: r.right, y: r.y, bottom: r.bottom, height: r.height,
        viewport: [innerWidth, innerHeight],
        reachable: document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) === select };
    });
    assert.ok(layout.x >= 0 && layout.right <= width && layout.y >= 0 && layout.bottom <= height,
      `The language selector must fit ${width} × ${height}: ${JSON.stringify(layout)}`);
    assert.ok(layout.height >= 44 && layout.reachable, 'The selector must have a visible touch target');
    await page.locator('#language-select').selectOption('en');
    assert.equal(await page.locator('html').getAttribute('lang'), 'en');
    await page.locator('#language-select').selectOption('es');
  }
  assert.ok(terrainRequests.size >= 7);
  assert.ok([...terrainRequests].every(path => path.includes('/textures/mobile/')),
    'Both initial and lazy terrain images must use the mobile assets');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${url}/?lang=en&keep=1#year=1793`);
  await page.waitForFunction(() => window.__ronda?.stats());
  assert.equal(await page.locator('html').getAttribute('lang'), 'en', 'The query must override saved Spanish');
  assert.equal(await page.locator('#language-select').inputValue(), 'en');
  assert.equal(await page.locator('#settings-btn').getAttribute('aria-label'), 'Settings');
  await page.locator('#language-select').selectOption('es');
  const selectedURL = new URL(page.url());
  assert.equal(selectedURL.searchParams.get('lang'), 'es');
  assert.equal(selectedURL.searchParams.get('keep'), '1');
  assert.equal(selectedURL.hash, '#year=1793');
  await page.locator('#language-select').selectOption('en');
  await page.goto(`${url}/?lang=invalid#year=1793`);
  await page.waitForFunction(() => window.__ronda?.stats());
  assert.equal(await page.locator('html').getAttribute('lang'), 'en', 'Invalid language must use the saved choice');
  await page.goto(`${url}/?lang=es#year=1793`);
  await page.waitForFunction(() => window.__ronda?.stats());
  assert.equal(await page.locator('html').getAttribute('lang'), 'es', 'Spanish query must override saved English');

  // Private or embedded browsers can deny storage access entirely.
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Storage blocked', 'SecurityError'); } });
  });
  await page.goto(`${url}/?lang=en#year=1793`);
  await page.waitForFunction(() => window.__ronda?.stats());
  assert.equal(await page.locator('html').getAttribute('lang'), 'en');
  await page.locator('#language-select').selectOption('es');
  await page.locator('#era-toggle').click();
  assert.ok(await page.locator('#era-card').evaluate(card => card.classList.contains('collapsed')));
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ budget, before, after, terrainRequests: [...terrainRequests],
    language: 'query, selection, persistence and blocked storage passed', errors }, null, 2));
} finally { await browser.close(); }
