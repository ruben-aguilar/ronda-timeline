// UI check: node tools/ui.mjs outPrefix year — open panel, gallery viewer, collapsed panel.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW ?? "/Users/ruben/dev/publicweb/node_modules/playwright-core");
const [out, year] = process.argv.slice(2);
const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on("pageerror", (e) => console.error("pageerror", e.message));
page.on("response", (r) => r.status() >= 400 && console.error("http", r.status(), r.url()));
await page.goto(`http://localhost:5317/#year=${year}`);
await page.waitForFunction(() => window.__ronda, null, { timeout: 60000 });
await page.waitForTimeout(7000);
await page.evaluate(() => localStorage.removeItem("eraCollapsed"));
await page.screenshot({ path: `${out}_open.png` });
const thumbs = await page.locator(".g-thumb").count();
console.log("thumbs", thumbs);
if (thumbs) {
  await page.locator(".g-thumb").nth(1).click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}_box.png` });
  await page.keyboard.press("Escape");
}
await page.click("#era-toggle");
await page.waitForTimeout(800);
await page.screenshot({ path: `${out}_closed.png` });
await browser.close();
