import * as THREE from "three";

// Photographic PBR textures from Poly Haven (CC0), exported by scripts/export_pbr.py:
// colour (diff), OpenGL normal map (nor) and ambient occlusion / roughness / metalness (arm).
// Geometry UVs are in metres; each set says how many metres one tile covers.

export type PbrKey = "sandstone" | "blocks" | "rubble" | "tapial" | "plaster" | "roof" | "arena" | "cliff" | "cobble" | "gravel";

const METRES: Record<PbrKey, number> = {
  sandstone: 4,
  blocks: 4,
  rubble: 3,
  tapial: 3.5,
  plaster: 4,
  roof: 3,
  arena: 6,
  cliff: 24,
  cobble: 3,
  gravel: 3,
};

// Average linear colour of each texture (measured), used to aim a material at a target albedo.
const MEAN: Record<PbrKey, [number, number, number]> = {
  sandstone: [0.251, 0.141, 0.05],
  blocks: [0.103, 0.096, 0.077],
  rubble: [0.377, 0.245, 0.137],
  tapial: [0.328, 0.251, 0.169],
  plaster: [0.433, 0.395, 0.334],
  roof: [0.296, 0.193, 0.096],
  arena: [0.252, 0.176, 0.115],
  cliff: [0.213, 0.093, 0.034],
  cobble: [0.281, 0.231, 0.15],
  gravel: [0.382, 0.256, 0.146],
};

export interface PbrSet {
  map: THREE.Texture;
  normalMap: THREE.Texture;
  arm: THREE.Texture;
  metres: number;
}

const loader = new THREE.TextureLoader();
const cache = new Map<PbrKey, PbrSet>();

export function pbr(key: PbrKey): PbrSet {
  let s = cache.get(key);
  if (!s) {
    const load = (part: string, srgb: boolean) => {
      const t = loader.load(`textures/pbr/${key}_${part}.webp`);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = 8;
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      return t;
    };
    s = { map: load("diff", true), normalMap: load("nor", false), arm: load("arm", false), metres: METRES[key] };
    cache.set(key, s);
  }
  return s;
}

/** A standard material with a PBR set; geometry UVs must be in metres. */
export function texturedMaterial(
  key: PbrKey,
  opts: {
    /** Target average linear colour; the texture keeps its detail but is tinted to this. */
    albedo?: [number, number, number];
    color?: THREE.ColorRepresentation;
    normalScale?: number;
    scale?: number;
    roughness?: number;
  } = {},
): THREE.MeshStandardMaterial {
  const s = pbr(key);
  const rep = 1 / (s.metres * (opts.scale ?? 1));
  const tex = (t: THREE.Texture) => {
    const c = t.clone();
    c.repeat.set(rep, rep);
    c.needsUpdate = true;
    return c;
  };
  const arm = tex(s.arm);
  return new THREE.MeshStandardMaterial({
    map: tex(s.map),
    normalMap: tex(s.normalMap),
    normalScale: new THREE.Vector2(opts.normalScale ?? 1, opts.normalScale ?? 1),
    roughnessMap: arm,
    aoMap: arm,
    aoMapIntensity: 0.8,
    roughness: opts.roughness ?? 1,
    color: opts.albedo ? new THREE.Color(...opts.albedo.map((v, i) => v / MEAN[key][i])) : (opts.color ?? 0xffffff),
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
