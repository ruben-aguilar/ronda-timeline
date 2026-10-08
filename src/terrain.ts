import * as THREE from "three";
import { Dem, Y_OFFSET } from "./data";

// Aerial photo keyframes. Before 1935 the terrain uses a "historic" look: the 1956 photo
// recoloured as fields and rock, with the modern streets masked out.
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

export function createTerrain(dem: Dem, loader: THREE.TextureLoader, anisotropy: number): Terrain {
  const { rows, cols, cell } = dem;
  const half = dem.size / 2;
  const pos = new Float32Array(rows * cols * 3);
  const uv = new Float32Array(rows * cols * 2);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      const x = -half + (c + 0.5) * cell;
      const n = half - (r + 0.5) * cell;
      pos[i * 3] = x;
      pos[i * 3 + 1] = dem.h[i] - Y_OFFSET;
      pos[i * 3 + 2] = -n;
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
      // Counter-clockwise seen from above (+Y).
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
    return t;
  };
  const uniforms = {
    t1956: { value: tex("ortho_1956.jpg") },
    t1980: { value: tex("ortho_1980.jpg") },
    t2004: { value: tex("ortho_2004.jpg") },
    t2024: { value: tex("ortho_2024.jpg") },
    tMask: { value: tex("urban_mask.png", false) },
    uW: { value: new THREE.Vector4(0, 0, 0, 0) },
    uHist: { value: 1 },
  };

  const mat = new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0 });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec2 vTUv;\nvarying float vUp;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvTUv = uv;\nvUp = normal.y;");
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <fog_fragment>",
        `#include <fog_fragment>
float edge = smoothstep(0.40, 0.5, max(abs(vTUv.x - 0.5), abs(vTUv.y - 0.5)));
gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, edge);`,
      )
      .replace(
        "#include <common>",
        `#include <common>
varying vec2 vTUv;
varying float vUp;
uniform sampler2D t1956, t1980, t2004, t2024, tMask;
uniform vec4 uW;
uniform float uHist;
float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash2(i), hash2(i + vec2(1, 0)), u.x), mix(hash2(i + vec2(0, 1)), hash2(i + vec2(1, 1)), u.x), u.y);
}`,
      )
      .replace(
        "#include <map_fragment>",
        `
vec3 bw = texture2D(t1956, vTUv).rgb;
float l = dot(bw, vec3(0.3333));
// Historic look: recolour the 1956 photo (dark = scrub and olives, bright = cereal fields).
vec3 fields = mix(vec3(0.26, 0.30, 0.16), vec3(0.80, 0.70, 0.46), smoothstep(0.18, 0.80, l));
float steep = 1.0 - smoothstep(0.55, 0.88, vUp);
vec3 rock = vec3(0.60, 0.54, 0.45) * (0.8 + 0.4 * l);
vec3 hist = mix(fields, rock, steep * 0.85);
float nz = vnoise(vTUv * 260.0) * 0.6 + vnoise(vTUv * 900.0) * 0.4;
vec3 bare = mix(vec3(0.55, 0.50, 0.34), vec3(0.72, 0.63, 0.42), nz);
float m = texture2D(tMask, vTUv).r;
hist = mix(hist, mix(bare, rock, steep * 0.85), m);
vec3 p1956 = texture2D(t1956, vTUv).rgb * vec3(1.06, 0.98, 0.84);
vec3 p1980 = texture2D(t1980, vTUv).rgb * vec3(1.03, 1.0, 0.92);
vec3 col = hist * uHist + p1956 * uW.x + p1980 * uW.y + texture2D(t2004, vTUv).rgb * uW.z + texture2D(t2024, vTUv).rgb * uW.w;
// Ortho photos smear on cliffs: blend toward rock there.
col = mix(col, rock * (0.75 + 0.5 * dot(col, vec3(0.333))), steep * 0.55 * (1.0 - uHist));
diffuseColor.rgb *= col;
`,
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
    },
  };
}
