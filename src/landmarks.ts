import { t as translate, onLanguageChange } from "./i18n";
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
  { at: [1766, 1561], from: 2022, to: 9999, names: [[2022, "Entrada noreste · A-367"]], note: "carretera de Ardales a Ronda", lift: 20 },
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

export function makeLabel(text: string, note: string): { obj: CSS2DObject; set(name: string): void } {
  const el = document.createElement("div");
  el.className = "label";
  const t = document.createElement("div");
  t.className = "label-name";
  let currentName = text;
  t.textContent = translate(text);
  const n = document.createElement("div");
  n.className = "label-note";
  n.textContent = translate(note);
  onLanguageChange(() => { t.textContent = translate(currentName); n.textContent = translate(note); });
  el.append(t, n);
  const obj = new CSS2DObject(el);
  return {
    obj,
    set(name: string) {
      currentName = name;
      const translated = translate(name);
      if (t.textContent !== translated) t.textContent = translated;
    },
  };
}

export interface Landmarks {
  group: THREE.Group;
  update(year: number, camera: THREE.Camera): void;
}

export function createLandmarks(dem: Dem): Landmarks {
  const group = new THREE.Group();
  const Y = (x: number, n: number) => elevation(dem, x, n) - Y_OFFSET;

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
      const occupied: Array<{ x: number; y: number; width: number }> = [];
      const projected = new THREE.Vector3();
      const sample = new THREE.Vector3();
      const ordered = [...labels].sort((a, b) => (a.d.rank ?? 2) - (b.d.rank ?? 2) || camera.position.distanceToSquared(a.l.obj.position) - camera.position.distanceToSquared(b.l.obj.position));
      for (const { d, l } of ordered) {
        l.obj.visible = false;
        const distance = camera.position.distanceTo(l.obj.position);
        if (year < d.from || year >= d.to || ((d.rank ?? 2) !== 1 && distance > 1300)) continue;
        projected.copy(l.obj.position).project(camera);
        if (projected.z < -1 || projected.z > 1 || Math.abs(projected.x) > 0.95 || Math.abs(projected.y) > 0.85) continue;
        // A label behind the gorge wall should not appear to float on the rock in front.
        let occluded = false;
        for (let i = 1; i < 20; i++) {
          sample.lerpVectors(camera.position, l.obj.position, i / 20);
          if (sample.y < Y(sample.x, -sample.z) + 2) { occluded = true; break; }
        }
        if (occluded) continue;
        let name = d.names[0][1];
        for (const [y, nm] of d.names) if (year >= y) name = nm;
        const x = (projected.x + 1) * innerWidth / 2;
        const y = (1 - projected.y) * innerHeight / 2;
        const width = Math.max(translate(name).length * 7, 90);
        if (occupied.length >= 7 || occupied.some(p => Math.abs(p.x - x) < (p.width + width) / 2 + 12 && Math.abs(p.y - y) < 52)) continue;
        occupied.push({ x, y, width });
        l.set(name);
        l.obj.visible = true;
      }
      for (const { e, l } of edges) l.obj.visible = year >= e.from && year < e.to;
    },
  };
}
