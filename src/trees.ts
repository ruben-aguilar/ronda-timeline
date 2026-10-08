import * as THREE from "three";
import { Dem, elevation, Y_OFFSET } from "./data";

// Trees detected in the 2024 orthophoto (scripts/make_landscape.py): olive groves, holm oaks and
// the woods inside the gorge. One instanced mesh for crowns and one for trunks.

export async function createTrees(dem: Dem): Promise<THREE.Group> {
  const buf = await (await fetch("data/trees.bin")).arrayBuffer();
  const raw = new Int16Array(buf);
  const count = raw.length / 3;

  const crownGeo = new THREE.IcosahedronGeometry(1, 1);
  // Round, slightly flattened crowns with smooth normals.
  const p = crownGeo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(p, i);
    const n = v.clone().normalize();
    const wobble = 1 + (Math.sin(v.x * 5.1) * Math.cos(v.z * 4.3)) * 0.12;
    v.copy(n).multiplyScalar(wobble);
    v.y *= 0.8;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  crownGeo.computeVertexNormals();
  const trunkGeo = new THREE.CylinderGeometry(0.12, 0.18, 1, 5, 1, true);
  trunkGeo.translate(0, 0.5, 0);

  const crownMat = new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0 });
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3a2a, roughness: 1 });
  const crowns = new THREE.InstancedMesh(crownGeo, crownMat, count);
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, count);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const t = new THREE.Vector3();
  const c = new THREE.Color();
  let seed = 1;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

  for (let i = 0; i < count; i++) {
    const x = raw[i * 3] / 8;
    const n = raw[i * 3 + 1] / 8;
    const size = raw[i * 3 + 2] / 100;
    const y = elevation(dem, x, n) - Y_OFFSET;
    const r = 1.6 + size * 1.7;
    const trunkH = 0.9 + size * 0.9;
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * Math.PI * 2);
    s.set(r * (0.85 + rnd() * 0.3), r * (0.75 + rnd() * 0.35), r * (0.85 + rnd() * 0.3));
    t.set(x, y + trunkH + s.y * 0.55, -n);
    m.compose(t, q, s);
    crowns.setMatrixAt(i, m);
    c.setHSL(0.2 + rnd() * 0.08, 0.32 + rnd() * 0.18, 0.14 + rnd() * 0.1);
    crowns.setColorAt(i, c);
    s.set(1 + size * 0.5, trunkH + s.y * 0.4, 1 + size * 0.5);
    t.set(x, y - 0.3, -n);
    m.compose(t, q, s);
    trunks.setMatrixAt(i, m);
  }
  crowns.castShadow = true;
  crowns.receiveShadow = true;
  trunks.receiveShadow = true;
  crowns.computeBoundingSphere();
  trunks.computeBoundingSphere();
  const g = new THREE.Group();
  g.add(crowns, trunks);
  return g;
}
