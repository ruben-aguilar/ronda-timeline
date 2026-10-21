import assert from 'node:assert/strict';
import { chromium, webkit } from 'playwright-core';
import { mkdir, writeFile } from 'node:fs/promises';

// Capture the same mobile views for visual comparison, then check the real tree materials
// across quality changes. PW_BROWSER=webkit also checks the iPhone browser engine.
const [url = 'http://localhost:5317', output = '/tmp/ronda-mobile-trees'] = process.argv.slice(2);
await mkdir(output, { recursive: true });
const browser = process.env.PW_BROWSER === 'webkit' ? await webkit.launch({ headless: true })
  : await chromium.launch({ channel: 'chrome', headless: true,
    args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: 428, height: 926 },
    deviceScaleFactor: 3, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript(() => localStorage.setItem('ronda-music', '0'));
  await page.goto(`${url}/?lang=en#year=2026`);
  await page.waitForFunction(() => window.__ronda, null, { timeout: 60000 });
  const samples = [];
  for (const view of ['alameda', 'toros', 'general']) {
    await page.evaluate(view => {
      const r = window.__ronda;
      r.view(2026, view); r.resume();
      document.body.classList.add('ui-hidden');
    }, view);
    await page.waitForLoadState('networkidle');
    await page.waitForFunction(() => !window.__ronda.stats().terrainTextures.loading);
    await page.screenshot({ path: `${output}/${view}.png` });
    samples.push(await page.evaluate(view => ({ view, ...window.__ronda.stats() }), view));
  }
  const canopy = await page.evaluate(() => {
    const r = window.__ronda, woodland = r.dbg.scene.getObjectByName('Woodland tiles');
    const crown = woodland.children[0];
    const texture = crown.material.map;
    const canvas = texture.image, ctx = canvas.getContext('2d');
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let opaque = 0;
    for (let i = 3; i < pixels.length; i += 4) if (pixels[i] >= 128) opaque++;
    return { trianglesPerTree: crown.geometry.index.count / 3,
      textureSize: [canvas.width, canvas.height], textureCoverage: opaque / (pixels.length / 4),
      sharedGeometry: woodland.children.filter((_, i) => i % 2 === 0).every(m => m.geometry === crown.geometry),
      sharedMaterial: woodland.children.filter((_, i) => i % 2 === 0).every(m => m.material === crown.material),
      alphaToCoverage: crown.material.alphaToCoverage,
      materialType: crown.material.type,
      samples: r.dbg.composer.readBuffer.samples };
  });
  assert.ok(canopy.samples > 0 || !canopy.alphaToCoverage, 'Leaf coverage smoothing needs a multisampled target; without it mobile trees have bright outlines');
  assert.ok(canopy.sharedGeometry && canopy.sharedMaterial, 'Trees must share their GPU resources');
  assert.equal(canopy.trianglesPerTree, 16, 'The tree update must retain the mobile geometry budget');
  assert.deepEqual(canopy.textureSize, [256, 256], 'The shared leaf atlas must retain its memory budget');
  for (const level of ['0', '1', '2']) {
    await page.evaluate(() => document.body.classList.remove('ui-hidden'));
    if (await page.locator('#settings-btn').getAttribute('aria-expanded') !== 'true') {
      await page.locator('#settings-btn').click();
    }
    await page.locator('#detail-select').selectOption(level);
    const coverage = await page.evaluate(() => {
      const r = window.__ronda;
      return r.dbg.scene.getObjectByName('Woodland tiles').children[0].material.alphaToCoverage;
    });
    assert.equal(coverage, false, 'No mobile quality level has MSAA, so all must use leaf cutouts');
  }
  const desktop = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  desktop.on('pageerror', e => errors.push(e.message));
  desktop.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await desktop.addInitScript(() => localStorage.setItem('ronda-music', '0'));
  await desktop.goto(`${url}/#year=2026`);
  await desktop.waitForFunction(() => window.__ronda, null, { timeout: 60000 });
  await desktop.locator('#settings-btn').click();
  for (const level of ['0', '1', '2', '0']) {
    await desktop.locator('#detail-select').selectOption(level);
    await desktop.waitForTimeout(100);
    const state = await desktop.evaluate(() => {
      const r = window.__ronda;
      return { samples: r.dbg.composer.readBuffer.samples,
        coverage: r.dbg.scene.getObjectByName('Woodland tiles').children[0].material.alphaToCoverage };
    });
    assert.equal(state.coverage, state.samples > 0, 'Desktop quality changes must match leaf smoothing to the render target');
  }
  assert.deepEqual(errors, []);
  await writeFile(`${output}/report.json`, JSON.stringify({ samples, canopy, errors }, null, 2));
  console.log(JSON.stringify({ samples: samples.map(({ view, calls, triangles, textures }) => ({ view, calls, triangles, textures })), canopy, errors }, null, 2));
} finally { await browser.close(); }
