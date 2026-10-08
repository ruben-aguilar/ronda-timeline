import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { orientedBox, OBB } from "./buildings";
import { BuildingData, Dem, elevation, Y_OFFSET } from "./data";
import { metricUV, texturedMaterial } from "./textures";

// Hand-built models for the main monuments. Where a monument stands on a Catastro footprint,
// the model uses that footprint (so it sits exactly where the real building is) and the generic
// building for it is removed (see `exclude`).

type Pt = [number, number];

export interface Monuments {
  group: THREE.Group;
  /** True for a Catastro part (by its centroid) that a monument model replaces. */
  exclude(x: number, n: number): boolean;
  update(year: number): void;
}

/** Collects geometry per material, then merges it into one mesh per material. */
class Builder {
  private parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
  add(geo: THREE.BufferGeometry, mat: THREE.Material, m?: THREE.Matrix4) {
    let g = metricUV(geo);
    if (m) g = g.applyMatrix4(m);
    for (const k of Object.keys(g.attributes)) if (!["position", "normal", "uv"].includes(k)) g.deleteAttribute(k);
    if (!this.parts.has(mat)) this.parts.set(mat, []);
    this.parts.get(mat)!.push(g);
  }
  /** Add geometry that already has world coordinates and metric UVs. */
  addRaw(geo: THREE.BufferGeometry, mat: THREE.Material) {
    if (!this.parts.has(mat)) this.parts.set(mat, []);
    this.parts.get(mat)!.push(geo);
  }
  build(): THREE.Group {
    const g = new THREE.Group();
    for (const [mat, geos] of this.parts) {
      const merged = mergeGeometries(geos.map((x) => (x.index ? x.toNonIndexed() : x)), false);
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      g.add(mesh);
    }
    return g;
  }
}

const M = (x: number, y: number, z: number, rotY = 0, s: [number, number, number] = [1, 1, 1]) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY), new THREE.Vector3(...s));

/** Rotation about Y that turns local +X into the direction (ux, un) of the map. */
const yawOf = (ux: number, un: number) => Math.atan2(un, ux);

function centroid(pts: Pt[]): Pt {
  let x = 0;
  let n = 0;
  for (const p of pts) {
    x += p[0];
    n += p[1];
  }
  return [x / pts.length, n / pts.length];
}

function ringArea(pts: Pt[]): number {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1];
  return Math.abs(a / 2);
}

/** Vertical prism on a footprint, from y0 to y1 (world). */
function prism(pts: Pt[], y0: number, y1: number): THREE.BufferGeometry {
  const shape = new THREE.Shape(pts.map(([x, n]) => new THREE.Vector2(x, n)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: y1 - y0, bevelEnabled: false });
  g.rotateX(-Math.PI / 2);
  g.translate(0, y0, 0);
  return g;
}

/** Hip roof over an oriented box. Returns world geometry. */
function hipRoof(b: OBB, y: number, riseFactor = 0.42, over = 0.6): THREE.BufferGeometry {
  const { cx, cn, ux, un, a, b: bb } = b;
  const vx = -un;
  const vn = ux;
  const A = a + over;
  const B = bb + over;
  const rise = bb * riseFactor;
  const P = (su: number, sv: number, h: number) => new THREE.Vector3(cx + ux * su + vx * sv, y + h, -(cn + un * su + vn * sv));
  const e1 = P(-A, -B, 0), e2 = P(A, -B, 0), e3 = P(A, B, 0), e4 = P(-A, B, 0);
  const r1 = P(-(a - bb), 0, rise), r2 = P(a - bb, 0, rise);
  const tris: THREE.Vector3[][] = [
    [e1, e2, r2], [e1, r2, r1], [e3, e4, r1], [e3, r1, r2], [e2, e3, r2], [e4, e1, r1],
  ];
  const pos: number[] = [];
  for (const t of tris) {
    const nrm = new THREE.Vector3().subVectors(t[1], t[0]).cross(new THREE.Vector3().subVectors(t[2], t[0]));
    const tt = nrm.y < 0 ? [t[0], t[2], t[1]] : t;
    for (const v of tt) pos.push(v.x, v.y, v.z);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  return g;
}

/** Gable roof (a prism with a triangular section) centred at the origin, ridge along local X. */
function gable(len: number, width: number, rise: number): THREE.BufferGeometry {
  const s = new THREE.Shape([new THREE.Vector2(-width / 2, 0), new THREE.Vector2(width / 2, 0), new THREE.Vector2(0, rise)]);
  const g = new THREE.ExtrudeGeometry(s, { depth: len, bevelEnabled: false });
  g.translate(0, 0, -len / 2);
  g.rotateY(Math.PI / 2);
  return g;
}

/** A row of battlements (merlons) along local X, starting at the origin. */
function merlons(len: number, thick: number, size = 1.1, gap = 1.0): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  const n = Math.max(1, Math.floor(len / (size + gap)));
  const step = len / n;
  for (let i = 0; i < n; i++) {
    const b = new THREE.BoxGeometry(size, 1.4, thick);
    b.translate(-len / 2 + step * (i + 0.5), 0.7, 0);
    out.push(b);
  }
  return out;
}

function box(w: number, h: number, d: number): THREE.BufferGeometry {
  const b = new THREE.BoxGeometry(w, h, d);
  b.translate(0, h / 2, 0);
  return b;
}

/** Grows a group upwards between two years and hides it outside [from, end). */
function timed(group: THREE.Group, base: number, from: number, to: number, end = 1e9) {
  const pivot = new THREE.Group();
  pivot.position.y = base;
  group.position.y -= base;
  pivot.add(group);
  return {
    pivot,
    update(year: number) {
      const t = to <= from ? (year >= from ? 1 : 0) : THREE.MathUtils.clamp((year - from) / (to - from), 0, 1);
      pivot.visible = t > 0 && year < end;
      pivot.scale.y = Math.max(t, 0.001);
    },
  };
}

export function createMonuments(dem: Dem, data: BuildingData): Monuments {
  // Target colours (linear) chosen from photos of Ronda: warm sandstone, ochre rammed earth,
  // whitewash, light yellow arena sand.
  const mat = {
    stone: texturedMaterial("sandstone", { albedo: [0.5, 0.39, 0.26] }),
    darkStone: texturedMaterial("blocks", { albedo: [0.46, 0.38, 0.28] }),
    rubble: texturedMaterial("rubble", { albedo: [0.47, 0.39, 0.28] }),
    tapial: texturedMaterial("tapial", { albedo: [0.52, 0.42, 0.29] }),
    white: texturedMaterial("plaster", { albedo: [0.82, 0.8, 0.74] }),
    cream: texturedMaterial("plaster", { albedo: [0.78, 0.68, 0.5] }),
    ochre: texturedMaterial("plaster", { albedo: [0.7, 0.52, 0.3] }),
    tiles: texturedMaterial("roof", { albedo: [0.4, 0.2, 0.1], scale: 0.8 }),
    sand: texturedMaterial("gravel", { albedo: [0.62, 0.44, 0.2], scale: 0.6, normalScale: 0.4 }),
    red: new THREE.MeshStandardMaterial({ color: 0x6e2318, roughness: 0.7 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x15110e, roughness: 1 }),
    road: texturedMaterial("cobble", { albedo: [0.32, 0.3, 0.27] }),
    iron: new THREE.MeshStandardMaterial({ color: 0x23201d, roughness: 0.6, metalness: 0.4 }),
  };

  // Lathe and ring pieces can face either way; draw both sides.
  for (const m of Object.values(mat)) m.side = THREE.DoubleSide;

  const ground = (x: number, n: number) => elevation(dem, x, n) - Y_OFFSET;
  const minGround = (pts: Pt[]) => Math.min(...pts.map(([x, n]) => ground(x, n)));
  const group = new THREE.Group();
  const updaters: Array<(y: number) => void> = [];
  const excluded = new Set<string>();
  const exclusionCircles: Array<[number, number, number]> = [];
  const key = (x: number, n: number) => `${x.toFixed(1)},${n.toFixed(1)}`;

  // Footprints of all Catastro parts with their centroid (same formula as buildings.ts).
  const footprints = data.parts.map((p) => {
    const flat = p[3][0];
    const pts: Pt[] = [];
    for (let k = 0; k < flat.length; k += 2) pts.push([flat[k] / 10, flat[k + 1] / 10]);
    const c = centroid(pts);
    return { pts, c, area: ringArea(pts) };
  });
  /** The largest Catastro part whose centroid is within r metres of a point. */
  const takePart = (x: number, n: number, r: number): Pt[] => {
    let best: (typeof footprints)[number] | null = null;
    for (const f of footprints) if (Math.hypot(f.c[0] - x, f.c[1] - n) < r && (!best || f.area > best.area)) best = f;
    if (!best) throw new Error(`no footprint near ${x},${n}`);
    excluded.add(key(best.c[0], best.c[1]));
    return best.pts;
  };

  const add = (b: Builder, base: number, from: number, to: number, end?: number) => {
    const t = timed(b.build(), base, from, to, end);
    group.add(t.pivot);
    updaters.push(t.update);
  };

  // ---------------------------------------------------------------- Plaza de toros (1779–1785)
  {
    const c: Pt = [-100, 156];
    exclusionCircles.push([c[0], c[1], 46]);
    const R = 41;
    const ARENA = 33;
    // The arena is level: put the whole ring on a platform at the highest ground under it.
    let gmin = Infinity;
    let gmax = -Infinity;
    for (let r = 0; r <= R; r += 4) {
      for (let a = 0; a < Math.PI * 2; a += 0.15) {
        const g = ground(c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r);
        gmin = Math.min(gmin, g);
        gmax = Math.max(gmax, g);
      }
    }
    const y0 = gmax + 0.2;
    const b = new Builder();
    const at = (geo: THREE.BufferGeometry) => geo.translate(c[0], y0, -c[1]);
    // Plinth that fills the slope under the ring.
    const plinth = y0 - gmin + 3;
    b.add(at(new THREE.CylinderGeometry(R + 0.4, R + 0.4, plinth, 96, 1, true).translate(0, -plinth / 2, 0)), mat.stone);
    // Outer wall, whitewashed, with a stone base and cornice.
    b.add(at(new THREE.CylinderGeometry(R, R, 10, 128, 1, true).translate(0, 5, 0)), mat.white);
    b.add(at(new THREE.CylinderGeometry(R + 0.25, R + 0.25, 1.2, 128, 1, true).translate(0, 0.6, 0)), mat.stone);
    b.add(at(new THREE.TorusGeometry(R + 0.2, 0.35, 6, 128).rotateX(Math.PI / 2).translate(0, 10, 0)), mat.stone);
    // Tile roof sloping down towards the arena.
    b.add(at(new THREE.LatheGeometry([new THREE.Vector2(R + 0.8, 10.1), new THREE.Vector2(ARENA + 2.6, 7.9)], 128)), mat.tiles);
    // Stands (tendidos): stone steps rising from the barrier.
    const steps: THREE.Vector2[] = [];
    for (let i = 0; i <= 8; i++) {
      const r = ARENA + 0.6 + i * 0.25;
      steps.push(new THREE.Vector2(r, 1.4 + i * 0.22), new THREE.Vector2(r + 0.25, 1.4 + i * 0.22));
    }
    b.add(at(new THREE.LatheGeometry(steps.reverse(), 96)), mat.darkStone);
    // Two levels of arcades: 68 Tuscan columns per level carrying 68 round arches.
    const RA = ARENA + 2.6;
    const bayW = (2 * Math.PI * RA) / 68;
    for (const [lo, hi] of [[3.4, 5.6], [5.9, 7.9]]) {
      const H = hi - lo;
      const r = bayW / 2 - 0.32;
      const spring = H - r - 0.3;
      const bay = new THREE.Shape();
      bay.moveTo(-bayW / 2, 0);
      bay.lineTo(-r, 0);
      bay.lineTo(-r, spring);
      bay.absarc(0, spring, r, Math.PI, 0, true);
      bay.lineTo(r, 0);
      bay.lineTo(bayW / 2, 0);
      bay.lineTo(bayW / 2, H);
      bay.lineTo(-bayW / 2, H);
      bay.closePath();
      const bayGeo = metricUV(new THREE.ExtrudeGeometry(bay, { depth: 0.45, bevelEnabled: false, curveSegments: 10 }));
      const arches: THREE.BufferGeometry[] = [];
      const cols: THREE.BufferGeometry[] = [];
      for (let i = 0; i < 68; i++) {
        const a = (i / 68) * Math.PI * 2;
        const am = a + Math.PI / 68;
        // Panel faces the centre: rotate local +Z to point inwards.
        const m4 = new THREE.Matrix4().compose(
          new THREE.Vector3(Math.cos(am) * RA, lo, Math.sin(am) * RA),
          new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -am - Math.PI / 2),
          new THREE.Vector3(1, 1, 1),
        );
        arches.push(bayGeo.clone().applyMatrix4(m4));
        cols.push(new THREE.CylinderGeometry(0.2, 0.24, spring, 10).translate(Math.cos(a) * (RA - 0.3), lo + spring / 2, Math.sin(a) * (RA - 0.3)));
      }
      b.addRaw(at(mergeGeometries(arches)!), mat.cream);
      b.add(at(mergeGeometries(cols)!), mat.stone);
      b.add(at(new THREE.RingGeometry(ARENA + 2.2, R, 128, 1).rotateX(-Math.PI / 2).translate(0, lo - 0.05, 0)), mat.darkStone);
      // Back wall of the gallery.
      b.add(at(new THREE.CylinderGeometry(R - 0.6, R - 0.6, H, 128, 1, true).translate(0, lo + H / 2, 0)), mat.white);
    }
    // Railing along the upper gallery.
    b.add(at(new THREE.CylinderGeometry(RA - 0.35, RA - 0.35, 0.9, 128, 1, true).translate(0, 5.9 + 0.45, 0)), mat.cream);
    // Small windows on the outer facade, two rows.
    const wins: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2 + 0.03;
      for (const y of [4.2, 7.3]) {
        const w = new THREE.BoxGeometry(0.9, 1.3, 0.4);
        w.rotateY(-a);
        wins.push(w.translate(Math.cos(a) * (R + 0.05), y, Math.sin(a) * (R + 0.05)));
      }
    }
    b.add(at(mergeGeometries(wins)!), mat.dark);
    // Red wooden barrier and the sand.
    b.add(at(new THREE.CylinderGeometry(ARENA, ARENA, 1.5, 128, 1, true).translate(0, 0.75, 0)), mat.red);
    b.add(at(new THREE.CircleGeometry(ARENA, 128).rotateX(-Math.PI / 2).translate(0, 0.05, 0)), mat.sand);
    // Main gate in stone, on the east side.
    const gate = new THREE.Matrix4().makeTranslation(c[0] + R + 0.6, y0, -c[1]);
    b.add(box(1.6, 12, 11), mat.stone, gate);
    b.add(box(1.8, 6.5, 4).translate(0.1, 0, 0), mat.dark, gate);
    b.add(box(2.2, 0.6, 12).translate(0, 12, 0), mat.stone, gate);
    add(b, gmin - 3, 1779, 1785);
  }

  // ------------------------------------------------- Main mosque (c. 1000–1485) / Santa María
  {
    const fp = takePart(32, -363, 25);
    const obb = orientedBox(fp);
    const y0 = minGround(fp) - 2;
    const yawU = yawOf(obb.ux, obb.un);
    const plaza: Pt = [53, -448];
    // Corner of the box nearest the plaza: tower there.
    const corners: Pt[] = [];
    for (const su of [-1, 1]) for (const sv of [-1, 1]) corners.push([obb.cx + obb.ux * su * obb.a - obb.un * sv * obb.b, obb.cn + obb.un * su * obb.a + obb.ux * sv * obb.b]);
    corners.sort((p, q) => Math.hypot(p[0] - plaza[0], p[1] - plaza[1]) - Math.hypot(q[0] - plaza[0], q[1] - plaza[1]));
    const [tx, tn] = corners[0];
    const inward: Pt = [(obb.cx - tx) * 0.12, (obb.cn - tn) * 0.12];

    // Mosque: low lime walls, parallel tiled naves, an open courtyard and a minaret.
    const m = new Builder();
    m.add(prism(fp, y0, y0 + 9), mat.ochre);
    const naves = Math.max(3, Math.round((2 * obb.a) / 7));
    const nw = (2 * obb.a) / naves;
    const roofLen = 2 * obb.b * 0.62;
    for (let i = 0; i < naves; i++) {
      const su = -obb.a + nw * (i + 0.5);
      const sv = obb.b - roofLen / 2;
      const x = obb.cx + obb.ux * su - obb.un * sv;
      const n = obb.cn + obb.un * su + obb.ux * sv;
      // Ridge along the short axis (v): rotate local X onto v.
      m.add(gable(roofLen, nw + 0.4, 2.2), mat.tiles, M(x, y0 + 9, -n, yawOf(-obb.un, obb.ux)));
    }
    const minaret = M(tx + inward[0], y0, -(tn + inward[1]), yawU);
    m.add(box(5, 26, 5), mat.ochre, minaret);
    m.add(box(3.2, 4, 3.2).translate(0, 26, 0), mat.ochre, minaret);
    m.add(new THREE.ConeGeometry(2.3, 2.5, 4).rotateY(Math.PI / 4).translate(0, 31.2, 0), mat.tiles, minaret);
    for (const s of [-1, 1]) {
      m.add(box(1.0, 1.8, 0.3).translate(0, 21.5, s * 2.55), mat.dark, minaret);
      m.add(box(0.3, 1.8, 1.0).translate(s * 2.55, 21.5, 0), mat.dark, minaret);
    }
    add(m, y0, 1000, 1060, 1485);

    // Church: tall stone walls, a big tiled hip roof, the bell tower over the minaret base and a
    // two-level gallery facing the plaza.
    const ch = new Builder();
    ch.add(prism(fp, y0, y0 + 17), mat.stone);
    ch.addRaw(metricUV(hipRoof(obb, y0 + 17, 0.38, 0.8)), mat.tiles);
    const tower = M(tx + inward[0], y0, -(tn + inward[1]), yawU);
    ch.add(box(8, 24, 8), mat.stone, tower);
    ch.add(box(8.6, 0.8, 8.6).translate(0, 24, 0), mat.darkStone, tower);
    ch.add(box(7, 8, 7).translate(0, 24.8, 0), mat.stone, tower);
    for (const s of [-1, 1]) {
      ch.add(box(0.6, 4.6, 2.6).translate(s * 3.3, 26.4, 0), mat.dark, tower);
      ch.add(box(2.6, 4.6, 0.6).translate(0, 26.4, s * 3.3), mat.dark, tower);
    }
    ch.add(new THREE.CylinderGeometry(3.2, 3.6, 3, 8).translate(0, 34.3, 0), mat.stone, tower);
    ch.add(new THREE.SphereGeometry(3.2, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 35.8, 0), mat.tiles, tower);
    ch.add(new THREE.CylinderGeometry(0.15, 0.15, 3, 6).translate(0, 39.8, 0), mat.iron, tower);
    // Gallery along the long side nearest the plaza.
    const sideSign = (plaza[0] - obb.cx) * -obb.un + (plaza[1] - obb.cn) * obb.ux > 0 ? 1 : -1;
    const gx = obb.cx - obb.un * sideSign * (obb.b + 1.6);
    const gn = obb.cn + obb.ux * sideSign * (obb.b + 1.6);
    const gal = M(gx, y0, -gn, yawU);
    const gl = obb.a * 1.1;
    ch.add(box(gl, 1.2, 3.2).translate(0, 5.5, 0), mat.stone, gal);
    ch.add(box(gl, 1.2, 3.2).translate(0, 11.5, 0), mat.stone, gal);
    for (let i = 0; i <= 8; i++) {
      const x = -gl / 2 + (gl / 8) * i;
      ch.add(box(0.7, 12.7, 0.7).translate(x, 0, 1.3), mat.stone, gal);
    }
    ch.add(box(gl + 1, 0.4, 3.8).translate(0, 12.7, 0), mat.tiles, gal);
    add(ch, y0, 1485, 1500);
  }

  // ------------------------------------------------------------------ Arab baths (13th–14th c.)
  {
    const fp = takePart(280, -239, 15);
    const obb = orientedBox(fp);
    const y0 = minGround(fp) - 1;
    const b = new Builder();
    b.add(prism(fp, y0, y0 + 5.5), mat.tapial);
    // Three brick barrel vaults with star-shaped skylights.
    const rows = 3;
    for (let i = 0; i < rows; i++) {
      const sv = -obb.b + ((2 * obb.b) / rows) * (i + 0.5);
      const x = obb.cx - obb.un * sv;
      const n = obb.cn + obb.ux * sv;
      const r = obb.b / rows;
      const vault = new THREE.CylinderGeometry(r, r, obb.a * 1.8, 18, 1, false, -Math.PI / 2, Math.PI);
      vault.rotateZ(Math.PI / 2);
      b.add(vault, mat.ochre, M(x, y0 + 5.5, -n, yawOf(obb.ux, obb.un)));
      for (let k = -2; k <= 2; k++) {
        const sk = new THREE.CylinderGeometry(0.35, 0.35, 0.3, 8).translate(k * obb.a * 0.35, 5.5 + r - 0.05, 0);
        b.add(sk, mat.dark, M(x, y0, -n, yawOf(obb.ux, obb.un)));
      }
    }
    add(b, y0, 1280, 1300);
  }

  // ------------------------------------------------- Iglesia del Espíritu Santo (1505), fortress-like
  {
    const fp = takePart(170, -670, 15);
    const obb = orientedBox(fp);
    const y0 = minGround(fp) - 2;
    const b = new Builder();
    b.add(prism(fp, y0, y0 + 15), mat.rubble);
    b.addRaw(metricUV(hipRoof(obb, y0 + 15, 0.32, 0.4)), mat.tiles);
    const t = M(obb.cx - obb.ux * (obb.a - 5), y0, -(obb.cn - obb.un * (obb.a - 5)), yawOf(obb.ux, obb.un));
    b.add(box(10, 25, 10), mat.rubble, t);
    for (const g of merlons(10, 10.4, 1.2, 1.2)) b.add(g.translate(0, 25, 0), mat.rubble, t);
    for (const s of [-1, 1]) b.add(box(0.5, 3, 1.4).translate(s * 5.05, 19, 0), mat.dark, t);
    add(b, y0, 1505, 1515);
  }

  // ----------------------------------------------------- Iglesia de Padre Jesús (15th–16th c.)
  {
    const fp = takePart(297, -58, 15);
    const obb = orientedBox(fp);
    const y0 = minGround(fp) - 2;
    const b = new Builder();
    b.add(prism(fp, y0, y0 + 13), mat.white);
    b.addRaw(metricUV(hipRoof(obb, y0 + 13, 0.4, 0.5)), mat.tiles);
    const t = M(obb.cx + obb.ux * (obb.a - 3.5), y0, -(obb.cn + obb.un * (obb.a - 3.5)), yawOf(obb.ux, obb.un));
    b.add(box(7, 21, 7), mat.stone, t);
    b.add(box(5.6, 5, 5.6).translate(0, 21, 0), mat.stone, t);
    for (const s of [-1, 1]) b.add(box(0.5, 3.4, 2.2).translate(s * 2.6, 21.8, 0), mat.dark, t);
    b.add(new THREE.ConeGeometry(4.2, 3.5, 4).rotateY(Math.PI / 4).translate(0, 27.7, 0), mat.tiles, t);
    add(b, y0, 1500, 1520);
  }

  // ---------------------------------------------------------------------------------- Bridges
  const bridgeAxis = (c: Pt, deck: number) => {
    let best = { ang: 0, a: 40, b: 40, span: 1e9 };
    for (let deg = 0; deg < 180; deg += 3) {
      const ang = (deg * Math.PI) / 180;
      const dx = Math.sin(ang);
      const dn = Math.cos(ang);
      const reach = (sgn: number) => {
        for (let s = 2; s < 120; s++) if (elevation(dem, c[0] + dx * s * sgn, c[1] + dn * s * sgn) >= deck) return s;
        return 999;
      };
      const a = reach(1);
      const b = reach(-1);
      if (a + b < best.span) best = { ang, a, b, span: a + b };
    }
    let bottom = 1e9;
    for (let s = -best.b; s <= best.a; s++) bottom = Math.min(bottom, elevation(dem, c[0] + Math.sin(best.ang) * s, c[1] + Math.cos(best.ang) * s));
    return { ...best, bottom };
  };

  /**
   * A stone bridge: the profile of the gorge with arches cut into it, extruded across, plus
   * arch rings, buttresses, a cornice, parapets and the road.
   */
  const bridge = (
    c: Pt,
    deck: number,
    width: number,
    arches: Array<[number, number, number]>,
    opts: { buttress?: boolean; window?: boolean; photo?: THREE.Texture } = {},
  ) => {
    const ax = bridgeAxis(c, deck);
    const L0 = -ax.b - 4;
    const L1 = ax.a + 4;
    const yd = deck - Y_OFFSET;
    const groundAt = (s: number) => Math.min(elevation(dem, c[0] + Math.sin(ax.ang) * s, c[1] + Math.cos(ax.ang) * s), deck - 1) - Y_OFFSET - 4;
    const h = deck - ax.bottom;
    const yb = ax.bottom - Y_OFFSET - 4;
    // With a photo, arches are given in photo fractions: [centre 0..1, width 0..1, spring 0..1].
    const notches = arches
      .map(([fc, w0, fy]) => {
        const cx = opts.photo ? L0 + fc * (L1 - L0) : (L0 + L1) / 2 + fc * (L1 - L0);
        const w = opts.photo ? w0 * (L1 - L0) : w0;
        const sp = opts.photo ? yb + fy * (yd - yb) : ax.bottom - Y_OFFSET + fy * h;
        const spring = Math.max(sp, groundAt(cx - w / 2) + 3, groundAt(cx + w / 2) + 3);
        return { cx, w, spring };
      })
      .filter((a) => a.spring + a.w / 2 < yd - 4)
      .sort((a, b) => b.cx - a.cx);
    const shape = new THREE.Shape();
    shape.moveTo(L0, yd);
    shape.lineTo(L1, yd);
    let s = L1;
    for (const a of notches) {
      for (; s > a.cx + a.w / 2; s -= 2) shape.lineTo(s, groundAt(s));
      s = a.cx + a.w / 2;
      shape.lineTo(s, groundAt(s));
      shape.lineTo(s, a.spring);
      shape.absarc(a.cx, a.spring, a.w / 2, 0, Math.PI, false);
      s = a.cx - a.w / 2;
      shape.lineTo(s, groundAt(s));
      s -= 2;
    }
    for (; s >= L0; s -= 2) shape.lineTo(s, groundAt(s));
    shape.closePath();
    const b = new Builder();
    // Local frame: X along the bridge, Y up, Z across. Placed with yaw so X follows the axis.
    const frame = M(c[0], 0, -c[1], Math.PI / 2 - ax.ang);
    const body = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false, curveSegments: 24 });
    body.translate(0, 0, -width / 2);
    b.add(body, mat.stone, frame);
    if (opts.photo) {
      // The real photo on both faces, stretched over the outline (deck at the top of the photo).
      const face = new THREE.ShapeGeometry(shape, 24);
      const p = face.attributes.position;
      const uv = new Float32Array(p.count * 2);
      for (let i = 0; i < p.count; i++) {
        uv[i * 2] = (p.getX(i) - L0) / (L1 - L0);
        uv[i * 2 + 1] = (p.getY(i) - yb) / (yd - yb);
      }
      face.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
      const front = new THREE.MeshStandardMaterial({ map: opts.photo, roughness: 0.92 });
      const back = new THREE.MeshStandardMaterial({ map: opts.photo, roughness: 0.92, side: THREE.BackSide });
      b.addRaw(face.clone().translate(0, 0, width / 2 + 0.04).applyMatrix4(frame), front);
      b.addRaw(face.clone().translate(0, 0, -width / 2 - 0.04).applyMatrix4(frame), back);
    }
    for (const side of [-1, 1]) {
      const z = side * (width / 2 + 0.25);
      for (const a of opts.photo ? [] : notches) {
        // Voussoir ring around each arch.
        const ring = new THREE.TorusGeometry(a.w / 2 + 0.7, 0.75, 6, 32, Math.PI);
        b.add(ring.translate(a.cx, a.spring, z), mat.darkStone, frame);
        if (opts.buttress) {
          for (const e of [-1, 1]) {
            const px = a.cx + e * (a.w / 2 + 2.5);
            const y0 = groundAt(px) - 2;
            b.add(new THREE.BoxGeometry(3.2, yd - 2 - y0, 1.6).translate(px, (yd - 2 + y0) / 2, side * (width / 2 + 0.6)), mat.darkStone, frame);
          }
        }
        if (opts.window) {
          // The chamber above the central arch (the old prison): a window on each face.
          const wy = a.spring + a.w / 2 + 7;
          if (wy < yd - 5) b.add(new THREE.BoxGeometry(2.4, 3.2, 0.6).translate(a.cx, wy, side * (width / 2 + 0.05)), mat.dark, frame);
        }
      }
      // Cornice and parapet.
      if (!opts.photo) b.add(new THREE.BoxGeometry(L1 - L0 + 2, 0.9, 1.2).translate((L0 + L1) / 2, yd - 1.6, side * (width / 2 + 0.3)), mat.darkStone, frame);
      b.add(new THREE.BoxGeometry(L1 - L0, 1.2, 0.6).translate((L0 + L1) / 2, yd + 0.6, side * (width / 2 - 0.3)), mat.stone, frame);
    }
    b.add(new THREE.BoxGeometry(L1 - L0, 0.2, width - 1.2).translate((L0 + L1) / 2, yd + 0.1, 0), mat.road, frame);
    return { builder: b, bottom: ax.bottom - Y_OFFSET - 4 };
  };

  {
    // Arch positions measured on the photo "Ronda - Puente Nuevo tall.jpg" (Joe Mabel, CC BY-SA 3.0):
    // upper left arch, the central opening between the two great piers, upper right arch.
    const photo = new THREE.TextureLoader().load("textures/photo/puente_nuevo.webp");
    photo.colorSpace = THREE.SRGBColorSpace;
    photo.anisotropy = 8;
    const nb = bridge([6, -26], 719, 15, [[0.185, 0.17, 0.87], [0.5, 0.11, 0.7], [0.835, 0.13, 0.85]], { photo });
    add(nb.builder, nb.bottom, 1759, 1793);
    const first = bridge([6, -26], 714, 9, [[0, 34, 0.75]]);
    add(first.builder, first.bottom, 1735, 1740, 1741);
    const viejo = bridge([239, -134], 683, 7, [[0, 10, 0.5]]);
    add(viejo.builder, viejo.bottom, 1614, 1616);
    const arabe = bridge([266, -174], 662, 5, [[0, 6, 0.3]]);
    add(arabe.builder, arabe.bottom, 1290, 1300);
  }

  // ------------------------------------------------------------- City walls and Almocábar gate
  {
    const MEDINA: Pt[] = [[-20, -45], [-80, -60], [-130, -130], [-150, -230], [-140, -330], [-100, -430], [-50, -520], [10, -620], [70, -700], [160, -725], [210, -660], [205, -520], [175, -400], [165, -280], [180, -165], [110, -100], [50, -55]];
    const b = new Builder();
    let base = 1e9;
    for (let i = 0; i < MEDINA.length; i++) {
      const [x0, n0] = MEDINA[i];
      const [x1, n1] = MEDINA[(i + 1) % MEDINA.length];
      if (n0 > -100 && n1 > -100) continue;
      const len = Math.hypot(x1 - x0, n1 - n0);
      const steps = Math.max(1, Math.ceil(len / 12));
      for (let k = 0; k < steps; k++) {
        const ax = x0 + ((x1 - x0) * k) / steps, an = n0 + ((n1 - n0) * k) / steps;
        const bx = x0 + ((x1 - x0) * (k + 1)) / steps, bn = n0 + ((n1 - n0) * (k + 1)) / steps;
        const ga = ground(ax, an);
        const gb = ground(bx, bn);
        if (Math.abs(ga - gb) > 10 || ground((ax + bx) / 2, (an + bn) / 2) < Math.min(ga, gb) - 6) continue;
        const g = Math.min(ga, gb);
        base = Math.min(base, g);
        const segLen = Math.hypot(bx - ax, bn - an) + 0.5;
        const m = M((ax + bx) / 2, g - 1.5, -(an + bn) / 2, yawOf(bx - ax, bn - an));
        b.add(box(segLen, 10.5, 2.4), mat.tapial, m);
        for (const mg of merlons(segLen, 0.8)) b.add(mg.translate(0, 10.5, 0.8), mat.tapial, m);
      }
      const tg = ground(x0, n0);
      if (Math.abs(tg - ground(x1, n1)) < 25) {
        const m = M(x0, tg - 2, -n0, yawOf(x1 - x0, n1 - n0));
        b.add(box(7, 16, 7), mat.tapial, m);
        for (const mg of merlons(7, 7.4, 1.1, 0.9)) b.add(mg.translate(0, 16, 0), mat.tapial, m);
      }
    }
    add(b, base - 2, 880, 950);

    // Almocábar gate: a horseshoe arch between two towers, on the south wall.
    const g = new Builder();
    const gx = 114;
    const gn = -712;
    const gy = ground(gx, gn) - 1;
    const gm = M(gx, gy, -gn, yawOf(90, -25));
    g.add(box(9, 12, 5), mat.tapial, gm);
    for (const s of [-1, 1]) {
      g.add(box(6, 15, 7).translate(s * 7, 0, 0.5), mat.tapial, gm);
      for (const mg of merlons(6, 7.4, 1.1, 0.9)) g.add(mg.translate(s * 7, 15, 0.5), mat.tapial, gm);
    }
    const arch = new THREE.Shape();
    arch.moveTo(-2, 0);
    arch.lineTo(-2, 4);
    arch.absarc(0, 4, 2.4, Math.PI + 0.55, -0.55, true);
    arch.lineTo(2, 0);
    arch.closePath();
    const opening = new THREE.ExtrudeGeometry(arch, { depth: 5.4, bevelEnabled: false });
    opening.translate(0, 0, -2.7);
    g.add(opening, mat.dark, gm);
    add(g, gy, 1250, 1270);
  }

  // ------------------------------------------------------------------------- Alcazaba (to 1812)
  {
    const [ax, an] = [70, -600];
    const ag = ground(ax, an);
    const b = new Builder();
    const W = 70;
    const D = 50;
    const m0 = M(ax, ag - 3, -an);
    for (const [x, n, w, d] of [[0, D / 2, W, 3], [0, -D / 2, W, 3], [W / 2, 0, 3, D], [-W / 2, 0, 3, D]] as const) {
      b.add(box(w, 16, d).translate(x, 0, -n), mat.tapial, m0);
      const len = Math.max(w, d);
      const along = w > d;
      for (const mg of merlons(len, 0.9)) {
        if (!along) mg.rotateY(Math.PI / 2);
        b.add(mg.translate(x, 16, -n), mat.tapial, m0);
      }
    }
    for (const [sx, sn] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      b.add(box(9, 22, 9).translate((sx * W) / 2, 0, -(sn * D) / 2), mat.tapial, m0);
      for (const mg of merlons(9, 9.4, 1.1, 1)) b.add(mg.translate((sx * W) / 2, 22, -(sn * D) / 2), mat.tapial, m0);
    }
    b.add(box(15, 30, 15).translate(-12, 0, -4), mat.tapial, m0);
    for (const mg of merlons(15, 15.4, 1.2, 1)) b.add(mg.translate(-12, 30, -4), mat.tapial, m0);
    add(b, ag - 4, 950, 1050, 1812);
  }

  return {
    group,
    exclude(x, n) {
      if (excluded.has(key(x, n))) return true;
      for (const [cx, cn, r] of exclusionCircles) if (Math.hypot(x - cx, n - cn) < r) return true;
      return false;
    },
    update(year) {
      for (const u of updaters) u(year);
    },
  };
}
