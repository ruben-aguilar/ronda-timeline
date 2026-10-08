// npm run benchmark -- http://localhost:5317 docs/performance/after
// Uses installed Chrome and WebGL timer queries. These are GPU timings, not FPS estimates.
import { chromium } from 'playwright-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
const [url = 'http://localhost:5317', output = 'docs/performance/after'] = process.argv.slice(2);
await mkdir(dirname(output), { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text()); });
  await page.goto(`${url}/#year=2026`);
  await page.waitForFunction(() => window.__ronda, { timeout: 60000 });
  await page.waitForTimeout(3000);
  const result = await page.evaluate(async () => {
    const r = window.__ronda, d = r.dbg, gl = d.renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const timer = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    if (!timer) throw new Error('GPU timer queries unavailable');
    const results = [];
    for (const view of ['general', 'tajo']) {
      r.view(2026, view);
      d.renderer.setPixelRatio(1);
      d.renderer.setSize(innerWidth, innerHeight);
      d.composer.setPixelRatio(1);
      d.composer.setSize(innerWidth, innerHeight);
      // Keep each version's intended AO resolution (new: half, old: full).
      if (r.stats) d.gtao.setSize(innerWidth / 2, innerHeight / 2);
      d.gtao.enabled = true;
      d.renderer.info.autoReset = false;
      const render = () => {
        if (r.stats) d.gtao.setGBuffer(d.composer.readBuffer.depthTexture);
        d.composer.render();
        gl.flush();
      };
      for (let i = 0; i < 5; i++) render();
      const times = [];
      for (let i = 0; i < 40; i++) {
        d.renderer.info.reset();
        const query = gl.createQuery();
        gl.beginQuery(timer.TIME_ELAPSED_EXT, query);
        render();
        gl.endQuery(timer.TIME_ELAPSED_EXT);
        const deadline = performance.now() + 10000;
        while (!gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) {
          if (performance.now() > deadline) throw new Error('GPU query timeout');
          await new Promise(resolve => setTimeout(resolve, 4));
        }
        if (gl.getParameter(timer.GPU_DISJOINT_EXT)) throw new Error('Disjoint GPU timer; rerun');
        times.push(gl.getQueryParameter(query, gl.QUERY_RESULT) / 1e6);
        gl.deleteQuery(query);
      }
      times.sort((a,b) => a-b);
      results.push({ view, medianMs: times[20], p90Ms: times[36],
        calls: d.renderer.info.render.calls, triangles: d.renderer.info.render.triangles });
    }
    return { gpu: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown',
      viewport: [innerWidth, innerHeight], pixelRatio: d.renderer.getPixelRatio(), results };
  });
  for (const view of ['tajo', 'general']) {
    await page.evaluate(view => {
      window.__ronda.view(2026, view);
      document.getElementById('era-card').classList.add('collapsed');
    }, view);
    await page.screenshot({ path: `${output}-${view}.png` });
  }
  result.errors = errors;
  await writeFile(`${output}.json`, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
  if (errors.length) process.exitCode = 1;
} finally { await browser.close(); }
