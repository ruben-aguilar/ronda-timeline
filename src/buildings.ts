import * as THREE from "three";
import { BuildingData, Y_OFFSET } from "./data";

const FLOOR_H = 3.1;

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

function partColors(year: number, use: string, i: number): { wall: THREE.Color; roof: THREE.Color } {
  const r = hash(i);
  const wall = new THREE.Color().setHSL(0.11 + r * 0.03, 0.25, 0.86 + r * 0.07);
  let roof: THREE.Color;
  if (use === "3") {
    roof = new THREE.Color().setHSL(0.58, 0.08, 0.55 + r * 0.15); // industrial sheds
  } else if (year >= 1965 && r < 0.45) {
    roof = new THREE.Color().setHSL(0.1, 0.06, 0.62 + r * 0.2); // flat modern roofs
  } else {
    roof = new THREE.Color().setHSL(0.04 + r * 0.03, 0.5, 0.36 + r * 0.12); // terracotta tiles
  }
  if (year < 1485) wall.offsetHSL(0.0, 0.05, -0.04); // medieval walls: a little earthier
  return { wall, roof };
}

const VERTEX_HEAD = `
attribute vec3 aInfo; // year, bottom Y, isTop
uniform float uYear;
uniform float uGrow;
varying float vFresh;
`;
const VERTEX_BODY = `
float g = clamp((uYear - aInfo.x) / uGrow, 0.0, 1.0);
if (aInfo.z > 0.5) transformed.y = mix(aInfo.y, transformed.y, g);
vFresh = g > 0.0 ? 1.0 - clamp((uYear - aInfo.x) / (uGrow * 5.0), 0.0, 1.0) : 0.0;
`;

export function createBuildings(data: BuildingData): Buildings {
  const pos: number[] = [];
  const nor: number[] = [];
  const col: number[] = [];
  const info: number[] = [];
  const index: number[] = [];
  const years = new Float32Array(data.parts.length);

  const push = (x: number, y: number, z: number, nx: number, ny: number, nz: number, c: THREE.Color, yr: number, bottom: number, top: number) => {
    pos.push(x, y, z);
    nor.push(nx, ny, nz);
    col.push(c.r, c.g, c.b);
    info.push(yr, bottom, top);
    return pos.length / 3 - 1;
  };

  data.parts.forEach((p, i) => {
    const [year, floors, baseDm, ringsDm, use] = p;
    years[i] = year;
    const base = baseDm / 10 - Y_OFFSET;
    const bottom = base - 3;
    const top = base + floors * FLOOR_H + (hash(i + 7) - 0.5) * 0.6;
    const { wall, roof } = partColors(year, use, i);

    const rings = ringsDm.map((flat) => {
      const pts: number[][] = [];
      for (let k = 0; k < flat.length; k += 2) pts.push([flat[k] / 10, flat[k + 1] / 10]);
      return pts;
    });
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
        const shade = wall.clone().multiplyScalar(0.97 + hash(i * 31 + k) * 0.03);
        const v0 = push(x0, bottom, -n0, nx, 0, nz, shade, year, bottom, 0);
        const v1 = push(x1, bottom, -n1, nx, 0, nz, shade, year, bottom, 0);
        const v2 = push(x1, top, -n1, nx, 0, nz, shade, year, bottom, 1);
        const v3 = push(x0, top, -n0, nx, 0, nz, shade, year, bottom, 1);
        index.push(v0, v1, v2, v0, v2, v3);
      }
    }

    const contour = rings[0].map(([x, n]) => new THREE.Vector2(x, n));
    const holes = rings.slice(1).map((r) => r.map(([x, n]) => new THREE.Vector2(x, n)));
    const tris = THREE.ShapeUtils.triangulateShape(contour, holes);
    const all = [...contour, ...holes.flat()];
    const startRoof = pos.length / 3;
    for (const v of all) push(v.x, top, -v.y, 0, 1, 0, roof, year, bottom, 1);
    for (const [a, b, c] of tris) {
      // Keep roof triangles counter-clockwise seen from above.
      const A = all[a], B = all[b], C = all[c];
      const cross = (B.x - A.x) * (C.y - A.y) - (B.y - A.y) * (C.x - A.x);
      if (cross > 0) index.push(startRoof + a, startRoof + b, startRoof + c);
      else index.push(startRoof + a, startRoof + c, startRoof + b);
    }
  });

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  geo.setAttribute("aInfo", new THREE.Float32BufferAttribute(info, 3));
  geo.setIndex(index);
  geo.computeBoundingSphere();

  const uniforms = { uYear: { value: 2026 }, uGrow: { value: 5 } };
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
  mat.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, uniforms);
    s.vertexShader = s.vertexShader
      .replace("#include <common>", "#include <common>" + VERTEX_HEAD)
      .replace("#include <begin_vertex>", "#include <begin_vertex>" + VERTEX_BODY);
    s.fragmentShader = s.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying float vFresh;")
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

  years.sort();
  return {
    mesh,
    years,
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
