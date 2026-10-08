import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { Dem, elevation, Y_OFFSET } from "./data";
import { orientedBox } from "./buildings";
import { makeLabel } from "./landmarks";
import { metricUV, texturedMaterial } from "./textures";
import { createCanopy } from "./trees";

// Alameda del Tajo (park, 1806) and the cliff-edge walks next to it: gravel ground, lamp posts,
// benches, a stone balustrade along the Paseo de los Ingleses and the Paseo de Blas Infante, the
// balcony that hangs over the cliff and the iron gazebo of the lookout.
// Outlines from OpenStreetMap (scripts/fetch_alameda.py).

type Pt = [number, number];

interface AlamedaData {
  park: Pt[];
  ingleses: Pt[];
  blasInfante: Pt[];
  aldehuela: Pt;
}

export interface Alameda {
  group: THREE.Group;
  update(year: number): void;
}

function inside(x: number, n: number, poly: Pt[]): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, ni] = poly[i];
    const [xj, nj] = poly[j];
    if (ni > n !== nj > n && x < ((xj - xi) * (n - ni)) / (nj - ni) + xi) c = !c;
  }
  return c;
}

/** Points every `step` metres along a polyline, with the direction at each point. */
function along(line: Pt[], step: number): Array<{ x: number; n: number; dx: number; dn: number }> {
  const out: Array<{ x: number; n: number; dx: number; dn: number }> = [];
  let carry = 0;
  for (let i = 0; i < line.length - 1; i++) {
    const [x0, n0] = line[i];
    const [x1, n1] = line[i + 1];
    const len = Math.hypot(x1 - x0, n1 - n0);
    if (len < 1e-3) continue;
    const dx = (x1 - x0) / len;
    const dn = (n1 - n0) / len;
    for (let s = carry; s < len; s += step) out.push({ x: x0 + dx * s, n: n0 + dn * s, dx, dn });
    carry = (carry - len) % step;
    if (carry < 0) carry += step;
  }
  return out;
}

export async function createAlameda(dem: Dem): Promise<Alameda> {
  const data: AlamedaData = await (await fetch("data/alameda.json")).json();
  const ground = (x: number, n: number) => elevation(dem, x, n) - Y_OFFSET;
  const mat = {
    gravel: texturedMaterial("gravel", { albedo: [0.55, 0.47, 0.36], normalScale: 0.6 }),
    stone: texturedMaterial("sandstone", { albedo: [0.62, 0.55, 0.45], scale: 0.5 }),
    white: texturedMaterial("plaster", { albedo: [0.8, 0.78, 0.72] }),
    iron: new THREE.MeshStandardMaterial({ color: 0x1e2421, roughness: 0.5, metalness: 0.5 }),
    wood: new THREE.MeshStandardMaterial({ color: 0x5a3b22, roughness: 0.8 }),
    lamp: new THREE.MeshStandardMaterial({ color: 0xfff2c8, emissive: 0x6b5a30, roughness: 0.4 }),
  };
  const parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const put = (g: THREE.BufferGeometry, m: THREE.Material) => {
    const geo = metricUV(g);
    for (const k of Object.keys(geo.attributes)) if (!["position", "normal", "uv"].includes(k)) geo.deleteAttribute(k);
    if (!parts.has(m)) parts.set(m, []);
    parts.get(m)!.push(geo);
  };
  const place = (g: THREE.BufferGeometry, x: number, y: number, n: number, yaw = 0) =>
    g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, -n), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(1, 1, 1)));

  // Gravel ground: a 2 m grid draped on the terrain, clipped to the park outline.
  {
    const xs = data.park.map((p) => p[0]);
    const ns = data.park.map((p) => p[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), n0 = Math.min(...ns), n1 = Math.max(...ns);
    const step = 2;
    const cols = Math.ceil((x1 - x0) / step) + 1;
    const rows = Math.ceil((n1 - n0) / step) + 1;
    const pos: number[] = [];
    for (let r = 0; r < rows - 1; r++) {
      for (let c = 0; c < cols - 1; c++) {
        const ax = x0 + c * step, an = n0 + r * step;
        if (!inside(ax + step / 2, an + step / 2, data.park)) continue;
        const v = (x: number, n: number) => [x, ground(x, n) + 0.12, -n];
        const a = v(ax, an), b = v(ax + step, an), cc = v(ax + step, an + step), d = v(ax, an + step);
        // Skip cells that cross the cliff edge: they would hang down the rock face.
        const ys = [a[1], b[1], cc[1], d[1]];
        if (Math.max(...ys) - Math.min(...ys) > 1.5) continue;
        pos.push(...a, ...b, ...cc, ...a, ...cc, ...d);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    put(g, mat.gravel);
  }

  // Lamp posts and benches along the inside of the park outline.
  for (const p of along(data.park, 16)) {
    // Step 3 m inwards (towards the polygon centre).
    const cx = data.park.reduce((s, q) => s + q[0], 0) / data.park.length;
    const cn = data.park.reduce((s, q) => s + q[1], 0) / data.park.length;
    const d = Math.hypot(cx - p.x, cn - p.n);
    const x = p.x + ((cx - p.x) / d) * 3;
    const n = p.n + ((cn - p.n) / d) * 3;
    const y = ground(x, n);
    put(place(new THREE.CylinderGeometry(0.07, 0.1, 3.6, 8).translate(0, 1.8, 0), x, y, n), mat.iron);
    put(place(new THREE.CylinderGeometry(0.22, 0.12, 0.5, 8).translate(0, 3.85, 0), x, y, n), mat.lamp);
    put(place(new THREE.ConeGeometry(0.3, 0.3, 8).translate(0, 4.25, 0), x, y, n), mat.iron);
    const yaw = Math.atan2(p.dn, p.dx);
    const bx = x + p.dx * 5;
    const bn = n + p.dn * 5;
    const by = ground(bx, bn);
    put(place(new THREE.BoxGeometry(1.8, 0.08, 0.45).translate(0, 0.45, 0), bx, by, bn, yaw), mat.wood);
    put(place(new THREE.BoxGeometry(1.8, 0.4, 0.06).translate(0, 0.72, -0.22), bx, by, bn, yaw), mat.wood);
    for (const s of [-0.8, 0.8]) put(place(new THREE.BoxGeometry(0.08, 0.45, 0.45).translate(s, 0.22, 0), bx, by, bn, yaw), mat.iron);
  }

  // Stone balustrade along the cliff walks: posts, balusters and a top rail.
  const balustrade = (line: Pt[]) => {
    const pts = along(line, 0.32);
    pts.forEach((p, i) => {
      const y = ground(p.x, p.n);
      const yaw = Math.atan2(p.dn, p.dx);
      if (i % 8 === 0) put(place(new THREE.BoxGeometry(0.4, 1.15, 0.4).translate(0, 0.57, 0), p.x, y, p.n, yaw), mat.stone);
      else put(place(new THREE.CylinderGeometry(0.06, 0.09, 0.85, 6).translate(0, 0.52, 0), p.x, y, p.n), mat.white);
    });
    for (let i = 0; i < line.length - 1; i++) {
      const [x0, n0] = line[i];
      const [x1, n1] = line[i + 1];
      const len = Math.hypot(x1 - x0, n1 - n0);
      if (len < 0.2) continue;
      const mx = (x0 + x1) / 2;
      const mn = (n0 + n1) / 2;
      const yaw = Math.atan2(n1 - n0, x1 - x0);
      const y = Math.max(ground(x0, n0), ground(x1, n1));
      put(place(new THREE.BoxGeometry(len + 0.3, 0.16, 0.34).translate(0, 1.02, 0), mx, y, mn, yaw), mat.stone);
      put(place(new THREE.BoxGeometry(len + 0.3, 0.14, 0.4).translate(0, 0.08, 0), mx, y, mn, yaw), mat.stone);
    }
  };
  balustrade(data.ingleses);
  balustrade(data.blasInfante);

  // The balcony that hangs over the cliff: the westernmost point of the Paseo de los Ingleses
  // next to the park, facing away from the park.
  const balcony = new THREE.Group();
  {
    const cx = data.park.reduce((s, q) => s + q[0], 0) / data.park.length;
    const cn = data.park.reduce((s, q) => s + q[1], 0) / data.park.length;
    const cands = data.ingleses.filter(([, n]) => n > cn - 60 && n < cn + 60);
    const [bx, bn] = cands.reduce((a, b) => (b[0] < a[0] ? b : a));
    const ox = bx - cx;
    const on = bn - cn;
    const d = Math.hypot(ox, on);
    const yaw = Math.atan2(on / d, ox / d);
    const y = ground(bx + (cx - bx) / d * 2, bn + (cn - bn) / d * 2);
    const b: THREE.BufferGeometry[] = [];
    const railing: THREE.BufferGeometry[] = [];
    b.push(new THREE.BoxGeometry(4.5, 0.25, 3.2).translate(2.3, -0.12, 0)); // slab, local +X points outwards
    for (const s of [-1.2, 1.2]) b.push(new THREE.BoxGeometry(3.6, 0.5, 0.25).translate(1.8, -0.6, s).rotateZ(0.0));
    for (let i = 0; i <= 18; i++) {
      const t = i / 18;
      const px = t < 0.33 ? 0.6 + (t / 0.33) * 3.9 : t < 0.67 ? 4.5 : 4.5 - ((t - 0.67) / 0.33) * 3.9;
      const pz = t < 0.33 ? -1.55 : t < 0.67 ? -1.55 + ((t - 0.33) / 0.34) * 3.1 : 1.55;
      railing.push(new THREE.CylinderGeometry(0.025, 0.025, 1.0, 5).translate(px, 0.5, pz));
    }
    for (const [x0, z0, x1, z1] of [[0.6, -1.55, 4.5, -1.55], [4.5, -1.55, 4.5, 1.55], [4.5, 1.55, 0.6, 1.55]]) {
      const len = Math.hypot(x1 - x0, z1 - z0);
      const rail = new THREE.BoxGeometry(len, 0.06, 0.06);
      rail.rotateY(-Math.atan2(z1 - z0, x1 - x0));
      railing.push(rail.translate((x0 + x1) / 2, 1.0, (z0 + z1) / 2));
    }
    const m = new THREE.Matrix4().compose(new THREE.Vector3(bx, y, -bn), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(1, 1, 1));
    const slab = new THREE.Mesh(metricUV(mergeGeometries(b)!.applyMatrix4(m)), mat.stone);
    const rails = new THREE.Mesh(mergeGeometries(railing)!.applyMatrix4(m), mat.iron);
    for (const o of [slab, rails]) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
    balcony.add(slab, rails);
    const l = makeLabel("Balcón del Tajo", "mirador de la Alameda");
    l.obj.position.set(bx, y + 14, -bn);
    balcony.add(l.obj);
  }

  // Iron gazebo of the lookout on the Paseo de Blas Infante: stepped stone base, slender posts
  // and a pyramid roof.
  const gazebo = new THREE.Group();
  {
    const loop = data.blasInfante.slice(5, 14);
    const gx = loop.reduce((s, q) => s + q[0], 0) / loop.length;
    const gn = loop.reduce((s, q) => s + q[1], 0) / loop.length;
    const y = ground(gx, gn);
    const iron: THREE.BufferGeometry[] = [];
    const stone: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 3; i++) stone.push(new THREE.BoxGeometry(6.4 - i * 0.6, 0.25, 6.4 - i * 0.6).translate(0, 0.125 + i * 0.25, 0));
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      iron.push(new THREE.CylinderGeometry(0.06, 0.06, 3.3, 6).translate(Math.cos(a) * 2.5, 0.75 + 1.65, Math.sin(a) * 2.5));
    }
    iron.push(new THREE.CylinderGeometry(2.7, 2.7, 0.25, 8, 1, true).translate(0, 4.0, 0));
    iron.push(new THREE.ConeGeometry(3.1, 1.6, 8).translate(0, 4.9, 0));
    iron.push(new THREE.SphereGeometry(0.2, 8, 6).translate(0, 5.8, 0));
    const at = new THREE.Matrix4().makeTranslation(gx, y, -gn);
    const s = new THREE.Mesh(metricUV(mergeGeometries(stone)!.applyMatrix4(at)), mat.stone);
    const ir = new THREE.Mesh(mergeGeometries(iron.map((g) => g.toNonIndexed()))!.applyMatrix4(at), mat.iron);
    for (const o of [s, ir]) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
    gazebo.add(s, ir);
    const l = makeLabel("Mirador de Blas Infante", "templete");
    l.obj.position.set(gx, y + 16, -gn);
    gazebo.add(l.obj);
  }

  // Rows of plane trees along the walks (photos of the Alameda show a closed canopy).
  const planes = new THREE.Group();
  {
    const box = orientedBox(data.park);
    const vx = -box.un;
    const vn = box.ux;
    const spots: Pt[] = [];
    let k = 1;
    const jit = () => ((k = (k * 16807) % 2147483647) / 2147483647 - 0.5) * 3;
    for (let su = -box.a + 6; su <= box.a - 6; su += 11) {
      for (let sv = -box.b + 5; sv <= box.b - 5; sv += 13) {
        const x = box.cx + box.ux * su + vx * sv + jit();
        const n = box.cn + box.un * su + vn * sv + jit();
        if (inside(x, n, data.park)) spots.push([x, n]);
      }
    }
    const { geometry: crown, material: crownMat } = createCanopy();
    const trunk = new THREE.CylinderGeometry(0.22, 0.3, 1, 7).translate(0, 0.5, 0);
    const crowns = new THREE.InstancedMesh(crown, crownMat, spots.length);
    const trunks = new THREE.InstancedMesh(trunk, new THREE.MeshStandardMaterial({ color: 0x8c8370, roughness: 0.9 }), spots.length);
    const m4 = new THREE.Matrix4();
    spots.forEach(([x, n], i) => {
      const y = ground(x, n);
      const k = 0.85 + ((i * 7919) % 100) / 300;
      m4.compose(new THREE.Vector3(x, y + 7.5 * k, -n), new THREE.Quaternion(), new THREE.Vector3(5.2 * k, 4.2 * k, 5.2 * k));
      crowns.setMatrixAt(i, m4);
      crowns.setColorAt(i, new THREE.Color().setHSL(0.24, 0.3, 0.44 + (i % 7) * 0.02));
      m4.compose(new THREE.Vector3(x, y, -n), new THREE.Quaternion(), new THREE.Vector3(1, 5.5 * k, 1));
      trunks.setMatrixAt(i, m4);
    });
    crowns.castShadow = trunks.castShadow = true;
    crowns.receiveShadow = true;
    planes.add(crowns, trunks);
  }

  const park = new THREE.Group();
  for (const [m, geos] of parts) {
    const mesh = new THREE.Mesh(mergeGeometries(geos)!, m);
    mesh.castShadow = m !== mat.gravel;
    mesh.receiveShadow = true;
    park.add(mesh);
  }
  const group = new THREE.Group();
  group.add(park, planes, balcony, gazebo);
  return {
    group,
    update(year) {
      park.visible = year >= 1806;
      planes.visible = year >= 1806;
      planes.scale.y = 1;
      balcony.visible = year >= 1900;
      gazebo.visible = year >= 1950;
    },
  };
}
