import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const url = process.argv[2] ?? 'http://localhost:5317';
const browser = await chromium.launch({ channel: 'chrome', headless: true,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('response', r => { if (r.status() >= 400 && new URL(r.url()).origin === new URL(url).origin) errors.push(`${r.status()} ${r.url()}`); });
  await page.goto(`${url}/#year=1793`);
  await page.waitForFunction(() => window.__ronda?.stats(), { timeout: 60000 });
  const timing = await page.evaluate(async () => {
    const m = await import('/src/timeline.ts');
    const c = await import('/src/camera.ts');
    const errors = [];
    for (const e of m.ERAS) {
      if (m.eraAt(m.yearAt(m.posAt(e.from))).id !== e.id) errors.push(`Boundary ${e.id}`);
      if (Math.abs((m.posAt(e.to) - m.posAt(e.from)) * m.PLAY_SECONDS - e.seconds) > 1e-8) errors.push(`Duration ${e.id}`);
      for (const id of c.ERA_VIEWS[e.id] ?? []) if (!c.VIEWPOINTS.some(v => v.id === id)) errors.push(`View ${id}`);
    }
    for (let i = 0; i <= 10000; i++) {
      const p = i / 10000;
      if (Math.abs(m.posAt(m.yearAt(p)) - p) > 1e-10) errors.push(`Inverse ${p}`);
      if (i && m.yearAt(p) <= m.yearAt((i - 1) / 10000)) errors.push(`Order ${p}`);
    }
    return { errors, seconds: m.PLAY_SECONDS };
  });
  assert.deepEqual(timing.errors, []);
  assert.equal(timing.seconds, 303);
  const settings = page.locator('#scene-settings');
  assert.equal(await settings.isVisible(), false);
  await page.locator('#settings-btn').click();
  assert.equal(await settings.isVisible(), true);
  await page.locator('#language-select').selectOption('en');
  assert.equal(await page.locator('#settings-btn').getAttribute('aria-label'), 'Settings');
  assert.equal(await page.locator('#era-more summary').textContent(), 'Read more');
  await page.locator('#light-select').selectOption('late');
  await page.locator('#detail-select').selectOption('0');
  assert.equal(await page.evaluate(() => window.__ronda.stats().ao), false);
  await page.keyboard.press('Escape');
  assert.equal(await settings.isVisible(), false);
  assert.equal(await page.locator('#settings-btn').evaluate(el => el === document.activeElement), true);
  await page.evaluate(() => { window.__ronda.view(1720, 'general'); window.__ronda.resume(); });
  await page.locator('.tl-play').click();
  const keepsPlaying = async (name, action) => {
    const before = await page.evaluate(() => window.__ronda.stats().year);
    await action();
    assert.equal(await page.locator('.tl-play').getAttribute('aria-label'), 'Pause', name);
    await page.waitForFunction(year => window.__ronda.stats().year > year + 0.1, before);
    assert.equal(await page.locator('.tl-play').getAttribute('aria-label'), 'Pause', name);
  };
  await keepsPlaying('history place', () => page.locator('[data-place="puente"]').click());
  await page.waitForTimeout(2500);
  assert.equal(await page.locator('[data-mode="orbit"]').evaluate(el => el.classList.contains('on')), true);
  await keepsPlaying('view preset', async () => {
    await page.locator('.cam-views-title').click();
    await page.locator('[data-view="general"]').click();
  });
  await page.waitForTimeout(2500);
  const drag = async (button = 'left') => {
    await page.mouse.move(850, 450);
    await page.mouse.down({ button });
    await page.mouse.move(940, 490, { steps: 8 });
    await page.mouse.up({ button });
  };
  await keepsPlaying('orbit drag', () => drag());
  await keepsPlaying('orbit pan', () => drag('right'));
  await keepsPlaying('orbit zoom', () => page.mouse.wheel(0, -150));
  await keepsPlaying('double-click travel', () => page.mouse.dblclick(850, 450));
  for (const mode of ['fly', 'walk', 'cine', 'orbit']) {
    await keepsPlaying(`${mode} mode`, () => page.locator(`[data-mode="${mode}"]`).click());
    if (mode === 'fly' || mode === 'walk') {
      await keepsPlaying(`${mode} look`, () => drag());
      await keepsPlaying(`${mode} movement`, async () => {
        await page.keyboard.down('w');
        await page.waitForTimeout(200);
        await page.keyboard.up('w');
      });
    }
  }
  await page.locator('.tl-play').click();
  const heldYear = await page.evaluate(() => window.__ronda.stats().year);
  await page.locator('[data-place="puente"]').click();
  await drag();
  assert.equal(await page.locator('.tl-play').getAttribute('aria-label'), 'Play');
  assert.equal(await page.evaluate(() => window.__ronda.stats().year), heldYear);
  await page.locator('.tl-play').click();
  await page.locator('#era-more summary').click();
  await page.waitForTimeout(100);
  assert.equal(await page.locator('.tl-play').getAttribute('aria-label'), 'Play');
  assert.equal(await page.locator('#era-sources').getAttribute('open'), null);
  await page.locator('#era-more summary').click();
  await page.locator('.tl-play').click();
  await page.locator('.g-thumb').first().click();
  assert.equal(await page.locator('.tl-play').getAttribute('aria-label'), 'Play');
  assert.ok(await page.locator('.lb-meta').textContent());
  await page.keyboard.press('Escape');
  await page.locator('#settings-btn').click();
  await page.screenshot({ path: '/tmp/ronda-history-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(250);
  const layout = await settings.boundingBox();
  assert.ok(layout.x >= 0 && layout.x + layout.width <= 390);
  await page.screenshot({ path: '/tmp/ronda-history-mobile.png' });
  await page.locator('#language-select').selectOption('es');
  await page.locator('.ui-toggle').click();
  assert.equal(await settings.isVisible(), false);
  assert.equal(await page.locator('#clock').isVisible(), false);
  assert.equal(await page.locator('#cambar').isVisible(), true);
  await page.locator('.ui-toggle').click();
  assert.equal(await settings.isVisible(), false);
  const gallery = JSON.parse(fs.readFileSync('public/data/gallery.json', 'utf8'));
  for (const items of Object.values(gallery)) for (const item of items) {
    assert.ok(item.kind && item.date && item.source);
    for (const key of ['img', 'thumb']) assert.ok(fs.existsSync(`public/${item[key]}`), item[key]);
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ timing, layout, errors, checks: 'Settings, languages, camera controls preserve playback, pause on reading, gallery assets, mobile, hide UI' }, null, 2));
} finally { await browser.close(); }
