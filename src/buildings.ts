import * as THREE from "three";
import { BuildingData, Y_OFFSET } from "./data";
import { pbr } from "./textures";

// All Catastro buildings in one mesh. Each building has two forms:
// - an old form, used before its Catastro year (the last rebuild): the number of floors and the
//   style (walls, windows, roof) follow the year on screen, from Iberian huts to 19th-century houses;
// - the modern form, used after it: Catastro floors and today's look.
// The shader picks the form, so moving the timeline changes every building at once.

export interface Buildings {
  mesh: THREE.Mesh;
  /** Sorted appearance years, for the building counter. */
  years: Float32Array;
  setYear(year: number, growYears: number): void;
}

function hash(i: number): number {
  let h = (i * 2654435761) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 2246822507) >>> 0;
  h ^= h >>> 13;
  return (h >>> 0) / 4294967295;
}

function signedArea(pts: number[][]): number {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1];
  return a / 2;
}

function convexHull(pts: number[][]): number[][] {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: number[], a: number[], b: number[]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: number[][] = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper: number[][] = [];
  for (const q of p.reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

export interface OBB {
  cx: number;
  cn: number;
  /** Unit vector of the long axis, in (x, n). */
  ux: number;
  un: number;
  /** Half lengths: a along the long axis, b across. */
  a: number;
  b: number;
}

/** Minimum-area oriented bounding box (rotating the hull edges). */
export function orientedBox(pts: number[][]): OBB {
  const hull = convexHull(pts);
  let best: OBB | null = null;
  let bestArea = Infinity;
  for (let i = 0; i < hull.length; i++) {
    const [x0, n0] = hull[i];
    const [x1, n1] = hull[(i + 1) % hull.length];
    const len = Math.hypot(x1 - x0, n1 - n0);
    if (len < 1e-6) continue;
    const ux = (x1 - x0) / len;
    const un = (n1 - n0) / len;
    let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
    for (const [x, n] of hull) {
      const u = x * ux + n * un;
      const v = -x * un + n * ux;
      minU = Math.min(minU, u);
      maxU = Math.max(maxU, u);
      minV = Math.min(minV, v);
      maxV = Math.max(maxV, v);
    }
    const area = (maxU - minU) * (maxV - minV);
    if (area < bestArea) {
      bestArea = area;
      const cu = (minU + maxU) / 2;
      const cv = (minV + maxV) / 2;
      let box: OBB = { cx: cu * ux - cv * un, cn: cu * un + cv * ux, ux, un, a: (maxU - minU) / 2, b: (maxV - minV) / 2 };
      if (box.b > box.a) box = { ...box, ux: -un, un: ux, a: box.b, b: box.a };
      best = box;
    }
  }
  return best ?? { cx: pts[0][0], cn: pts[0][1], ux: 1, un: 0, a: 1, b: 1 };
}

const VERTEX_HEAD = /* glsl */ `
attribute vec4 aInfo; // appear year, bottom Y, kind (0 wall foot, 1 wall top, 2 flat roof, 3 historic roof, 4 clipped modern roof), historic zone
attribute vec4 aB;    // rebuild year, modern floors, hash, roof mode (0 none, 1 old form only, 2 always)
attribute float aIndustrial; // cadastral industrial use
attribute vec3 aR;    // walls: (position along the wall, wall length, 0); pitched roofs: (along the eave, down the slope, slope length)
uniform float uYear;
uniform float uGrow;
varying float vFresh;
varying vec4 vFacade; // height above ground, position along the wall, wall (1) or roof (0), style year
varying vec3 vBPos;
varying vec2 vKH;     // kind, hash
varying vec3 vR;
varying float vWallH;
varying float vHist;
varying float vIndustrial;

// Floors of the old form, by the year on screen.
float histFloors(float y, float h) {
  if (y < 711.0) return 1.0;
  if (y < 1485.0) return h > 0.62 ? 2.0 : 1.0;
  if (y < 1800.0) return h < 0.2 ? 1.0 : (h > 0.86 ? 3.0 : 2.0);
  if (y < 1900.0) return h < 0.12 ? 1.0 : (h > 0.7 ? 3.0 : 2.0);
  return h < 0.3 ? 2.0 : (h > 0.85 ? 4.0 : 3.0);
}
`;
const VERTEX_BODY = /* glsl */ `
float g = clamp((uYear - aInfo.x) / uGrow, 0.0, 1.0);
bool modern = uYear >= aB.x;
float floors = modern ? aB.y : min(aB.y, histFloors(uYear, aB.z));
float bottom = aInfo.y;
float top = bottom + 3.0 + floors * 3.1 + (aB.z - 0.5) * 0.6;
float kind = aInfo.z;
if (kind < 0.5) transformed.y = bottom;
else {
  float yy = top;
  if (kind > 2.5) {
    bool show = aB.w > 1.5 || (aB.w > 0.5 && !modern);
    // Earlier reconstructions retain their box roof; present-day roofs are clipped to cadastral rings.
    if (kind > 3.5) show = show && uYear >= 2022.0;
    else if (uYear >= 2022.0) show = false;
    yy = show ? top + transformed.y : bottom - ((kind > 3.5 || uYear >= 2022.0) ? 1000.0 : 1.0);
  }
  transformed.y = mix(bottom, yy, g);
}
vFresh = g > 0.0 ? 1.0 - clamp((uYear - aInfo.x) / (uGrow * 5.0), 0.0, 1.0) : 0.0;
vFacade = vec4(transformed.y - bottom - 3.0, dot(position.xz, vec2(-normal.z, normal.x)), 1.0 - abs(normal.y), modern ? 3000.0 : uYear);
vBPos = position;
vKH = vec2(kind, aB.z);
vR = aR;
vHist = aInfo.w;
vIndustrial = uYear >= 2022.0 ? aIndustrial : 0.0;
vWallH = top - bottom - 3.0;
`;

// Colour and facade by style year: walls, windows, doors, painted base, roof material.
const FRAGMENT_HEAD = /* glsl */ `
uniform sampler2D tPlaster, tRoof, tWood, tPaving;
uniform sampler2D tModernBase, tModernCenter, tModernStation, tModernNortheast, tModernTajo, tModernWest, tModernSouth;
uniform float uRoofStation, uRoofNortheast, uRoofTajo, uRoofPhoto, uRoofWest, uRoofSouth;
float photoEdge(vec2 uv) { return smoothstep(0.0, 0.025, min(min(uv.x, uv.y), min(1.0-uv.x, 1.0-uv.y))); }
vec3 roofPhoto(vec2 uv) {
  vec3 c = texture2D(tModernBase, uv).rgb;
  vec2 p = (uv - 0.25) * 2.0;
  float w = photoEdge(p);
  if (w > 0.0) c = mix(c, texture2D(tModernCenter, p).rgb, w);
  p = (uv - vec2(0.2875, 0.625)) / 0.3; w = photoEdge(p) * uRoofWest;
  if (w > 0.0) c = mix(c, texture2D(tModernWest, p).rgb, w);
  p = (uv - vec2(0.3375, 0.0625)) / 0.3; w = photoEdge(p) * uRoofSouth;
  if (w > 0.0) c = mix(c, texture2D(tModernSouth, p).rgb, w);
  p = (uv - vec2(0.5, 0.625)) / 0.3; w = photoEdge(p) * uRoofStation;
  if (w > 0.0) c = mix(c, texture2D(tModernStation, p).rgb, w);
  p = (uv - 0.7) / 0.3; w = photoEdge(p) * uRoofNortheast;
  if (w > 0.0) c = mix(c, texture2D(tModernNortheast, p).rgb, w);
  p = (uv - 0.3375) / 0.3; w = photoEdge(p) * uRoofTajo;
  if (w > 0.0) c = mix(c, texture2D(tModernTajo, p).rgb, w);
  return c;
}
varying float vFresh;
varying vec4 vFacade;
varying vec3 vBPos;
varying vec2 vKH;
varying vec3 vR;
varying float vWallH;
varying float vHist;
varying float vIndustrial;
float gBump;
float bHash(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 15731.743); }
float bNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(bHash(i), bHash(i + vec2(1, 0)), u.x), mix(bHash(i + vec2(0, 1)), bHash(i + vec2(1, 1)), u.x), u.y);
}
float lumOf(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
vec3 bPerturb(vec3 surfPos, vec3 n, float h, float face) {
  vec3 sx = dFdx(surfPos), sy = dFdy(surfPos);
  vec3 r1 = cross(sy, n), r2 = cross(n, sx);
  float det = dot(sx, r1) * face;
  vec3 grad = sign(det) * (dFdx(h) * r1 + dFdy(h) * r2);
  return normalize(abs(det) * n - grad);
}
`;

// Colour and facade by style year. Walls: windows centred on each wall with frames, sills,
// lintel shadow, shutters, iron balconies and grilles, wooden doors, painted plinth, cornice
// and weathering. Roofs: curved tiles laid down the slope, ridge caps and eaves.
const FRAGMENT_COLOR = /* glsl */ `
float sy = vFacade.w;
float hsh = vKH.y;
bool isModern = sy > 2999.0;
float kindF = vKH.x;
bool isWall = vFacade.z > 0.5;
gBump = 0.0;

if (isWall) {
  // ---------------------------------------------------------------- walls
  vec3 wc;
  if (isModern) wc = diffuseColor.rgb;
  else if (sy < -206.0) wc = mix(vec3(0.50, 0.42, 0.32), vec3(0.62, 0.53, 0.40), hsh);
  else if (sy < 711.0) wc = vec3(0.80, 0.70, 0.54) * (0.92 + 0.1 * hsh);
  else if (sy < 1485.0) wc = vec3(0.88, 0.83, 0.71) * (0.94 + 0.08 * hsh);
  else if (sy < 1900.0) wc = vec3(0.95, 0.93, 0.88) * (0.96 + 0.05 * hsh);
  else wc = hsh > 0.82 ? vec3(0.90, 0.78, 0.58) : vec3(0.96, 0.94, 0.90);
  if (vIndustrial > 0.5) wc = mix(vec3(0.58, 0.59, 0.58), vec3(0.78, 0.76, 0.68), hsh);
  float h = vFacade.x;
  vec2 pUV = vec2(vR.x, h) / 4.0 + vec2(hsh * 9.0, 0.0);
  float pl = lumOf(texture2D(tPlaster, pUV).rgb) / 0.4;
  wc *= mix(1.0, clamp(pl, 0.7, 1.25), 0.6);
  if (!isModern && sy < 711.0) wc *= 0.82 + 0.32 * bNoise(vec2(vR.x * 1.6, h * 3.0));
  gBump = pl * 0.006;

  // Weathering: dirt at the foot, darker under the eaves, faint vertical streaks.
  float streak = bNoise(vec2(vR.x * 2.3, 0.0)) * (1.0 - smoothstep(vWallH - 3.0, vWallH, h));
  wc *= 1.0 - 0.10 * streak * (isModern ? 0.5 : 1.0);
  wc *= mix(0.62, 1.0, smoothstep(-0.3, 1.6, h));

  // Window layout by period: bay width, window half width, window chance, window top (fraction of floor).
  vec4 st = isModern ? vec4(3.4, 0.27, 0.9, 0.82)
          : sy < -206.0 ? vec4(5.0, 0.0, 0.0, 0.0)
          : sy < 711.0 ? vec4(5.5, 0.09, 0.25, 0.62)
          : sy < 1485.0 ? vec4(5.0, 0.1, 0.3, 0.66)
          : sy < 1800.0 ? vec4(4.4, 0.17, 0.62, 0.76)
          : sy < 1950.0 ? vec4(3.8, 0.2, 0.8, 0.8)
          : vec4(3.4, 0.24, 0.85, 0.8);
  // Cadastral industrial buildings: sparse high windows and loading doors, not apartment balconies.
  if (vIndustrial > 0.5) st = vec4(7.0, 0.3, 0.4, 0.86);
  float len = vR.y;
  float nb = max(1.0, floor((len - 1.2) / st.x));
  float bw = (len - 1.2) / nb;
  float uu = vR.x - 0.6;
  float col = floor(uu / bw);
  float fx = fract(uu / bw);
  float floorIx = floor(max(h, 0.0) / 3.1);
  float fy = fract(max(h, 0.0) / 3.1);
  bool inWall = uu > 0.0 && uu < len - 1.2 && len > 2.6 && h > 0.0 && h < vWallH - 0.5;
  vec2 cell = vec2(col, floorIx) + vec2(floor(vBPos.x * 0.07 + vBPos.z * 0.05));
  float r = bHash(cell);
  float hw = st.y * bw / 3.4;                 // half width in bay fraction, so windows keep their size in metres
  hw = st.y;
  bool upper = floorIx > 0.5;
  bool balcony = !isModern && sy >= 1780.0 && upper && r < 0.35;
  bool modernBalc = isModern && vIndustrial < 0.5 && upper && r > 0.6 && r < 0.78;
  float wTop = st.w;
  float wBot = balcony || modernBalc ? 0.04 : 0.34;
  vec3 col3 = wc;

  // Doors on the ground floor.
  bool doorCell = !upper && bHash(cell + 17.0) > (isModern ? 0.7 : 0.72) && sy >= 711.0;
  float dHalf = isModern ? 0.2 : 0.17;
  float dTop = isModern ? 0.72 : 0.78;
  if (inWall && doorCell && abs(fx - 0.5) < dHalf + 0.035 && fy < dTop + 0.04) {
    bool frame = abs(fx - 0.5) > dHalf || fy > dTop;
    if (frame) {
      col3 = sy < 1700.0 ? vec3(0.66, 0.58, 0.45) : wc * 0.86; // stone jambs on old houses
      gBump += 0.03;
    } else {
      vec3 wood = texture2D(tWood, vec2((fx - 0.5) * bw, fy * 3.1) / 2.0).rgb / 0.17;
      vec3 paint = r < 0.3 ? vec3(0.17, 0.27, 0.19) : (r < 0.55 ? vec3(0.36, 0.22, 0.12) : vec3(0.28, 0.19, 0.13));
      col3 = isModern && r > 0.5 ? vec3(0.22, 0.22, 0.22) * lumOf(wood) : paint * clamp(wood, 0.5, 1.6);
      col3 *= mix(0.55, 1.0, (1.0 - smoothstep(dTop - 0.12, dTop, fy))); // shadow under the lintel
      gBump -= 0.02;
    }
  } else if (inWall && st.z > 0.0 && r < st.z && abs(fx - 0.5) < hw + 0.03 && fy > wBot - 0.035 && fy < wTop + 0.035) {
    // ---- window
    bool frame = abs(fx - 0.5) > hw || fy > wTop || fy < wBot;
    if (frame) {
      col3 = isModern ? wc * 0.92 : (sy < 1485.0 ? wc * 0.9 : mix(wc, vec3(0.98, 0.97, 0.94), 0.6));
      if (fy < wBot) { col3 = vec3(0.78, 0.74, 0.68); gBump += 0.04; } // sill
      gBump += 0.02;
    } else {
      float gx = (fx - 0.5) / hw;               // -1..1 across the window
      float gy = (fy - wBot) / (wTop - wBot);   // 0..1 up the window
      vec3 sky = mix(vec3(0.08, 0.09, 0.11), vec3(0.42, 0.5, 0.6), smoothstep(0.1, 1.0, gy) * 0.55);
      vec3 glass = sky * (0.8 + 0.4 * bHash(cell + 3.0));
      // Mullions.
      if (abs(gx) < 0.05 || abs(gy - 0.62) < 0.03) glass = isModern ? vec3(0.55) : vec3(0.85, 0.83, 0.78);
      bool shutters = !isModern && sy >= 1485.0 && bHash(cell + 7.0) < 0.42;
      if (shutters) {
        float slats = 0.7 + 0.3 * step(0.5, fract(gy * 14.0));
        vec3 sc = bHash(cell + 9.0) < 0.5 ? vec3(0.15, 0.28, 0.19) : vec3(0.36, 0.23, 0.14);
        glass = sc * slats;
      }
      if (isModern && bHash(cell + 11.0) < 0.35) {
        // Roller blind down to some height.
        float down = 0.3 + 0.5 * bHash(cell + 13.0);
        if (gy > 1.0 - down) glass = vec3(0.72, 0.70, 0.64) * (0.85 + 0.15 * step(0.5, fract(gy * 30.0)));
      }
      // Lintel shadow and recess darkening at the sides.
      glass *= mix(0.45, 1.0, (1.0 - smoothstep(0.82, 1.0, gy))) * mix(0.7, 1.0, (1.0 - smoothstep(0.75, 1.0, abs(gx))));
      col3 = glass;
      gBump -= 0.05;
      // Iron balcony rail in front of the lower part.
      if (balcony && gy < 0.36) {
        float bars = step(0.78, fract(gx * 6.0));
        if (bars > 0.5 || gy > 0.32 || gy < 0.03) col3 = vec3(0.06, 0.06, 0.065);
      }
      if (modernBalc && gy < 0.36) col3 = mix(col3, vec3(0.75, 0.78, 0.8), 0.5);
      // Iron grille (reja) on ground-floor windows of old houses.
      if (!upper && !isModern && sy >= 1485.0) {
        if (step(0.82, fract(gx * 3.0)) > 0.5 || step(0.88, fract(gy * 4.0)) > 0.5) col3 = vec3(0.05);
      }
    }
  } else if (balcony && inWall && abs(fx - 0.5) < hw + 0.12 && fy > 0.0 && fy < 0.045) {
    col3 = vec3(0.55, 0.52, 0.48); // balcony slab
    gBump += 0.05;
  }

  if (!isModern && sy >= 1485.0 && h > -0.2 && h < 0.85 && col3 == wc) {
    // Painted plinth (zocalo).
    col3 = hsh < 0.33 ? vec3(0.50, 0.50, 0.48) : (hsh < 0.66 ? vec3(0.70, 0.56, 0.34) : vec3(0.40, 0.44, 0.50));
    col3 *= 0.9 + 0.2 * pl;
  }
  // Cornice and eave shadow at the top of the wall.
  if (h > vWallH - 0.35 && !isModern) { col3 = mix(col3, vec3(0.92, 0.9, 0.86), 0.5); gBump += 0.03; }
  col3 *= mix(1.0, 0.7, smoothstep(vWallH - 0.9, vWallH - 0.35, h) * (isModern ? 0.3 : 1.0));
  diffuseColor.rgb = col3;
} else if (kindF > 2.5) {
  // --------------------------------------------------------- pitched roofs
  vec2 tuv = vec2(vR.x, vR.y) / 3.6 + vec2(hsh * 5.0, 0.0);
  vec3 tile = texture2D(tRoof, tuv).rgb;
  // Clay colour per building: fresh orange to old brown, a few with lichen.
  vec3 tint = mix(vec3(1.25, 1.05, 0.95), vec3(0.85, 0.75, 0.72), hsh);
  vec3 c = tile / vec3(0.296, 0.193, 0.096) * vec3(0.42, 0.22, 0.11) * tint;
  c = mix(c, vec3(lumOf(c)) * vec3(1.0, 0.95, 0.8), bNoise(vBPos.xz * 0.5) * 0.25);
  if (!isModern && sy < -206.0) c = vec3(0.46, 0.39, 0.26) * (0.85 + 0.3 * bNoise(vBPos.xz * 2.0)); // thatch
  float ridge = 1.0 - smoothstep(0.12, 0.3, vR.y);
  c = mix(c, c * vec3(1.05, 0.95, 0.9) * (0.75 + 0.25 * step(0.5, fract(vR.x / 0.42))), ridge);
  float eave = smoothstep(vR.z - 0.25, vR.z - 0.05, vR.y);
  c *= mix(1.0, 0.55, eave);
  diffuseColor.rgb = c;
  gBump = lumOf(tile) * 0.12;
} else {
  // ------------------------------------------------------------ flat roofs
  vec3 c;
  if (vHist > 0.5 && (!isModern || hsh > 0.35)) {
    // Old town: complex footprints are tiled too; tiles laid along the longer side.
    vec3 tile = texture2D(tRoof, vBPos.xz / 3.6 + vec2(hsh * 5.0)).rgb;
    vec3 tint = mix(vec3(1.2, 1.02, 0.95), vec3(0.85, 0.75, 0.72), hsh);
    c = tile / vec3(0.296, 0.193, 0.096) * vec3(0.4, 0.21, 0.11) * tint;
    gBump = lumOf(tile) * 0.08;
  } else if (isModern) {
    // Azotea: light paving with a darker parapet colour variation.
    vec3 pv = texture2D(tPaving, vBPos.xz / 3.0).rgb / 0.185;
    c = mix(vec3(0.78, 0.74, 0.66), vec3(0.62, 0.62, 0.6), hsh) * mix(1.0, clamp(lumOf(pv), 0.6, 1.4), 0.6);
  } else {
    c = sy < -206.0 ? vec3(0.50, 0.41, 0.29) * (0.85 + 0.3 * bNoise(vBPos.xz * 1.5))
      : sy < 711.0 ? vec3(0.62, 0.33, 0.2)
      : sy < 1485.0 ? vec3(0.82, 0.77, 0.66) * (0.9 + 0.2 * bNoise(vBPos.xz * 0.8))
      : vec3(0.62, 0.33, 0.2);
  }
  diffuseColor.rgb = c;
}
if (!isWall && uRoofPhoto > 0.0) {
  // Orthographic projection preserves actual roof colour, skylights and terraces.
  // Photos contain baked lighting; keep a little material variation at close range.
  vec3 photographed = roofPhoto(vec2(vBPos.x + 2000.0, 2000.0 - vBPos.z) / 4000.0);
  diffuseColor.rgb = mix(diffuseColor.rgb, photographed, uRoofPhoto * 0.92);
  gBump *= 1.0 - uRoofPhoto * 0.85;
}
`;

export function createBuildings(data: BuildingData, exclude: (x: number, n: number) => boolean, roofTextures: Record<string, THREE.IUniform>): Buildings {
  const pos: number[] = [];
  const nor: number[] = [];
  const col: number[] = [];
  const info: number[] = [];
  const bInfo: number[] = [];
  const rInfo: number[] = [];
  const modernInfo: number[] = [];
  const index: number[] = [];
  const historicalIndex: number[] = [], presentIndex: number[] = [];
  const presentRanges: number[] = [];
  const years: number[] = [];

  const ranges: number[] = [];
  let kept = 0;
  data.parts.map((p, i) => ({ p, i })).sort((a, b) => a.p[0] - b.p[0]).forEach(({ p, i }) => {
    const [year, floors, baseDm, ringsDm, use, zone, rebuild] = p;
    const rings = ringsDm.map((flat) => {
      const pts: number[][] = [];
      for (let k = 0; k < flat.length; k += 2) pts.push([flat[k] / 10, flat[k + 1] / 10]);
      return pts;
    });
    let sx = 0;
    let sn = 0;
    for (const [x, n] of rings[0]) {
      sx += x;
      sn += n;
    }
    if (exclude(sx / rings[0].length, sn / rings[0].length)) return;
    kept++;
    years.push(year);
    const partStart = index.length;
    const roofSpans: { start: number; end: number; present: boolean }[] = [];

    const h = hash(i);
    const bottom = baseDm / 10 - Y_OFFSET - 3;
    const area = Math.abs(signedArea(rings[0]));
    const box = orientedBox(rings[0]);
    const fill = area / (4 * box.a * box.b);
    const pitched = fill > 0.62 && box.b < 14 && box.a < 32 && area > 10;
    const historicZone = zone !== "-";
    let roofMode = 0;
    if (pitched) {
      if (historicZone) roofMode = 2;
      else if (use === "2" || (use === "1" && floors <= 2 && h < 0.6)) roofMode = 2;
      else roofMode = 1;
    }

    // Modern colours (used after the rebuild year).
    const wall = new THREE.Color().setHSL(0.11 + h * 0.03, 0.25, 0.86 + h * 0.07);
    let roof: THREE.Color;
    if (use === "3") roof = new THREE.Color().setHSL(0.58, 0.08, 0.55 + h * 0.15);
    else if (!historicZone && year >= 1965 && h < 0.45) roof = new THREE.Color().setHSL(0.1, 0.06, 0.62 + h * 0.2);
    else roof = new THREE.Color().setHSL(0.04 + h * 0.03, 0.5, 0.36 + h * 0.12);

    const push = (x: number, y: number, n: number, nx: number, ny: number, nz: number, c: THREE.Color, kind: number, r: [number, number, number] = [0, 0, 0]) => {
      pos.push(x, y, -n);
      rInfo.push(...r);
      modernInfo.push(use === "3" ? 1 : 0);
      nor.push(nx, ny, nz);
      col.push(c.r, c.g, c.b);
      info.push(year, bottom, kind, historicZone ? 1 : 0);
      bInfo.push(Math.max(rebuild, year), floors, h, roofMode);
      return pos.length / 3 - 1;
    };

    // Outer ring counter-clockwise, holes clockwise (in x/north), so wall faces point outwards.
    rings.forEach((pts, ri) => {
      const a = signedArea(pts);
      if ((ri === 0 && a < 0) || (ri > 0 && a > 0)) pts.reverse();
    });
    for (const pts of rings) {
      for (let k = 0; k < pts.length; k++) {
        const [x0, n0] = pts[k];
        const [x1, n1] = pts[(k + 1) % pts.length];
        const dx = x1 - x0;
        const dn = n1 - n0;
        const len = Math.hypot(dx, dn);
        if (len < 0.05) continue;
        const nx = dn / len;
        const nz = dx / len;
        const v0 = push(x0, 0, n0, nx, 0, nz, wall, 0, [0, len, 0]);
        const v1 = push(x1, 0, n1, nx, 0, nz, wall, 0, [len, len, 0]);
        const v2 = push(x1, 0, n1, nx, 0, nz, wall, 1, [len, len, 0]);
        const v3 = push(x0, 0, n0, nx, 0, nz, wall, 1, [0, len, 0]);
        index.push(v0, v1, v2, v0, v2, v3);
      }
    }

    // Flat roof on the exact footprint.
    const contour = rings[0].map(([x, n]) => new THREE.Vector2(x, n));
    const holes = rings.slice(1).map((r) => r.map(([x, n]) => new THREE.Vector2(x, n)));
    const tris = THREE.ShapeUtils.triangulateShape(contour, holes);
    const all = [...contour, ...holes.flat()];
    const start = pos.length / 3;
    for (const v of all) push(v.x, 0, v.y, 0, 1, 0, roof, 2);
    for (const [a, b, c] of tris) {
      const A = all[a], B = all[b], C = all[c];
      const cross = (B.x - A.x) * (C.y - A.y) - (B.y - A.y) * (C.x - A.x);
      if (cross > 0) index.push(start + a, start + b, start + c);
      else index.push(start + a, start + c, start + b);
    }

    // Hip roof on the oriented box (about 24 degrees), shown according to roofMode.
    if (roofMode > 0) {
      const { cx, cn, ux, un, a, b } = box;
      const vx = -un;
      const vn = ux;
      const A = a + 0.35;
      const B = b + 0.35;
      const rise = b * 0.45;
      const P = (su: number, sv: number): [number, number] => [cx + ux * su + vx * sv, cn + un * su + vn * sv];
      const e1 = P(-A, -B), e2 = P(A, -B), e3 = P(A, B), e4 = P(-A, B);
      const r1 = P(-(a - b), 0), r2 = P(a - b, 0);
      // Slope length from ridge to eave, for tile UVs that run down the slope.
      const slope = Math.hypot(B, rise);
      // Each vertex: plan point, height, coordinate along the eave, plan distance from the ridge.
      const face = (pts: Array<[[number, number], number, number, number]>) => {
        // Normal from the first three points (world: X = x, Y = y, Z = -n).
        const w = pts.map(([[x, n], y]) => new THREE.Vector3(x, y, -n));
        const nrm = new THREE.Vector3().subVectors(w[1], w[0]).cross(new THREE.Vector3().subVectors(w[2], w[0])).normalize();
        if (nrm.y < 0) {
          pts.reverse();
          nrm.negate();
        }
        const ids = pts.map(([[x, n], y, u, d]) => push(x, y, n, nrm.x, nrm.y, nrm.z, roof, 3, [u, (d / B) * slope, slope]));
        const oldStart = index.length;
        for (let k = 1; k < ids.length - 1; k++) index.push(ids[0], ids[k], ids[k + 1]);
        roofSpans.push({ start: oldStart, end: index.length, present: false });
        const presentStart = index.length;
        // Clip every cadastral roof triangle (including courtyard holes) to this slope.
        // This preserves an L-shaped eave instead of bridging it with a bounding box.
        const boundary = pts.map(p => p[0]);
        const orientation = signedArea(boundary) >= 0 ? 1 : -1;
        for (const triangle of tris) {
          let polygon: number[][] = triangle.map(i => [all[i].x, all[i].y]);
          for (let edge = 0; edge < boundary.length && polygon.length; edge++) {
            const A = boundary[edge], B = boundary[(edge+1)%boundary.length];
            const distance = (p: number[]) => orientation*((B[0]-A[0])*(p[1]-A[1])-(B[1]-A[1])*(p[0]-A[0]));
            const clipped: number[][] = [];
            for (let k=0;k<polygon.length;k++) {
              const P=polygon[k], Q=polygon[(k+1)%polygon.length], dp=distance(P), dq=distance(Q);
              if(dp>=-1e-7)clipped.push(P);
              if((dp>=0)!==(dq>=0)) {
                const t=dp/(dp-dq);clipped.push([P[0]+(Q[0]-P[0])*t,P[1]+(Q[1]-P[1])*t]);
              }
            }
            polygon=clipped;
          }
          if(polygon.length<3 || Math.abs(signedArea(polygon))<0.0001)continue;
          if(signedArea(polygon)<0)polygon.reverse();
          const [origin, height]=pts[0];
          const clippedIds=polygon.map(([x,n]) => {
            const y=height-(nrm.x*(x-origin[0])-nrm.z*(n-origin[1]))/nrm.y;
            return push(x,y,n,nrm.x,nrm.y,nrm.z,roof,4,[x,n,slope]);
          });
          for(let k=1;k<clippedIds.length-1;k++)index.push(clippedIds[0],clippedIds[k],clippedIds[k+1]);
        }
        roofSpans.push({ start: presentStart, end: index.length, present: true });
      };
      const ra = a - b;
      face([[e1, 0, -A, B], [e2, 0, A, B], [r2, rise, ra, 0], [r1, rise, -ra, 0]]);
      face([[e3, 0, A, B], [e4, 0, -A, B], [r1, rise, -ra, 0], [r2, rise, ra, 0]]);
      face([[e2, 0, -B, B], [e3, 0, B, B], [r2, rise, 0, 0]]);
      face([[e4, 0, B, B], [e1, 0, -B, B], [r1, rise, 0, 0]]);
    }
    let cursor = partStart;
    for (const span of roofSpans) {
      for (; cursor < span.start; cursor++) { historicalIndex.push(index[cursor]); presentIndex.push(index[cursor]); }
      const destination = span.present ? presentIndex : historicalIndex;
      for (; cursor < span.end; cursor++) destination.push(index[cursor]);
    }
    for (; cursor < index.length; cursor++) { historicalIndex.push(index[cursor]); presentIndex.push(index[cursor]); }
    ranges.push(historicalIndex.length);
    presentRanges.push(presentIndex.length);
  });

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  geo.setAttribute("aInfo", new THREE.Float32BufferAttribute(info, 4));
  geo.setAttribute("aB", new THREE.Float32BufferAttribute(bInfo, 4));
  geo.setAttribute("aIndustrial", new THREE.Float32BufferAttribute(modernInfo, 1));
  geo.setAttribute("aR", new THREE.Float32BufferAttribute(rInfo, 3));
  const historicalElements = new THREE.Uint32BufferAttribute(historicalIndex, 1);
  const presentElements = new THREE.Uint32BufferAttribute(presentIndex, 1);
  geo.setIndex(historicalElements);
  geo.computeBoundingSphere();

  const uniforms = {
    ...roofTextures,
    uRoofPhoto: { value: 0 },
    uYear: { value: 2026 },
    uGrow: { value: 5 },
    tPlaster: { value: pbr("plaster").map },
    tRoof: { value: pbr("roof").map },
    tWood: { value: pbr("wood").map },
    tPaving: { value: pbr("paving").map },
  };
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
  mat.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, uniforms);
    s.vertexShader = s.vertexShader
      .replace("#include <common>", "#include <common>" + VERTEX_HEAD)
      .replace("#include <begin_vertex>", "#include <begin_vertex>" + VERTEX_BODY);
    s.fragmentShader = s.fragmentShader
      .replace("#include <common>", "#include <common>" + FRAGMENT_HEAD)
      .replace("#include <color_fragment>", "#include <color_fragment>" + FRAGMENT_COLOR)
      .replace("#include <normal_fragment_maps>", "#include <normal_fragment_maps>\nnormal = bPerturb(-vViewPosition, normal, gBump * (1.0 - smoothstep(100.0, 650.0, length(vViewPosition))), faceDirection);")
      .replace(
        "#include <emissivemap_fragment>",
        "#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(1.0, 0.55, 0.18) * vFresh * 0.9;",
      );
  };
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  depth.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, uniforms);
    s.vertexShader = s.vertexShader
      .replace("#include <common>", "#include <common>" + VERTEX_HEAD)
      .replace("#include <begin_vertex>", "#include <begin_vertex>" + VERTEX_BODY);
  };

  const mesh = new THREE.Mesh(geo, mat);
  mesh.customDepthMaterial = depth;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;

  const sorted = Float32Array.from(years).sort();
  console.info(`buildings: ${kept} parts`);
  return {
    mesh,
    years: sorted,
    setYear(year, growYears) {
      const visible = countUpTo(sorted, year);
      const present = year >= 2022;
      // Submit only the active roof form; historical periods pay no added triangle cost.
      const elements = present ? presentElements : historicalElements;
      if (geo.index !== elements) geo.setIndex(elements);
      geo.setDrawRange(0, visible ? (present ? presentRanges : ranges)[visible - 1] : 0);
      uniforms.uYear.value = year;
      uniforms.uRoofPhoto.value = THREE.MathUtils.smoothstep(year, 2022, 2023);
      uniforms.uGrow.value = Math.max(growYears, 0.3);
    },
  };
}

export function countUpTo(sorted: Float32Array, year: number): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] <= year) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
