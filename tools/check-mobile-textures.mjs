import assert from 'node:assert/strict';
import { chromium, webkit } from 'playwright-core';
import { mkdir, writeFile } from 'node:fs/promises';

const url = process.argv[2] ?? 'http://localhost:5317';
const sceneURL = year => { const target = new URL(url); target.hash = `year=${year}`; return target.href; };
const output = process.argv[3] ?? '/tmp/ronda-mobile-textures';
await mkdir(output, { recursive: true });
const browser = process.env.PW_BROWSER === 'webkit' ? await webkit.launch({ headless: true })
  : await chromium.launch({ channel: 'chrome', headless: true,
    args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: 428, height: 926 },
    deviceScaleFactor: 3, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
  await page.addInitScript(() => { localStorage.setItem('ronda-music', '0'); });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(sceneURL(2026));
  await page.waitForFunction(() => window.__ronda, null, { timeout: 60000 });
  const samples = [];
  for (const view of ['estacion', 'toros']) {
    await page.evaluate(view => {
      window.__ronda.view(2026, view);
      window.__ronda.resume();
      document.body.classList.add('ui-hidden');
    }, view);
    await page.waitForLoadState('networkidle');
    await page.waitForFunction(view => {
      const material = window.__ronda.dbg.scene.getObjectByName('Terrain tiles').children[0].children[0].material;
      const uniforms = window.__ronda.dbg.renderer.properties.get(material).uniforms;
      return uniforms[view === 'estacion' ? 'tStation' : 't2024c'].value?.image?.width >= 2048;
    }, view);
    samples.push(await page.evaluate(view => {
      const r = window.__ronda;
      const terrain = r.dbg.scene.getObjectByName('Terrain tiles');
      const material = terrain.children[0].children[0].material;
      const uniforms = r.dbg.renderer.properties.get(material).uniforms;
      return { view, imageSizes: Object.fromEntries(['t2024', 't2024c', 'tStation'].map(key => {
        const image = uniforms[key].value?.image;
        return [key, [image?.width ?? 0, image?.height ?? 0]];
      })), ...r.stats() };
    }, view));
    await page.screenshot({ path: `${output}/${view}.png` });
  }
  assert.ok(samples[0].imageSizes.tStation[0] >= 2048, `Close mobile views need at least 2048 px regional imagery: ${JSON.stringify(samples)}`);
  assert.ok(samples[1].imageSizes.t2024c[0] >= 2048, 'Mobile roofs need a sharp central image');
  assert.equal(samples[0].pixelRatio, 1.5, 'The iPhone canvas must preserve fine texture detail');
  assert.equal(samples[0].ao, false, 'Mobile detail must not enable costly ambient occlusion');

  const budgets = [];
  const tour = [[2026, 'noreste'], [2026, 'sanfrancisco'], [2026, 'estacion'],
    [1793, 'puente'], [1956, 'general'], [1980, 'general'], [2010, 'general'], [2026, 'toros']];
  const endCounts = [];
  for (const [index, [year, view]] of [...tour, ...tour].entries()) {
    await page.evaluate(([year, view]) => { window.__ronda.view(year, view); window.__ronda.resume(); }, [year, view]);
    await page.waitForLoadState('networkidle');
    await page.waitForFunction(() => !window.__ronda.stats().terrainTextures.loading);
    const pool = await page.evaluate(() => window.__ronda.stats().terrainTextures);
    assert.ok(pool.enabled, 'Stationary mobile views must retain the sharper texture setting');
    assert.ok(pool.resident.length <= 3, 'Exploring more places must not retain more large images');
    assert.ok(pool.peakBytes <= pool.budgetBytes, 'Resident and in-flight images must share the memory limit');
    assert.ok(pool.resident.every(image => image.width <= 2048 && image.height <= 2048));
    if (year === 1793) assert.deepEqual(pool.resident.map(image => image.name), ['historic.webp'], 'Inactive modern images must be freed');
    const allocation = await page.evaluate(() => {
      const r = window.__ronda;
      const material = r.dbg.scene.getObjectByName('Terrain tiles').children[0].children[0].material;
      const uniforms = r.dbg.renderer.properties.get(material).uniforms;
      const photos = new Set(['tHist', 't1956', 't1980', 't2004', 't2024', 't2024c', 'tMask',
        'tNortheast', 'tStation', 'tWest', 'tSouth', 'tTajo'].map(key => uniforms[key].value).filter(Boolean));
      let bytes = 0;
      for (const photo of photos) {
        if (!r.dbg.renderer.properties.get(photo).__webglInit) continue;
        let w = photo.image.width, h = photo.image.height;
        do { bytes += w * h * 4; w = Math.floor(w / 2); h = Math.floor(h / 2); } while (w > 0 && h > 0);
      }
      return { photoBytes: bytes, textureCount: r.stats().textures };
    });
    assert.ok(allocation.photoBytes <= 112 * 1024 * 1024, 'Uploaded terrain images, including previews and mipmaps, must stay bounded');
    if ((index + 1) % tour.length === 0) endCounts.push(allocation.textureCount);
    pool.allocation = allocation;
    budgets.push({ year, view, ...pool });
  }
  assert.ok(endCounts[1] <= endCounts[0] + 1, 'Repeated tours must not leak GPU textures');
  assert.ok(budgets.at(-1).evictions >= 5, 'Moving through the scene must free old images');
  await page.evaluate(() => {
    for (const view of ['noreste', 'sanfrancisco', 'estacion']) {
      window.__ronda.view(2026, view);
      window.__ronda.resume();
    }
  });
  await page.waitForLoadState('networkidle');
  await page.waitForFunction(() => !window.__ronda.stats().terrainTextures.loading);
  const settled = await page.evaluate(() => window.__ronda.stats().terrainTextures);
  assert.ok(settled.resident.some(image => image.name === 'ortho_station.webp'), 'Rapid navigation must load the final view');
  assert.ok(settled.peakBytes <= settled.budgetBytes, 'Rapid navigation must keep the same memory limit');

  await page.evaluate(() => document.body.classList.remove('ui-hidden'));
  await page.locator('#settings-btn').click();
  await page.locator('#detail-select').selectOption('0');
  await page.waitForFunction(() => !window.__ronda.stats().terrainTextures.loading);
  assert.deepEqual(await page.evaluate(() => window.__ronda.stats().terrainTextures.resident), [], 'Light mode must release upgrades');
  await page.locator('#detail-select').selectOption('1');
  await page.waitForLoadState('networkidle');
  await page.waitForFunction(() => window.__ronda.stats().terrainTextures.resident.length === 3);
  // Hold a real image request while WebGL is lost: a late callback must not restore large images.
  // Use a fresh context so WebKit cannot satisfy the image from its decoded-image cache.
  const racePage = await browser.newPage({ viewport: { width: 428, height: 926 },
    deviceScaleFactor: 3, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
  racePage.on('pageerror', error => errors.push(error.message));
  racePage.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  let releaseRequest;
  const heldRequest = new Promise(resolve => { releaseRequest = resolve; });
  await racePage.route('**/textures/mobile/detail/**', async route => { await heldRequest; await route.continue(); });
  await racePage.goto(sceneURL(1793));
  await racePage.waitForFunction(() => window.__ronda?.stats().terrainTextures.loading);
  await racePage.evaluate(() => {
    const canvas = window.__ronda.dbg.renderer.domElement;
    const extension = window.__ronda.dbg.renderer.getContext().getExtension('WEBGL_lose_context');
    window.__restoredWhileLoading = false;
    canvas.addEventListener('webglcontextrestored', () => { window.__restoredWhileLoading = true; }, { once: true });
    canvas.addEventListener('webglcontextlost', () => { setTimeout(() => extension.restoreContext(), 100); }, { once: true });
    extension.loseContext();
  });
  await racePage.waitForFunction(() => window.__restoredWhileLoading);
  releaseRequest();
  await racePage.waitForFunction(() => !window.__ronda.stats().terrainTextures.loading);
  const recovered = await racePage.evaluate(() => window.__ronda.stats());
  assert.equal(recovered.quality, 0);
  assert.equal(recovered.terrainTextures.reservedBytes, 0);
  assert.deepEqual(recovered.terrainTextures.resident, []);
  assert.equal(recovered.terrainTextures.enabled, false);
  // Simulate long frame intervals through the real adaptation loop.
  const slowPage = await browser.newPage({ viewport: { width: 428, height: 926 },
    deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  slowPage.on('pageerror', error => errors.push(error.message));
  await slowPage.addInitScript(() => {
    const realNow = performance.now.bind(performance);
    Object.defineProperty(performance, 'now', { value: () => realNow() * 10 });
    localStorage.setItem('ronda-music', '0');
  });
  await slowPage.goto(sceneURL(2026));
  await slowPage.waitForFunction(() => window.__ronda?.stats().quality === 0);
  await slowPage.locator('[data-mode="orbit"]').click();
  await slowPage.evaluate(() => { window.__ronda.view(2026, 'estacion'); window.__ronda.resume(); });
  await slowPage.waitForLoadState('networkidle');
  await slowPage.waitForFunction(() => window.__ronda.stats().terrainTextures.resident
    .some(image => image.name === 'ortho_station.webp' && image.width === 2048));
  const adapted = await slowPage.evaluate(() => window.__ronda.stats());
  assert.equal(adapted.pixelRatio, 1, 'Slow frames must reduce screen resolution');
  assert.equal(adapted.terrainTextures.enabled, true, 'Slow frames must preserve bounded texture detail');
  assert.ok(adapted.terrainTextures.resident.some(image => image.name === 'ortho_station.webp' && image.width === 2048), JSON.stringify(adapted));
  assert.deepEqual(errors, []);
  await writeFile(`${output}/report.json`, JSON.stringify({ samples, budgets, rapidNavigation: settled, recovered, adapted, errors }, null, 2));
  console.log(JSON.stringify({ browser: process.env.PW_BROWSER ?? 'chrome',
    photoSizes: samples.map(sample => sample.imageSizes),
    maxPhotoMiB: Math.max(...budgets.map(pool => pool.allocation.photoBytes)) / 1024 / 1024,
    upgradeBudgetMiB: settled.budgetBytes / 1024 / 1024, textureCountsAfterTours: endCounts,
    evictions: settled.evictions, recoveryReservedBytes: recovered.terrainTextures.reservedBytes, errors }, null, 2));
} finally { await browser.close(); }
