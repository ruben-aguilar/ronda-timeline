import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
const url = process.argv[2] ?? 'http://localhost:5317';
const browser = await chromium.launch({ channel: 'chrome', headless: true,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('response', r => { if (r.status() >= 400 && new URL(r.url()).origin === new URL(url).origin) errors.push(`${r.status()} ${r.url()}`); });
  await page.goto(`${url}/#year=2026`);
  await page.waitForFunction(() => window.__ronda?.stats(), { timeout: 60000 });
  const scenes = await page.evaluate(() => {
    const r = window.__ronda;
    return [-25000, -206, 1200, 1793, 1900, 1956, 1980, 2004, 2026].map(year => {
      r.view(year, 'general');
      const buildings = r.dbg.scene.children.find(m => m.customDepthMaterial);
      const result = { year, count: document.getElementById('count').textContent,
        indices: buildings.geometry.drawRange.count, ...r.stats() };
      return result;
    });
  });
  assert.equal(scenes[0].indices, 0, 'Prehistory must not submit future buildings');
  for (let i = 1; i < scenes.length; i++) assert.ok(scenes[i].indices >= scenes[i-1].indices, 'Building visibility must be monotonic');
  assert.ok(scenes.at(-1).indices > 0);
  await page.evaluate(() => { window.__ronda.view(2026, 'tajo'); window.__ronda.resume(); });
  await page.waitForTimeout(1000);
  const views = await page.evaluate(() => {
    const results = [];
    for (const id of ['puente', 'toros', 'santamaria', 'almocabar', 'banos', 'alameda', 'ciudad', 'mercadillo', 'cenital', 'paseo']) {
      window.__ronda.view(2026, id);
      results.push({ id, triangles: window.__ronda.stats().triangles });
    }
    window.__ronda.view(2026, 'tajo');
    window.__ronda.resume();
    return results;
  });
  assert.ok(views.every(v => v.triangles > 0), 'Every saved view must render');
  await page.waitForTimeout(1000);
  const idleStart = await page.evaluate(() => window.__ronda.stats().renderedFrames);
  await page.waitForTimeout(700);
  assert.equal(await page.evaluate(() => window.__ronda.stats().renderedFrames), idleStart, 'An idle orbit must stop rendering');
  await page.getByLabel('Luz', { exact: true }).selectOption('late');
  await page.waitForTimeout(200);
  assert.ok(await page.evaluate(start => window.__ronda.stats().renderedFrames > start, idleStart), 'Changing light must invalidate the frame');
  await page.getByLabel('Detalle', { exact: true }).selectOption('0');
  await page.waitForTimeout(200);
  assert.equal(await page.evaluate(() => window.__ronda.stats().ao), false);
  await page.getByLabel('Detalle', { exact: true }).selectOption('2');
  await page.waitForTimeout(200);
  assert.equal(await page.evaluate(() => window.__ronda.stats().ao), true);
  await page.getByRole('button', { name: 'Nombres', exact: true }).click();
  assert.equal(await page.locator('.labels').evaluate(el => el.classList.contains('hide-names')), true);
  await page.getByRole('button', { name: 'Nombres', exact: true }).click();
  await page.getByRole('button', { name: 'Reproducir', exact: true }).click();
  await page.waitForTimeout(250);
  await page.getByRole('button', { name: 'Pausa', exact: true }).click();
  assert.ok(await page.evaluate(() => location.hash !== '#year=2026'), 'Playback at the end must restart');
  await page.waitForTimeout(100);
  assert.equal(await page.evaluate(() => Number(location.hash.split('=')[1]) === Math.round(window.__ronda.stats().year)), true, 'Paused URL must match the displayed scene');
  await page.evaluate(() => { window.__ronda.view(2026, 'tajo'); window.__ronda.resume(); });
  await page.getByRole('button', { name: 'Puente Nuevo Puente Nuevo', exact: true }).click();
  assert.equal(await page.locator('#lightbox').getAttribute('aria-hidden'), 'false');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#lightbox').getAttribute('aria-hidden'), 'true');
  await page.screenshot({ path: 'docs/performance/desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(500);
  const layout = await page.evaluate(() => {
    const box = s => { const r = document.querySelector(s).getBoundingClientRect(); return { x:r.x,y:r.y,right:r.right,bottom:r.bottom }; };
    return { settings:box('.scene-settings'), timeline:box('#timeline'), card:box('#era-card'), clock:box('#clock') };
  });
  assert.ok(layout.settings.x >= 0 && layout.settings.right <= 390, 'Mobile settings must fit');
  assert.ok(layout.settings.bottom <= layout.timeline.y, 'Settings must not overlap the timeline');
  assert.ok(layout.card.right <= layout.clock.x || layout.card.y >= layout.clock.bottom, 'Mobile title and year must not overlap');
  await page.getByRole('button', { name: 'Vistas', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: 'Vistas', exact: true }).getAttribute('aria-expanded'), 'true');
  await page.getByRole('button', { name: 'Plaza de toros', exact: true }).click();
  await page.waitForTimeout(2400);
  assert.equal(await page.getByRole('button', { name: 'Vistas', exact: true }).getAttribute('aria-expanded'), 'false');
  await page.locator('.scene-settings').click();
  await page.evaluate(() => { window.__ronda.view(2026, 'tajo'); });
  await page.screenshot({ path: 'docs/performance/mobile.png' });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ scenes, idleFrames: 0, layout, errors }, null, 2));
} finally { await browser.close(); }
