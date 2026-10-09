import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => {
    window.testAudio = [];
    const Original = window.AudioContext;
    window.AudioContext = class extends Original {
      constructor(...args) { super(...args); window.testAudio.push(this); }
    };
    const connect = AudioNode.prototype.connect;
    AudioNode.prototype.connect = function (...args) {
      if (args[0] instanceof AudioDestinationNode && this instanceof GainNode) {
        window.testOutput = this;
        window.testAnalyser = this.context.createAnalyser();
        window.testAnalyser.fftSize = 4096;
        connect.call(this, window.testAnalyser);
      }
      return connect.apply(this, args);
    };
  });
  await page.goto('http://localhost:5317/#year=1793');
  await page.waitForFunction(() => window.__ronda?.stats(), { timeout: 60000 });
  assert.equal(await page.locator('#music-toggle').getAttribute('aria-pressed'), 'true', 'Music enabled by default');
  const sampleStats = await page.evaluate(async () => {
    const { stringSamples } = await import('/src/music.ts');
    return [41, 50, 69, 77].map(note => {
      const a = stringSamples(note, 44100);
      let sum = 0, peak = 0, tail = 0;
      for (let i = 0; i < a.length; i++) { sum += a[i] ** 2; peak = Math.max(peak, Math.abs(a[i])); if (i > a.length - 4410) tail += a[i] ** 2; }
      return { note, rms: Math.sqrt(sum/a.length), peak, tail: Math.sqrt(tail/4410) };
    });
  });
  for (const s of sampleStats) { assert.ok(s.peak > .01 && s.peak < 1); assert.ok(s.rms > s.tail); }
  await page.locator('#settings-btn').click();
  await page.waitForFunction(() => document.querySelector('#music-toggle').getAttribute('aria-pressed') === 'true');
  await page.waitForFunction(() => window.testAudio[0].state === 'running', { timeout: 5000 });
  const audible = await page.evaluate(async () => {
    let peak = 0;
    const a = new Float32Array(window.testAnalyser.fftSize);
    for (let i=0;i<20;i++) { await new Promise(r=>setTimeout(r,100));window.testAnalyser.getFloatTimeDomainData(a);for(const v of a)peak=Math.max(peak,Math.abs(v)); }
    return peak;
  });
  assert.ok(audible > .001 && audible < 1, `Audible without clipping: ${audible}`);
  await page.locator('#music-volume').fill('0');
  await page.waitForTimeout(500);
  assert.equal(await page.evaluate(() => window.testOutput.gain.value), 0);
  await page.locator('#music-volume').fill('55');
  await page.waitForTimeout(500);
  assert.ok(Math.abs(await page.evaluate(() => window.testOutput.gain.value) - .55) < .001);
  await page.evaluate(() => { window.__ronda.view(1040, 'general'); window.__ronda.resume(); });
  await page.waitForTimeout(900);
  assert.equal(await page.locator('#music-toggle').getAttribute('aria-pressed'), 'true');
  // Simulate the browser visibility event, without depending on headless tab focus.
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
  await page.waitForTimeout(200);
  assert.equal(await page.evaluate(() => window.testAudio[0].state), 'suspended');
  await page.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); });
  await page.waitForTimeout(200);
  await page.waitForFunction(() => window.testAudio[0].state === 'running', { timeout: 5000 });
  await page.locator('#music-toggle').click();
  await page.waitForTimeout(600);
  assert.equal(await page.evaluate(() => window.testAudio[0].state), 'suspended');
  await page.locator('#language-select').selectOption('en');
  assert.equal(await page.locator('#music-toggle').textContent(), 'Music');
  const box = await page.locator('#scene-settings').boundingBox();
  assert.ok(box.y + box.height < 844);
  await page.screenshot({ path: '/tmp/ronda-music-mobile.png' });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ sampleStats, audiblePeak: audible, errors, checks: 'Default on and gesture unlock, output signal, volume, era change, background suspension, mute, translation and mobile' }, null, 2));
} finally { await browser.close(); }
