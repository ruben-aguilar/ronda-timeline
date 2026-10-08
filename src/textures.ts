import * as THREE from "three";

// Procedural textures drawn on a canvas: colour map plus a matching bump map. All of them tile,
// and `metres` says how many metres one tile covers (geometry UVs are in metres).

export interface TexPair {
  map: THREE.CanvasTexture;
  bump: THREE.CanvasTexture;
  metres: number;
}

const SIZE = 512;

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/** Tileable value noise, 0..1. */
function noiseField(size: number, cells: number, seed: number): Float32Array {
  const r = rng(seed);
  const g = new Float32Array(cells * cells).map(() => r());
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const fx = (x / size) * cells;
      const fy = (y / size) * cells;
      const x0 = Math.floor(fx);
      const y0 = Math.floor(fy);
      const tx = fx - x0;
      const ty = fy - y0;
      const sx = tx * tx * (3 - 2 * tx);
      const sy = ty * ty * (3 - 2 * ty);
      const at = (i: number, j: number) => g[((j % cells) * cells + (i % cells)) | 0];
      const a = at(x0, y0) * (1 - sx) + at(x0 + 1, y0) * sx;
      const b = at(x0, y0 + 1) * (1 - sx) + at(x0 + 1, y0 + 1) * sx;
      out[y * size + x] = a * (1 - sy) + b * sy;
    }
  }
  return out;
}

function fbm(size: number, seed: number, octaves = [4, 8, 16, 32, 64]): Float32Array {
  const out = new Float32Array(size * size);
  let amp = 0.5;
  let total = 0;
  octaves.forEach((c, i) => {
    const n = noiseField(size, c, seed + i * 101);
    for (let k = 0; k < out.length; k++) out[k] += n[k] * amp;
    total += amp;
    amp *= 0.55;
  });
  for (let k = 0; k < out.length; k++) out[k] /= total;
  return out;
}

function toTextures(color: Uint8ClampedArray, height: Float32Array, metres: number, srgb = true): TexPair {
  const mk = (data: Uint8ClampedArray) => {
    const c = document.createElement("canvas");
    c.width = c.height = SIZE;
    const ctx = c.getContext("2d")!;
    ctx.putImageData(new ImageData(data as Uint8ClampedArray<ArrayBuffer>, SIZE, SIZE), 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    return t;
  };
  const hb = new Uint8ClampedArray(SIZE * SIZE * 4);
  for (let i = 0; i < height.length; i++) {
    const v = Math.max(0, Math.min(255, height[i] * 255));
    hb[i * 4] = hb[i * 4 + 1] = hb[i * 4 + 2] = v;
    hb[i * 4 + 3] = 255;
  }
  const map = mk(color);
  if (srgb) map.colorSpace = THREE.SRGBColorSpace;
  return { map, bump: mk(hb), metres };
}

/** Ashlar masonry: rows of blocks with staggered joints, per-block tone and weathering. */
export function stoneTexture(base: [number, number, number], rows = 8, cols = 4, seed = 1, metres = 5): TexPair {
  const col = new Uint8ClampedArray(SIZE * SIZE * 4);
  const hgt = new Float32Array(SIZE * SIZE);
  const grain = fbm(SIZE, seed, [16, 32, 64, 128]);
  const stain = fbm(SIZE, seed + 7, [2, 4, 8]);
  const r = rng(seed + 3);
  const rowH = SIZE / rows;
  const tones: number[][] = [];
  for (let j = 0; j < rows; j++) {
    tones.push([]);
    for (let i = 0; i < cols + 1; i++) tones[j].push(0.82 + r() * 0.3);
  }
  const offsets = Array.from({ length: rows }, (_, j) => (j % 2) * 0.5 + (r() - 0.5) * 0.2);
  for (let y = 0; y < SIZE; y++) {
    const j = Math.floor(y / rowH);
    const fy = (y % rowH) / rowH;
    for (let x = 0; x < SIZE; x++) {
      const u = (x / SIZE) * cols + offsets[j];
      const i = ((Math.floor(u) % cols) + cols) % cols;
      const fx = u - Math.floor(u);
      const edge = Math.min(fx * (SIZE / cols), (1 - fx) * (SIZE / cols), fy * rowH, (1 - fy) * rowH);
      const mortar = edge < 2.2;
      const bevel = Math.min(edge / 7, 1);
      const k = y * SIZE + x;
      const g = grain[k];
      const t = mortar ? 0.55 : tones[j][i] * (0.86 + g * 0.28) * (0.9 + stain[k] * 0.2);
      col[k * 4] = base[0] * t;
      col[k * 4 + 1] = base[1] * t;
      col[k * 4 + 2] = base[2] * t;
      col[k * 4 + 3] = 255;
      hgt[k] = mortar ? 0.15 : 0.5 + bevel * 0.35 + (g - 0.5) * 0.25;
    }
  }
  return toTextures(col, hgt, metres);
}

/** Whitewash / lime plaster: soft stains and fine roughness. */
export function plasterTexture(base: [number, number, number], seed = 2, metres = 6): TexPair {
  const col = new Uint8ClampedArray(SIZE * SIZE * 4);
  const hgt = new Float32Array(SIZE * SIZE);
  const fine = fbm(SIZE, seed, [32, 64, 128]);
  const stain = fbm(SIZE, seed + 5, [2, 4, 8]);
  for (let k = 0; k < SIZE * SIZE; k++) {
    const t = 0.9 + fine[k] * 0.1 - Math.max(stain[k] - 0.55, 0) * 0.35;
    col[k * 4] = base[0] * t;
    col[k * 4 + 1] = base[1] * t;
    col[k * 4 + 2] = base[2] * t * 0.99;
    col[k * 4 + 3] = 255;
    hgt[k] = 0.4 + fine[k] * 0.3;
  }
  return toTextures(col, hgt, metres);
}

/** Spanish curved clay tiles: alternating channels, overlapping courses, colour variation. */
export function tileTexture(seed = 3, metres = 3): TexPair {
  const col = new Uint8ClampedArray(SIZE * SIZE * 4);
  const hgt = new Float32Array(SIZE * SIZE);
  const r = rng(seed);
  const cols = 14;
  const rows = 8;
  const tint = Array.from({ length: cols * rows }, () => [0.85 + r() * 0.3, r()]);
  const grain = fbm(SIZE, seed, [16, 32, 64]);
  for (let y = 0; y < SIZE; y++) {
    const fy = ((y / SIZE) * rows) % 1;
    const j = Math.floor((y / SIZE) * rows);
    for (let x = 0; x < SIZE; x++) {
      const fx = ((x / SIZE) * cols) % 1;
      const i = Math.floor((x / SIZE) * cols);
      const convex = i % 2 === 0;
      const prof = Math.sin(fx * Math.PI); // round profile across the tile
      const h = convex ? 0.5 + prof * 0.5 : 0.5 - prof * 0.25;
      const lap = fy < 0.12 ? 0.6 + fy * 3 : 1; // shadow where a course overlaps the next
      const [tn, hue] = tint[j * cols + i];
      const k = y * SIZE + x;
      const shade = (0.7 + 0.3 * (convex ? prof : 1 - prof * 0.5)) * lap * tn * (0.9 + grain[k] * 0.2);
      const red = 172 + hue * 30;
      const green = 92 + hue * 22;
      const blue = 60 + hue * 10;
      col[k * 4] = red * shade;
      col[k * 4 + 1] = green * shade;
      col[k * 4 + 2] = blue * shade;
      col[k * 4 + 3] = 255;
      hgt[k] = h * lap;
    }
  }
  return toTextures(col, hgt, metres);
}

/** Rammed earth (tapial): horizontal pour layers about 0.85 m high, putlog holes, mottled lime. */
export function tapialTexture(seed = 5, metres = 6): TexPair {
  const col = new Uint8ClampedArray(SIZE * SIZE * 4);
  const hgt = new Float32Array(SIZE * SIZE);
  const mott = fbm(SIZE, seed, [4, 8, 16, 32]);
  const fine = fbm(SIZE, seed + 9, [64, 128]);
  const r = rng(seed);
  const layers = 7; // 6 m / 7 = 0.86 m per layer
  const layerH = SIZE / layers;
  const holes: Array<[number, number]> = [];
  for (let j = 0; j < layers; j++) for (let i = 0; i < 3; i++) holes.push([((i + 0.3 + r() * 0.4) / 3) * SIZE, j * layerH + 3]);
  for (let y = 0; y < SIZE; y++) {
    const fy = (y % layerH) / layerH;
    const j = Math.floor(y / layerH);
    for (let x = 0; x < SIZE; x++) {
      const k = y * SIZE + x;
      const joint = fy < 0.025 || fy > 0.985;
      const hole = holes.some(([hx, hy]) => Math.abs(x - hx) < 5 && y - hy >= 0 && y - hy < 7);
      const layerTone = 0.92 + ((j * 37) % 7) / 60;
      let t = layerTone * (0.82 + mott[k] * 0.3) * (0.94 + fine[k] * 0.1);
      if (joint) t *= 0.78;
      if (hole) t *= 0.35;
      col[k * 4] = 214 * t;
      col[k * 4 + 1] = 186 * t;
      col[k * 4 + 2] = 146 * t;
      col[k * 4 + 3] = 255;
      hgt[k] = hole ? 0.1 : joint ? 0.3 : 0.5 + (fine[k] - 0.5) * 0.4 + (mott[k] - 0.5) * 0.2;
    }
  }
  return toTextures(col, hgt, metres);
}

export function sandTexture(seed = 4): TexPair {
  const col = new Uint8ClampedArray(SIZE * SIZE * 4);
  const hgt = new Float32Array(SIZE * SIZE);
  const n = fbm(SIZE, seed, [8, 32, 128]);
  for (let k = 0; k < SIZE * SIZE; k++) {
    const t = 0.85 + n[k] * 0.25;
    col[k * 4] = 214 * t;
    col[k * 4 + 1] = 180 * t;
    col[k * 4 + 2] = 128 * t;
    col[k * 4 + 3] = 255;
    hgt[k] = n[k];
  }
  return toTextures(col, hgt, 8);
}

/** A material that uses a texture pair; geometry UVs must be in metres. */
export function texturedMaterial(t: TexPair, opts: { color?: number; roughness?: number; bump?: number } = {}): THREE.MeshStandardMaterial {
  const map = t.map.clone();
  const bump = t.bump.clone();
  for (const x of [map, bump]) {
    x.repeat.set(1 / t.metres, 1 / t.metres);
    x.needsUpdate = true;
  }
  return new THREE.MeshStandardMaterial({
    map,
    bumpMap: bump,
    bumpScale: opts.bump ?? 1.5,
    color: opts.color ?? 0xffffff,
    roughness: opts.roughness ?? 0.9,
  });
}

/** Rewrite UVs as metres, projected on the plane that best faces each vertex normal. */
export function metricUV(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.computeVertexNormals();
  const p = g.attributes.position;
  const n = g.attributes.normal;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i));
    const ay = Math.abs(n.getY(i));
    const az = Math.abs(n.getZ(i));
    if (ay > 0.6 && ay >= ax && ay >= az) {
      uv[i * 2] = p.getX(i);
      uv[i * 2 + 1] = p.getZ(i);
    } else if (ax > az) {
      uv[i * 2] = p.getZ(i);
      uv[i * 2 + 1] = p.getY(i);
    } else {
      uv[i * 2] = p.getX(i);
      uv[i * 2 + 1] = p.getY(i);
    }
  }
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return g;
}

let cache: ReturnType<typeof buildLibrary> | null = null;

function buildLibrary() {
  return {
    stone: stoneTexture([206, 176, 136], 9, 4, 11, 5),
    darkStone: stoneTexture([170, 146, 116], 10, 5, 12, 5),
    rubble: stoneTexture([182, 160, 128], 14, 9, 13, 4),
    whitewash: plasterTexture([240, 236, 226], 21),
    ochre: plasterTexture([222, 190, 140], 22),
    tiles: tileTexture(31),
    sand: sandTexture(41),
    tapial: tapialTexture(51),
  };
}

/** Shared texture library, created once. */
export function textures() {
  if (!cache) cache = buildLibrary();
  return cache;
}
