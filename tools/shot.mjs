// Screenshot helper with the real GPU: node tools/shot.mjs out.png year camX camY camZ tgtX tgtY tgtZ
// Uses Playwright from another local checkout (not a dependency of this project).
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW ?? "/Users/ruben/dev/publicweb/node_modules/playwright-core");

const [out, year, ...nums] = process.argv.slice(2);
const v = nums.map(Number);
const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on("pageerror", (e) => console.error("pageerror", e.message));
await page.goto(`http://localhost:5317/#year=${year}`);
await page.waitForFunction(() => window.__ronda, null, { timeout: 60000 });
await page.waitForTimeout(6000);
const gl = await page.evaluate(() => {
  const c = document.createElement("canvas").getContext("webgl2");
  const e = c.getExtension("WEBGL_debug_renderer_info");
  return e ? c.getParameter(e.UNMASKED_RENDERER_WEBGL) : "?";
});
if (process.env.PRE) await page.evaluate(process.env.PRE);
const viewId = process.env.VIEW;
await page.evaluate(([y, v, viewId]) => {
  if (viewId) window.__ronda.view(Number(y), viewId);
  else window.__ronda.shot(Number(y), v.length >= 3 ? v.slice(0, 3) : undefined, v.length >= 6 ? v.slice(3, 6) : undefined);
}, [year, v, viewId]);
await page.waitForTimeout(500);
await page.screenshot({ path: out });
console.log("ok", gl);
await browser.close();
