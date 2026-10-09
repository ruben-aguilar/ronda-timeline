import * as THREE from "three";
import { Dem, Y_OFFSET } from "./data";
import { pbr } from "./textures";
import { MODERN_PHOTO_GLSL } from "./modern-photo";

// Texture keyframes by year. Before 1935 the terrain uses the "historic" texture: the 2024
// photo with the town replaced by countryside (scripts/make_landscape.py).
const PHOTO_KEYS: Array<[number, [number, number, number, number, number]]> = [
  // year, weights: [historic, 1956, 1980, 2004, 2024]
  [1935, [1, 0, 0, 0, 0]],
  [1956, [0, 1, 0, 0, 0]],
  [1977, [0, 0, 1, 0, 0]],
  [2004, [0, 0, 0, 1, 0]],
  [2020, [0, 0, 0, 0, 1]],
];

export function photoWeights(year: number): [number, number, number, number, number] {
  if (year <= PHOTO_KEYS[0][0]) return PHOTO_KEYS[0][1];
  for (let i = 1; i < PHOTO_KEYS.length; i++) {
    const [y1, w1] = PHOTO_KEYS[i];
    if (year <= y1) {
      const [y0, w0] = PHOTO_KEYS[i - 1];
      const t = (year - y0) / (y1 - y0);
      return w0.map((v, k) => v + (w1[k] - v) * t) as [number, number, number, number, number];
    }
  }
  return PHOTO_KEYS[PHOTO_KEYS.length - 1][1];
}

export interface Terrain {
  mesh: THREE.Group;
  roofTextures: Record<string, THREE.IUniform>;
  update(camera: THREE.Camera): boolean;
  setYear(year: number): void;
}

export const NOISE_GLSL = /* glsl */ `
float tHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float tNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(tHash(i), tHash(i + vec2(1, 0)), u.x), mix(tHash(i + vec2(0, 1)), tHash(i + vec2(1, 1)), u.x), u.y);
}
float tFbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { s += a * tNoise(p); p *= 2.03; a *= 0.5; }
  return s;
}
vec3 tPerturb(vec3 surfPos, vec3 n, vec2 dHdxy, float face) {
  vec3 sx = normalize(dFdx(surfPos));
  vec3 sy = normalize(dFdy(surfPos));
  vec3 r1 = cross(sy, n);
  vec3 r2 = cross(n, sx);
  float det = dot(sx, r1) * face;
  vec3 grad = sign(det) * (dHdxy.x * r1 + dHdxy.y * r2);
  return normalize(abs(det) * n - grad);
}
`;

export function createTerrain(dem: Dem, loader: THREE.TextureLoader, anisotropy: number, invalidate: () => void): Terrain {
  const tex = (name: string, srgb = true) => {
    const t = loader.load(`textures/${name}`);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = Math.min(anisotropy, 8);
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    return t;
  };
  const uniforms = {
    tHist: { value: tex("historic.webp") },
    t1956: { value: tex("ortho_1956.webp") },
    t1980: { value: tex("ortho_1980.webp") },
    t2004: { value: tex("ortho_2004.webp") },
    t2024: { value: tex("ortho_2024.webp") },
    t2024c: { value: tex("ortho_2024_center.webp") },
    tMask: { value: tex("urban_mask.png", false) },
    tCliff: { value: pbr("cliff").map },
    uW: { value: new THREE.Vector4(0, 0, 0, 0) },
    uHist: { value: 1 },
    uWild: { value: 0 },
    tNortheast: { value: null as THREE.Texture | null },
    uNortheast: { value: 0 },
    tStation: { value: null as THREE.Texture | null },
    uStation: { value: 0 },
    tWest: { value: null as THREE.Texture | null },
    uWest: { value: 0 },
    tSouth: { value: null as THREE.Texture | null },
    uSouth: { value: 0 },
    tTajo: { value: null as THREE.Texture | null },
    uTajo: { value: 0 },
  };
  const roofTextures = { tModernBase: uniforms.t2024, tModernCenter: uniforms.t2024c,
      tModernWest: uniforms.tWest, tModernSouth: uniforms.tSouth, uRoofWest: uniforms.uWest, uRoofSouth: uniforms.uSouth,
      tModernStation: uniforms.tStation, tModernNortheast: uniforms.tNortheast, tModernTajo: uniforms.tTajo,
      uRoofStation: uniforms.uStation, uRoofNortheast: uniforms.uNortheast, uRoofTajo: uniforms.uTajo };
  const details = [
    { name: "west", west: -850, south: 500, distance: 650, texture: uniforms.tWest, weight: uniforms.uWest, requested: false, ready: false },
    { name: "south", west: -650, south: -1750, distance: 650, texture: uniforms.tSouth, weight: uniforms.uSouth, requested: false, ready: false },
    { name: "northeast", west: 800, south: 800, distance: 1300, texture: uniforms.tNortheast, weight: uniforms.uNortheast, requested: false, ready: false },
    { name: "station", west: 0, south: 500, distance: 900, texture: uniforms.tStation, weight: uniforms.uStation, requested: false, ready: false },
    { name: "tajo", west: -650, south: -650, distance: 650, texture: uniforms.tTajo, weight: uniforms.uTajo, requested: false, ready: false },
  ];
  let detailYear = 0;
  let currentYear = 0;

  const mat = new THREE.MeshStandardMaterial({ roughness: 0.93, metalness: 0 });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms, roofTextures);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec2 vTUv;\nvarying float vUp;\nvarying vec3 vWPos;\nvarying vec3 vTN;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvTUv = uv;\nvUp = normal.y;\nvWPos = position;\nvTN = normal;");
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
varying vec2 vTUv;
varying float vUp;
varying vec3 vWPos;
uniform sampler2D tHist, t1956, t1980, t2004, tMask, tCliff;
varying vec3 vTN;
float gCliffL;
uniform vec4 uW;
uniform float uHist, uWild;
float gSteep, gStrata, gDetail;
${NOISE_GLSL}
${MODERN_PHOTO_GLSL}`,
      )
      .replace(
        "#include <map_fragment>",
        /* glsl */ `
vec2 uv = vTUv;
float dist = length(vViewPosition);
// Steepness from the triangle itself (derivatives), so cliff tops do not inherit the flat
// plateau's averaged vertex normals.
vec3 faceN = normalize(cross(dFdx(vWPos), dFdy(vWPos)));
gSteep = 1.0 - smoothstep(0.6, 0.9, min(vUp, abs(faceN.y)));

// 2024: a sharper photo for the central 2 x 2 km.
vec3 p2024 = vec3(0.0);
if (uW.w > 0.0) {
p2024 = modernPhoto(uv);

}
vec3 hist = vec3(0.0);
if (uHist > 0.0) {
hist = texture2D(tHist, uv).rgb;
float m = texture2D(tMask, uv).r;
// Where the town was painted out, add field and scrub detail so it does not look blurry.
float fieldN = tFbm(vWPos.xz * 0.06);
hist *= mix(1.0, 0.86 + 0.28 * tNoise(vWPos.xz * 0.9) * fieldN, m);
// Prehistory: more wild scrub and holm-oak woodland.
vec3 wood = vec3(0.20, 0.25, 0.13) * (0.75 + 0.6 * tFbm(vWPos.xz * 0.045));
hist = mix(hist, wood, uWild * 0.6 * smoothstep(0.35, 0.75, tFbm(vWPos.xz * 0.012)) * (1.0 - gSteep));

}
vec3 p1956 = vec3(0.0), p1980 = vec3(0.0), p2004 = vec3(0.0);
if (uW.x > 0.0) p1956 = texture2D(t1956, uv).rgb * vec3(1.07, 0.98, 0.83);
if (uW.y > 0.0) p1980 = texture2D(t1980, uv).rgb * vec3(1.04, 1.0, 0.92);
if (uW.z > 0.0) p2004 = texture2D(t2004, uv).rgb;
vec3 col = hist * uHist + p1956 * uW.x + p1980 * uW.y + p2004 * uW.z + p2024 * uW.w;

// Cliffs: photos smear on steep faces, so draw layered limestone there.
gStrata = 0.5; gCliffL = 1.0;
if (gSteep > 0.01) {
gStrata = tFbm(vec2(vWPos.y * 0.42 + tFbm(vWPos.xz * 0.015) * 5.0, (vWPos.x + vWPos.z) * 0.01));
// Photographed rock (Poly Haven "cliff_side"), projected on the two vertical planes. Only its
// brightness is used, so the colour stays the grey-ochre of Ronda's sandstone.
vec3 an = abs(faceN);
vec2 wgt = an.xz / max(an.x + an.z, 1e-3);
float lumX = dot(texture2D(tCliff, vec2(vWPos.z, vWPos.y) / 26.0).rgb, vec3(0.333));
float lumZ = dot(texture2D(tCliff, vec2(vWPos.x, vWPos.y) / 26.0).rgb, vec3(0.333));
float lumN = dot(texture2D(tCliff, vec2(vWPos.x, vWPos.y) / 7.0).rgb, vec3(0.333));
gCliffL = (lumX * wgt.x + lumZ * wgt.y) / 0.113 * 0.75 + lumN / 0.113 * 0.25;
vec3 rock = mix(vec3(0.40, 0.35, 0.29), vec3(0.68, 0.61, 0.50), gStrata * 0.5 + 0.25) * clamp(gCliffL, 0.35, 1.7);
float green = clamp((col.g - col.r) * 5.0 + 0.1, 0.0, 1.0);
col = mix(col, rock, clamp(gSteep * (1.0 - green * 0.55 * (1.0 - gSteep)) * 1.05, 0.0, 1.0));

}
float lumC = dot(col, vec3(0.299, 0.587, 0.114));
col = mix(vec3(lumC), col, 1.04);
col = pow(col, vec3(1.02));
// Fine grain close to the camera.
gDetail = 1.0 - smoothstep(250.0, 1400.0, dist);
col *= 1.0 + (tNoise(vWPos.xz * 1.7) - 0.5) * 0.14 * gDetail;
diffuseColor.rgb *= col;
`,
      )
      .replace(
        "#include <normal_fragment_maps>",
        /* glsl */ `#include <normal_fragment_maps>
float hB = tNoise(vWPos.xz * 0.7) * 0.6 + tNoise(vWPos.xz * 2.6) * 0.25 + gSteep * (gStrata * 0.22 + gCliffL * 0.12);
normal = tPerturb(-vViewPosition, normal, vec2(dFdx(hB), dFdy(hB)) * gDetail * 0.32, faceDirection);`,
      )
      .replace(
        "#include <fog_fragment>",
        `#include <fog_fragment>
// Preserve outskirts: soften only the final 60 m, not the last 400 m.
float edge = smoothstep(0.485, 0.5, max(abs(vTUv.x - 0.5), abs(vTUv.y - 0.5)));
gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, edge);`,
      );
  };

  // Tiles retain the original 5 m DEM near the camera. Skirts cover LOD seams.
  const mesh = new THREE.Group();
  mesh.name = "Terrain tiles";
  const tiles: THREE.LOD[] = [];
  const { rows, cols, cell } = dem;
  const half = dem.size / 2;
  const height = (r: number, c: number) => dem.h[Math.max(0, Math.min(rows - 1, r)) * cols + Math.max(0, Math.min(cols - 1, c))];
  for (let r0 = 0; r0 < rows - 1; r0 += 100) {
    for (let c0 = 0; c0 < cols - 1; c0 += 100) {
      const r1 = Math.min(r0 + 100, rows - 1), c1 = Math.min(c0 + 100, cols - 1);
      const cx = -half + ((c0 + c1) / 2 + 0.5) * cell;
      const cz = -half + ((r0 + r1) / 2 + 0.5) * cell;
      const lod = new THREE.LOD();
      lod.position.set(cx, height(Math.round((r0 + r1) / 2), Math.round((c0 + c1) / 2)) - Y_OFFSET, cz);
      lod.autoUpdate = false;
      for (const [step, distance] of [[1, 0], [2, 750], [4, 1500], [8, 2600]]) {
        const rs: number[] = [], cs: number[] = [];
        for (let r = r0; r < r1; r += step) rs.push(r);
        for (let c = c0; c < c1; c += step) cs.push(c);
        rs.push(r1); cs.push(c1);
        const pos: number[] = [], uv: number[] = [], normals: number[] = [], indices: number[] = [];
        const normal = new THREE.Vector3();
        for (const r of rs) for (const c of cs) {
          pos.push(-half + (c + 0.5) * cell - cx, height(r, c) - Y_OFFSET - lod.position.y, -half + (r + 0.5) * cell - cz);
          uv.push((c + 0.5) / cols, 1 - (r + 0.5) / rows);
          normal.set(height(r, c - 1) - height(r, c + 1), 2 * cell, height(r - 1, c) - height(r + 1, c)).normalize();
          normals.push(normal.x, normal.y, normal.z);
        }
        const w = cs.length, h = rs.length;
        for (let r = 0; r < h - 1; r++) for (let c = 0; c < w - 1; c++) {
          const a = r * w + c;
          indices.push(a, a + w, a + 1, a + 1, a + w, a + w + 1);
        }
        const edge = [
          ...Array.from({length: w}, (_, c) => c),
          ...Array.from({length: h - 1}, (_, r) => (r + 1) * w + w - 1),
          ...Array.from({length: w - 1}, (_, c) => h * w - 2 - c),
          ...Array.from({length: h - 2}, (_, r) => (h - 2 - r) * w),
        ];
        const start = pos.length / 3;
        edge.forEach((i) => {
          pos.push(pos[i * 3], pos[i * 3 + 1] - 12, pos[i * 3 + 2]);
          uv.push(uv[i * 2], uv[i * 2 + 1]);
          normals.push(...normals.slice(i * 3, i * 3 + 3));
        });
        edge.forEach((a, i) => {
          const j = (i + 1) % edge.length, b = edge[j];
          indices.push(a, b, start + i, b, start + j, start + i);
        });
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
        geo.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
        geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
        geo.setIndex(indices);
        geo.computeBoundingSphere();
        const tile = new THREE.Mesh(geo, mat);
        tile.receiveShadow = tile.castShadow = true;
        lod.addLevel(tile, distance, 0.12);
      }
      tiles.push(lod);
      mesh.add(lod);
    }
  }
  // Shader detail uses world coordinates, independent of the tile's origin.
  const compile = mat.onBeforeCompile;
  mat.onBeforeCompile = function(shader, renderer) {
    compile.call(this, shader, renderer);
    shader.vertexShader = shader.vertexShader.replace("vWPos = position;", "vWPos = (modelMatrix * vec4(position, 1.0)).xyz;");
  };

  return {
    mesh,
    // Reuse the terrain's images: no duplicate downloads or GPU textures for roofs.
    roofTextures,
    update(camera) {
      mesh.updateMatrixWorld();
      let changed = false;
      for (const detail of details) {
        const dx = Math.max(detail.west - camera.position.x, 0, camera.position.x - detail.west - 1200);
        const dn = Math.max(detail.south + camera.position.z, 0, -camera.position.z - detail.south - 1200);
        if (detail.requested || detailYear <= 0 || ((detail.name === "west" || detail.name === "south") && currentYear < 2022) || Math.hypot(dx, dn) >= detail.distance) continue;
        detail.requested = true;
        // Independent manager: this optional image does not block initial loading.
        new THREE.TextureLoader(new THREE.LoadingManager()).load(`textures/ortho_${detail.name}.webp`, (texture) => {
          texture.colorSpace = THREE.SRGBColorSpace;
          texture.anisotropy = Math.min(anisotropy, 8);
          detail.texture.value = texture;
          detail.ready = true;
          detail.weight.value = detail.name === "west" || detail.name === "south" ? (currentYear >= 2022 ? 1 : 0) : detailYear;
          invalidate();
        }, undefined, () => { /* Retain the base orthophoto if the detail tile is unavailable. */ });
      }
      for (const tile of tiles) {
        const before = tile.getCurrentLevel();
        tile.update(camera);
        changed ||= before !== tile.getCurrentLevel();
      }
      return changed;
    },
    setYear(year: number) {
      currentYear = year;
      const w = photoWeights(year);
      uniforms.uHist.value = w[0];
      uniforms.uW.value.set(w[1], w[2], w[3], w[4]);
      uniforms.uWild.value = 1 - THREE.MathUtils.smoothstep(year, -3000, -200);
      detailYear = THREE.MathUtils.smoothstep(year, 2020, 2022);
      for (const detail of details) detail.weight.value = detail.ready ? (detail.name === "west" || detail.name === "south" ? (year >= 2022 ? 1 : 0) : detailYear) : 0;
    },
  };
}
