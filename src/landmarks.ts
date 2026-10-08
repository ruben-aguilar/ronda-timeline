import * as THREE from "three";
import { CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { Dem, elevation, Y_OFFSET } from "./data";

// Positions are local metres (x east, n north), converted from OpenStreetMap coordinates.
export const PLACES = {
  puenteNuevo: [6, -26],
  puenteViejo: [239, -134],
  puenteArabe: [266, -174],
  plazaToros: [-98, 158],
  santaMaria: [44, -386],
  banos: [285, -224],
  almocabar: [114, -708],
  mondragon: [-83, -373],
  espirituSanto: [169, -667],
  padreJesus: [299, -60],
  alameda: [-107, 315],
  reyMoro: [145, -127],
  estacion: [462, 907],
  socorro: [19, 233],
  santoDomingo: [50, -83],
  alcazaba: [70, -600], // approximate: the citadel stood at the south end of the medina
} as const satisfies Record<string, readonly [number, number]>;

interface LabelDef {
  at: readonly [number, number];
  from: number;
  to: number;
  /** Name changes over time, e.g. mosque -> church. */
  names: Array<[number, string]>;
  note: string;
  lift?: number;
  /** 1 = always shown, 2 = shown only when the camera is close. */
  rank?: 1 | 2;
}

const LABELS: LabelDef[] = [
  { at: PLACES.puenteNuevo, from: 1735, to: 9999, names: [[1735, "Primer puente (se hunde en 1741)"], [1759, "Puente Nuevo (en obras)"], [1793, "Puente Nuevo"]], note: "1759–1793", lift: 110, rank: 1 },
  { at: PLACES.puenteViejo, from: 1616, to: 9999, names: [[1616, "Puente Viejo"]], note: "reconstruido en 1616" },
  { at: PLACES.puenteArabe, from: 1300, to: 9999, names: [[1300, "Puente Árabe"]], note: "puente medieval" },
  { at: PLACES.plazaToros, from: 1779, to: 9999, names: [[1779, "Plaza de toros (en obras)"], [1785, "Plaza de toros de la Real Maestranza"]], note: "inaugurada en 1785", rank: 1 },
  { at: PLACES.santaMaria, from: 1000, to: 9999, names: [[1000, "Mezquita mayor"], [1485, "Santa María la Mayor"]], note: "mezquita, iglesia desde 1485", rank: 1 },
  { at: PLACES.banos, from: 1280, to: 9999, names: [[1280, "Baños árabes"]], note: "siglos XIII–XIV" },
  { at: PLACES.almocabar, from: 1250, to: 9999, names: [[1250, "Puerta de Almocábar"]], note: "siglo XIII", rank: 1 },
  { at: PLACES.mondragon, from: 1314, to: 9999, names: [[1314, "Palacio de Mondragón"]], note: "siglo XIV" },
  { at: PLACES.espirituSanto, from: 1505, to: 9999, names: [[1505, "Iglesia del Espíritu Santo"]], note: "1505" },
  { at: PLACES.padreJesus, from: 1500, to: 9999, names: [[1500, "Iglesia de Padre Jesús"]], note: "siglos XV–XVI" },
  { at: PLACES.reyMoro, from: 1300, to: 9999, names: [[1300, "La Mina"], [1709, "Casa del Rey Moro"]], note: "mina del siglo XIV" },
  { at: PLACES.santoDomingo, from: 1485, to: 9999, names: [[1485, "Convento de Santo Domingo"]], note: "fundado en 1485" },
  { at: PLACES.alameda, from: 1806, to: 9999, names: [[1806, "Alameda del Tajo"]], note: "parque, 1806" },
  { at: PLACES.estacion, from: 1892, to: 9999, names: [[1892, "Estación de tren"]], note: "1892", rank: 1 },
  { at: PLACES.socorro, from: 1918, to: 9999, names: [[1918, "Plaza del Socorro"]], note: "bandera andaluza, 1918" },
  { at: PLACES.alcazaba, from: 950, to: 1830, names: [[950, "Alcazaba"], [1812, "Ruinas de la Alcazaba"]], note: "volada en 1812, ubicación aproximada", rank: 1 },
  { at: PLACES.santaMaria, from: -650, to: 711, names: [[-650, "Poblado íbero"], [-206, "Arunda"]], note: "extensión desconocida", lift: 70, rank: 1 },
];

// Off-scene places, shown as labels at the edge of the map.
const EDGE_LABELS: Array<{ dir: [number, number]; from: number; to: number; name: string; note: string }> = [
  { dir: [-9341, -5662], from: -25000, to: -800, name: "← Cueva de la Pileta", note: "pinturas rupestres, a ~11 km al SO" },
  { dir: [-6666, 9262], from: -206, to: 600, name: "← Acinipo", note: "ciudad romana, a ~11 km al NO" },
];

interface Timed {
  update(year: number): void;
}

function makeLabel(text: string, note: string): { obj: CSS2DObject; set(name: string): void } {
  const el = document.createElement("div");
  el.className = "label";
  const t = document.createElement("div");
  t.className = "label-name";
  t.textContent = text;
  const n = document.createElement("div");
  n.className = "label-note";
  n.textContent = note;
  el.append(t, n);
  const obj = new CSS2DObject(el);
  return {
    obj,
    set(name: string) {
      if (t.textContent !== name) t.textContent = name;
    },
  };
}

/** Stone with an ashlar pattern: blocks in staggered rows, mortar joints and colour variation. */
function masonry(color: number, block = 1.3, course = 0.62): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.92 });
  mat.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vMW;\nvarying vec3 vMN;")
      .replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\nvMW = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvMN = normalize(mat3(modelMatrix) * objectNormal);");
    s.fragmentShader = s.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vMW;\nvarying vec3 vMN;\nfloat mHash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }")
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
vec3 an = abs(vMN);
vec2 q = an.y > 0.7 ? vMW.xz : vec2(an.x > an.z ? vMW.z : vMW.x, vMW.y);
float row = floor(q.y / ${course.toFixed(2)});
vec2 b = vec2((q.x / ${block.toFixed(2)}) + row * 0.5, q.y / ${course.toFixed(2)});
vec2 f = fract(b);
float joint = smoothstep(0.0, 0.05, min(min(f.x, 1.0 - f.x) * ${(block / course).toFixed(2)}, min(f.y, 1.0 - f.y)));
float tone = 0.82 + 0.3 * mHash(floor(b));
diffuseColor.rgb *= mix(0.55, tone, joint);`,
      );
  };
  return mat;
}
const stone = masonry(0xc9a87e);
const darkStone = masonry(0xa58a68, 1.1, 0.55);

/** Pick the bridge direction with the shortest span that reaches the deck height on both sides. */
function bridgeAxis(dem: Dem, c: readonly [number, number], deck: number): { ang: number; a: number; b: number; bottom: number } {
  let best = { ang: 0, a: 40, b: 40, span: 1e9 };
  for (let deg = 0; deg < 180; deg += 3) {
    const ang = (deg * Math.PI) / 180;
    const dx = Math.sin(ang);
    const dn = Math.cos(ang);
    const reach = (sgn: number) => {
      for (let s = 2; s < 120; s += 1) if (elevation(dem, c[0] + dx * s * sgn, c[1] + dn * s * sgn) >= deck) return s;
      return 999;
    };
    const a = reach(1);
    const b = reach(-1);
    if (a + b < best.span) best = { ang, a, b, span: a + b };
  }
  let bottom = 1e9;
  for (let s = -best.b; s <= best.a; s += 1) {
    bottom = Math.min(bottom, elevation(dem, c[0] + Math.sin(best.ang) * s, c[1] + Math.cos(best.ang) * s));
  }
  return { ang: best.ang, a: best.a, b: best.b, bottom };
}

/** A stone bridge: the elevation profile of the gorge with arches cut into it, extruded across. */
function makeBridge(dem: Dem, c: readonly [number, number], deck: number, width: number, arches: Array<[number, number, number]>) {
  const ax = bridgeAxis(dem, c, deck);
  const L0 = -ax.b - 4;
  const L1 = ax.a + 4;
  const ground = (s: number) => Math.min(elevation(dem, c[0] + Math.sin(ax.ang) * s, c[1] + Math.cos(ax.ang) * s), deck - 1) - Y_OFFSET - 4;
  const h = deck - ax.bottom;
  // arches: [centre along axis (fraction of span, -0.5..0.5), width (m), spring height (fraction of h)]
  const notches = arches
    .map(([fc, w, fy]) => {
      const cx = (L0 + L1) / 2 + fc * (L1 - L0);
      const spring = Math.max(ax.bottom - Y_OFFSET + fy * h, ground(cx - w / 2) + 3, ground(cx + w / 2) + 3);
      return { cx, w, spring };
    })
    .filter((a) => a.spring + a.w / 2 < deck - Y_OFFSET - 3)
    .sort((a, b) => b.cx - a.cx);
  // Outline: the deck from left to right, then the lower edge back from right to left, following
  // the ground and cutting each arch as a notch.
  const shape = new THREE.Shape();
  shape.moveTo(L0, deck - Y_OFFSET);
  shape.lineTo(L1, deck - Y_OFFSET);
  let s = L1;
  for (const a of notches) {
    for (; s > a.cx + a.w / 2; s -= 2) shape.lineTo(s, ground(s));
    s = a.cx + a.w / 2;
    shape.lineTo(s, ground(s));
    shape.lineTo(s, a.spring);
    shape.absarc(a.cx, a.spring, a.w / 2, 0, Math.PI, false);
    s = a.cx - a.w / 2;
    shape.lineTo(s, ground(s));
    s -= 2;
  }
  for (; s >= L0; s -= 2) shape.lineTo(s, ground(s));
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false, curveSegments: 16 });
  geo.translate(0, 0, -width / 2);
  const mesh = new THREE.Mesh(geo, stone);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  // Local shape X runs along the bridge axis. Rotate so it follows the bearing.
  const g = new THREE.Group();
  g.add(mesh);
  g.position.set(c[0], 0, -c[1]);
  g.rotation.y = Math.PI / 2 - ax.ang;
  return { group: g, bottom: ax.bottom - Y_OFFSET, top: deck - Y_OFFSET };
}

/** Grows an object upwards between two years, by scaling it from its base. */
function growing(obj: THREE.Object3D, base: number, from: number, to: number, end = 1e9): Timed {
  const pivot = new THREE.Group();
  pivot.position.y = base;
  obj.position.y -= base;
  pivot.add(obj);
  (obj as THREE.Object3D & { __pivot?: THREE.Group }).__pivot = pivot;
  return {
    update(year) {
      const t = to <= from ? (year >= from ? 1 : 0) : Math.min(Math.max((year - from) / (to - from), 0), 1);
      pivot.visible = t > 0 && year < end;
      pivot.scale.y = Math.max(t, 0.001);
    },
  };
}

function box(w: number, h: number, d: number, mat: THREE.Material) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export interface Landmarks {
  group: THREE.Group;
  update(year: number, camera: THREE.Camera): void;
}

export function createLandmarks(dem: Dem, cityWall: number[][]): Landmarks {
  const group = new THREE.Group();
  const timed: Timed[] = [];
  const Y = (x: number, n: number) => elevation(dem, x, n) - Y_OFFSET;

  const add = (obj: THREE.Object3D, base: number, from: number, to: number, end?: number) => {
    const t = growing(obj, base, from, to, end);
    group.add((obj as THREE.Object3D & { __pivot: THREE.Group }).__pivot);
    timed.push(t);
  };

  // Bridges.
  const nuevo = makeBridge(dem, PLACES.puenteNuevo, 719, 15, [[0, 20, 0.42], [-0.3, 8, 0.25], [0.3, 8, 0.25]]);
  add(nuevo.group, nuevo.bottom, 1759, 1793);
  const first = makeBridge(dem, PLACES.puenteNuevo, 714, 9, [[0, 34, 0.75]]);
  add(first.group, first.bottom, 1735, 1740, 1741);
  const viejo = makeBridge(dem, PLACES.puenteViejo, 683, 7, [[0, 10, 0.5]]);
  add(viejo.group, viejo.bottom, 1614, 1616);
  const arabe = makeBridge(dem, PLACES.puenteArabe, 662, 5, [[0, 6, 0.3]]);
  add(arabe.group, arabe.bottom, 1290, 1300);

  // City walls of the medina: every side except the gorge, which is protected by the cliff.
  const wallGroup = new THREE.Group();
  let wallBase = 1e9;
  for (let i = 0; i < cityWall.length; i++) {
    const [x0, n0] = cityWall[i];
    const [x1, n1] = cityWall[(i + 1) % cityWall.length];
    if (n0 > -100 && n1 > -100) continue;
    const len = Math.hypot(x1 - x0, n1 - n0);
    const steps = Math.max(1, Math.ceil(len / 12));
    for (let s = 0; s < steps; s++) {
      const t0 = s / steps;
      const t1 = (s + 1) / steps;
      const ax = x0 + (x1 - x0) * t0, an = n0 + (n1 - n0) * t0;
      const bx = x0 + (x1 - x0) * t1, bn = n0 + (n1 - n0) * t1;
      const ga = Y(ax, an);
      const gb = Y(bx, bn);
      // Skip pieces that would hang over a cliff: the cliffs were the defence there.
      if (Math.abs(ga - gb) > 10 || Y((ax + bx) / 2, (an + bn) / 2) < Math.min(ga, gb) - 6) continue;
      const g = Math.min(ga, gb);
      wallBase = Math.min(wallBase, g);
      const seg = box(Math.hypot(bx - ax, bn - an) + 0.6, 9, 2.2, darkStone);
      seg.position.set((ax + bx) / 2, g + 1.5, -(an + bn) / 2);
      seg.rotation.y = Math.atan2(bn - an, bx - ax);
      wallGroup.add(seg);
    }
    const tg = Y(x0, n0);
    if (Math.abs(tg - Y(x1, n1)) < 25) {
      const tower = box(7, 15, 7, darkStone);
      tower.position.set(x0, tg + 4, -n0);
      wallGroup.add(tower);
    }
  }
  add(wallGroup, wallBase, 880, 950);

  // Alcazaba (citadel). Destroyed in 1812; the shape is illustrative.
  const alc = new THREE.Group();
  const [ax, an] = PLACES.alcazaba;
  const ag = Y(ax, an);
  const W = 70, D = 50;
  for (const [x, n, w, d] of [[0, D / 2, W, 3], [0, -D / 2, W, 3], [W / 2, 0, 3, D], [-W / 2, 0, 3, D]] as const) {
    const b = box(w, 16, d, darkStone);
    b.position.set(ax + x, ag + 4, -(an + n));
    alc.add(b);
  }
  for (const [x, n] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const t = box(9, 22, 9, darkStone);
    t.position.set(ax + (x * W) / 2, ag + 7, -(an + (n * D) / 2));
    alc.add(t);
  }
  const keep = box(14, 28, 14, darkStone);
  keep.position.set(ax - 12, ag + 10, -(an + 4));
  alc.add(keep);
  add(alc, ag - 4, 950, 1050, 1812);

  // Labels.
  const labels = LABELS.map((d) => {
    const l = makeLabel(d.names[0][1], d.note);
    const g = Y(d.at[0], d.at[1]);
    l.obj.position.set(d.at[0], g + (d.lift ?? 35), -d.at[1]);
    group.add(l.obj);
    return { d, l };
  });
  const edges = EDGE_LABELS.map((e) => {
    const l = makeLabel(e.name, e.note);
    const len = Math.hypot(e.dir[0], e.dir[1]);
    const x = (e.dir[0] / len) * 1750;
    const n = (e.dir[1] / len) * 1750;
    l.obj.position.set(x, Y(x, n) + 60, -n);
    l.obj.element.classList.add("edge");
    group.add(l.obj);
    return { e, l };
  });

  return {
    group,
    update(year, camera) {
      for (const t of timed) t.update(year);
      for (const { d, l } of labels) {
        const near = (d.rank ?? 2) === 1 || camera.position.distanceTo(l.obj.position) < 1300;
        const on = near && year >= d.from && year < d.to;
        l.obj.visible = on;
        if (on) {
          let name = d.names[0][1];
          for (const [y, nm] of d.names) if (year >= y) name = nm;
          l.set(name);
        }
      }
      for (const { e, l } of edges) l.obj.visible = year >= e.from && year < e.to;
    },
  };
}
