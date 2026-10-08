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
attribute vec4 aInfo; // appear year, bottom Y, kind (0 wall foot, 1 wall top, 2 flat roof, 3 pitched roof), unused
attribute vec4 aB;    // rebuild year, modern floors, hash, roof mode (0 none, 1 old form only, 2 always)
uniform float uYear;
uniform float uGrow;
varying float vFresh;
varying vec4 vFacade; // height above ground, position along the wall, wall (1) or roof (0), style year
varying vec3 vBPos;
varying vec2 vKH;     // kind, hash

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
    yy = show ? top + transformed.y : bottom - 1.0;
  }
  transformed.y = mix(bottom, yy, g);
}
vFresh = g > 0.0 ? 1.0 - clamp((uYear - aInfo.x) / (uGrow * 5.0), 0.0, 1.0) : 0.0;
vFacade = vec4(transformed.y - bottom - 3.0, dot(position.xz, vec2(-normal.z, normal.x)), 1.0 - abs(normal.y), modern ? 3000.0 : uYear);
vBPos = position;
vKH = vec2(kind, aB.z);
`;

// Colour and facade by style year: walls, windows, doors, painted base, roof material.
const FRAGMENT_HEAD = /* glsl */ `
uniform sampler2D tPlaster, tRoof;
varying float vFresh;
varying vec4 vFacade;
varying vec3 vBPos;
varying vec2 vKH;
float bHash(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 15731.743); }
float bNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(bHash(i), bHash(i + vec2(1, 0)), u.x), mix(bHash(i + vec2(0, 1)), bHash(i + vec2(1, 1)), u.x), u.y);
}
`;
const FRAGMENT_COLOR = /* glsl */ `
float sy = vFacade.w;
float hsh = vKH.y;
bool isModern = sy > 2999.0;
float kindF = vKH.x;
bool isWall = vFacade.z > 0.5;
vec3 terracotta = mix(vec3(0.60, 0.30, 0.19), vec3(0.74, 0.43, 0.28), hsh);

if (!isModern) {
  if (isWall) {
    vec3 wc;
    if (sy < -206.0) wc = mix(vec3(0.50, 0.42, 0.32), vec3(0.62, 0.53, 0.40), hsh);       // stone and adobe
    else if (sy < 711.0) wc = vec3(0.80, 0.70, 0.54) * (0.92 + 0.1 * hsh);                // Roman ochre plaster
    else if (sy < 1485.0) wc = vec3(0.88, 0.83, 0.71) * (0.94 + 0.08 * hsh);              // lime over earth
    else if (sy < 1900.0) wc = vec3(0.95, 0.93, 0.88) * (0.96 + 0.05 * hsh);              // whitewash
    else wc = hsh > 0.82 ? vec3(0.90, 0.78, 0.58) : vec3(0.96, 0.94, 0.90);                // whitewash, some ochre fronts
    // Stone texture showing through on ancient walls.
    if (sy < 711.0) wc *= 0.85 + 0.3 * bNoise(vec2(vFacade.y * 1.6, vFacade.x * 3.0));
    diffuseColor.rgb = wc;
  } else if (kindF > 2.5) {
    diffuseColor.rgb = sy < -206.0 ? vec3(0.46, 0.39, 0.26) * (0.85 + 0.3 * bNoise(vBPos.xz * 2.0)) : terracotta;
  } else {
    // Flat roofs: earth and branches (Iberian), tiles (Roman), lime azoteas (medieval), then tiles.
    diffuseColor.rgb = sy < -206.0 ? vec3(0.50, 0.41, 0.29) * (0.85 + 0.3 * bNoise(vBPos.xz * 1.5))
      : sy < 711.0 ? terracotta * 0.9
      : sy < 1485.0 ? vec3(0.80, 0.74, 0.62)
      : terracotta * 0.92;
  }
}

// Photographed textures: plaster on walls (brightness only), clay tiles on tiled roofs.
if (isWall) {
  vec3 pl = texture2D(tPlaster, vec2(vFacade.y, vFacade.x) / 4.0).rgb;
  diffuseColor.rgb *= clamp(pl / vec3(0.433, 0.395, 0.334), 0.6, 1.4) * 0.5 + 0.5;
} else if (diffuseColor.r > diffuseColor.b * 1.35) {
  vec3 rt = texture2D(tRoof, vBPos.xz / 2.6 + vec2(hsh * 7.0)).rgb;
  diffuseColor.rgb = mix(diffuseColor.rgb, rt / vec3(0.296, 0.193, 0.096) * diffuseColor.rgb, 0.85);
}
if (isWall) {
  float h = vFacade.x;
  float floorIx = floor(h / 3.1);
  float fy = fract(h / 3.1);
  // Window layout by period: [bay width, half width of a window, chance of a window, top of the window]
  vec4 st = isModern ? vec4(3.4, 0.26, 0.88, 0.8)
          : sy < -206.0 ? vec4(5.0, 0.0, 0.0, 0.0)
          : sy < 711.0 ? vec4(5.5, 0.08, 0.18, 0.62)
          : sy < 1485.0 ? vec4(5.0, 0.09, 0.28, 0.66)
          : sy < 1800.0 ? vec4(4.4, 0.16, 0.55, 0.74)
          : sy < 1950.0 ? vec4(3.8, 0.2, 0.75, 0.8)
          : vec4(3.4, 0.24, 0.85, 0.8);
  float col = floor(vFacade.y / st.x);
  float fx = fract(vFacade.y / st.x);
  vec2 cell = vec2(col, floorIx) + floor(vBPos.xz * 0.05);
  float r = bHash(cell);
  bool door = floorIx < 0.5 && h > 0.0 && fy < 0.7 && abs(fx - 0.5) < 0.16 && bHash(cell + 17.0) > 0.78;
  bool win = h > 0.4 && abs(fx - 0.5) < st.y && fy > 0.34 && fy < (floorIx < 0.5 && !isModern ? st.w - 0.04 : st.w) && r < st.z;
  if (door) {
    diffuseColor.rgb = sy < 711.0 ? vec3(0.12, 0.10, 0.08) : vec3(0.30, 0.19, 0.11) * (0.8 + 0.4 * r);
  } else if (win) {
    vec3 glass = vec3(0.10, 0.11, 0.13);
    if (!isModern && sy >= 1485.0) {
      // Iron grilles on ground floors, green or brown shutters above.
      float bars = step(0.85, fract((fx - 0.5) / max(st.y, 0.01) * 2.5));
      if (floorIx < 0.5) glass = mix(glass, vec3(0.05), bars);
      else if (r < st.z * 0.35) glass = r < st.z * 0.18 ? vec3(0.16, 0.30, 0.20) : vec3(0.33, 0.21, 0.13);
    } else if (isModern && r > 0.8) {
      glass = r > 0.9 ? vec3(0.16, 0.30, 0.20) : vec3(0.33, 0.21, 0.13);
    }
    diffuseColor.rgb = glass;
  } else if (!isModern && sy >= 1485.0 && h > -0.2 && h < 0.85) {
    // Painted plinth (zocalo), typical of Andalusian houses.
    vec3 z = hsh < 0.33 ? vec3(0.52, 0.52, 0.50) : (hsh < 0.66 ? vec3(0.72, 0.58, 0.36) : vec3(0.42, 0.46, 0.52));
    diffuseColor.rgb = z;
  }
  diffuseColor.rgb *= mix(0.62, 1.0, smoothstep(0.0, 2.2, h));
}
`;

export function createBuildings(data: BuildingData, exclude: (x: number, n: number) => boolean = () => false): Buildings {
  const pos: number[] = [];
  const nor: number[] = [];
  const col: number[] = [];
  const info: number[] = [];
  const bInfo: number[] = [];
  const index: number[] = [];
  const years: number[] = [];

  let kept = 0;
  data.parts.forEach((p, i) => {
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

    const push = (x: number, y: number, n: number, nx: number, ny: number, nz: number, c: THREE.Color, kind: number) => {
      pos.push(x, y, -n);
      nor.push(nx, ny, nz);
      col.push(c.r, c.g, c.b);
      info.push(year, bottom, kind, 0);
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
        const v0 = push(x0, 0, n0, nx, 0, nz, wall, 0);
        const v1 = push(x1, 0, n1, nx, 0, nz, wall, 0);
        const v2 = push(x1, 0, n1, nx, 0, nz, wall, 1);
        const v3 = push(x0, 0, n0, nx, 0, nz, wall, 1);
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
      const face = (pts: Array<[[number, number], number]>) => {
        // Normal from the first three points (world: X = x, Y = y, Z = -n).
        const w = pts.map(([[x, n], y]) => new THREE.Vector3(x, y, -n));
        const nrm = new THREE.Vector3().subVectors(w[1], w[0]).cross(new THREE.Vector3().subVectors(w[2], w[0])).normalize();
        if (nrm.y < 0) {
          pts.reverse();
          nrm.negate();
        }
        const ids = pts.map(([[x, n], y]) => push(x, y, n, nrm.x, nrm.y, nrm.z, roof, 3));
        for (let k = 1; k < ids.length - 1; k++) index.push(ids[0], ids[k], ids[k + 1]);
      };
      face([[e1, 0], [e2, 0], [r2, rise], [r1, rise]]);
      face([[e3, 0], [e4, 0], [r1, rise], [r2, rise]]);
      face([[e2, 0], [e3, 0], [r2, rise]]);
      face([[e4, 0], [e1, 0], [r1, rise]]);
    }
  });

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  geo.setAttribute("aInfo", new THREE.Float32BufferAttribute(info, 4));
  geo.setAttribute("aB", new THREE.Float32BufferAttribute(bInfo, 4));
  geo.setIndex(index);
  geo.computeBoundingSphere();

  const uniforms = { uYear: { value: 2026 }, uGrow: { value: 5 }, tPlaster: { value: pbr("plaster").map }, tRoof: { value: pbr("roof").map } };
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
  mat.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, uniforms);
    s.vertexShader = s.vertexShader
      .replace("#include <common>", "#include <common>" + VERTEX_HEAD)
      .replace("#include <begin_vertex>", "#include <begin_vertex>" + VERTEX_BODY);
    s.fragmentShader = s.fragmentShader
      .replace("#include <common>", "#include <common>" + FRAGMENT_HEAD)
      .replace("#include <color_fragment>", "#include <color_fragment>" + FRAGMENT_COLOR)
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
      uniforms.uYear.value = year;
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
