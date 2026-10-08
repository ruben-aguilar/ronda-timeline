// Prints camera and target for tools/shot.mjs that look at a map point:
// node tools/look.mjs x n [distance=70] [azimuth deg, 0 = camera south of the point] [pitch deg=25] [lift=8]
import { readFileSync } from "node:fs";
const [x, n, dist = 70, az = 0, pitch = 25, lift = 8] = process.argv.slice(2).map(Number);
const meta = JSON.parse(readFileSync("public/data/dem.json", "utf8"));
const raw = new Uint16Array(readFileSync("public/data/dem.bin").buffer.slice(0));
const cell = meta.size / meta.cols;
const elev = (x, n) => {
  const half = meta.size / 2;
  const c = Math.min(Math.max((x + half) / cell - 0.5, 0), meta.cols - 1.001);
  const r = Math.min(Math.max((half - n) / cell - 0.5, 0), meta.rows - 1.001);
  const c0 = Math.floor(c), r0 = Math.floor(r), fc = c - c0, fr = r - r0, i = r0 * meta.cols + c0;
  const a = raw[i] * (1 - fc) + raw[i + 1] * fc;
  const b = raw[i + meta.cols] * (1 - fc) + raw[i + meta.cols + 1] * fc;
  return (a * (1 - fr) + b * fr) / 10;
};
const ty = elev(x, n) - 600 + lift;
const a = (az * Math.PI) / 180;
const p = (pitch * Math.PI) / 180;
const cx = x + Math.sin(a) * Math.cos(p) * -dist;
const cn = n + Math.cos(a) * Math.cos(p) * -dist;
const cy = ty + Math.sin(p) * dist;
console.log([cx, cy, -cn, x, ty, -n].map((v) => v.toFixed(1)).join(" "));
