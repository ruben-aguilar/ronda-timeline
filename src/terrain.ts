import * as THREE from "three";
import { Dem, Y_OFFSET } from "./data";
import { pbr } from "./textures";

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
  mesh: THREE.Mesh;
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

export function createTerrain(dem: Dem, loader: THREE.TextureLoader, anisotropy: number): Terrain {
  const { rows, cols, cell } = dem;
  const half = dem.size / 2;
  const pos = new Float32Array(rows * cols * 3);
  const uv = new Float32Array(rows * cols * 2);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      pos[i * 3] = -half + (c + 0.5) * cell;
      pos[i * 3 + 1] = dem.h[i] - Y_OFFSET;
      pos[i * 3 + 2] = -(half - (r + 0.5) * cell);
      uv[i * 2] = (c + 0.5) / cols;
      uv[i * 2 + 1] = 1 - (r + 0.5) / rows;
    }
  }
  const idx = new Uint32Array((rows - 1) * (cols - 1) * 6);
  let k = 0;
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const a = r * cols + c;
      const b = a + 1;
      const d = a + cols;
      const e = d + 1;
      idx[k++] = a;
      idx[k++] = d;
      idx[k++] = b;
      idx[k++] = b;
      idx[k++] = d;
      idx[k++] = e;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeVertexNormals();

  const tex = (name: string, srgb = true) => {
    const t = loader.load(`textures/${name}`);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = anisotropy;
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
  };

  const mat = new THREE.MeshStandardMaterial({ roughness: 0.93, metalness: 0 });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
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
uniform sampler2D tHist, t1956, t1980, t2004, t2024, t2024c, tMask, tCliff;
varying vec3 vTN;
float gCliffL;
uniform vec4 uW;
uniform float uHist, uWild;
float gSteep, gStrata, gDetail;
${NOISE_GLSL}`,
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
vec3 p2024 = texture2D(t2024, uv).rgb;
vec2 cuv = (uv - 0.25) * 2.0;
float cin = smoothstep(0.0, 0.02, min(min(cuv.x, cuv.y), min(1.0 - cuv.x, 1.0 - cuv.y)));
if (cin > 0.0) p2024 = mix(p2024, texture2D(t2024c, clamp(cuv, 0.0, 1.0)).rgb, cin);

vec3 hist = texture2D(tHist, uv).rgb;
float m = texture2D(tMask, uv).r;
// Where the town was painted out, add field and scrub detail so it does not look blurry.
float fieldN = tFbm(vWPos.xz * 0.06);
hist *= mix(1.0, 0.86 + 0.28 * tNoise(vWPos.xz * 0.9) * fieldN, m);
// Prehistory: more wild scrub and holm-oak woodland.
vec3 wood = vec3(0.20, 0.25, 0.13) * (0.75 + 0.6 * tFbm(vWPos.xz * 0.045));
hist = mix(hist, wood, uWild * 0.6 * smoothstep(0.35, 0.75, tFbm(vWPos.xz * 0.012)) * (1.0 - gSteep));

vec3 p1956 = texture2D(t1956, uv).rgb * vec3(1.07, 0.98, 0.83);
vec3 p1980 = texture2D(t1980, uv).rgb * vec3(1.04, 1.0, 0.92);
vec3 col = hist * uHist + p1956 * uW.x + p1980 * uW.y + texture2D(t2004, uv).rgb * uW.z + p2024 * uW.w;

// Cliffs: photos smear on steep faces, so draw layered limestone there.
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

float lumC = dot(col, vec3(0.299, 0.587, 0.114));
col = mix(vec3(lumC), col, 1.18);
col = pow(col, vec3(1.12));
// Fine grain close to the camera.
gDetail = 1.0 - smoothstep(250.0, 1400.0, dist);
col *= 1.0 + (tNoise(vWPos.xz * 1.7) - 0.5) * 0.14 * gDetail;
diffuseColor.rgb *= col;
`,
      )
      .replace(
        "#include <normal_fragment_maps>",
        /* glsl */ `#include <normal_fragment_maps>
float hB = tNoise(vWPos.xz * 0.7) * 0.6 + tNoise(vWPos.xz * 2.6) * 0.25 + gSteep * (gStrata * 1.2 + gCliffL * 2.5);
normal = tPerturb(-vViewPosition, normal, vec2(dFdx(hB), dFdy(hB)) * gDetail * 1.2, faceDirection);`,
      )
      .replace(
        "#include <fog_fragment>",
        `#include <fog_fragment>
float edge = smoothstep(0.40, 0.5, max(abs(vTUv.x - 0.5), abs(vTUv.y - 0.5)));
gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, edge);`,
      );
  };

  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.castShadow = true;

  return {
    mesh,
    setYear(year: number) {
      const w = photoWeights(year);
      uniforms.uHist.value = w[0];
      uniforms.uW.value.set(w[1], w[2], w[3], w[4]);
      uniforms.uWild.value = 1 - THREE.MathUtils.smoothstep(year, -3000, -200);
    },
  };
}
