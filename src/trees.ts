import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { Dem, elevation, Y_OFFSET } from "./data";

/** Leaf silhouettes are shared by all trees: no external asset or per-tree texture. */
function canopyTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  let seed = 73;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  // Separate clusters leave small holes and an irregular silhouette.
  for (let cluster = 0; cluster < 38; cluster++) {
    const angle = rnd() * Math.PI * 2, radius = Math.sqrt(rnd()) * 77;
    const x = 128 + Math.cos(angle) * radius, y = 125 + Math.sin(angle) * radius * 0.9;
    for (let leaf = 0; leaf < 65; leaf++) {
      const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * 29;
      const lx = x + Math.cos(a) * r, ly = y + Math.sin(a) * r;
      const light = 48 + rnd() * 27 + (125 - ly) * 0.08;
      ctx.fillStyle = `hsl(${70 + rnd() * 18} 18% ${light}%)`;
      ctx.beginPath();
      ctx.ellipse(lx, ly, 2 + rnd() * 4, 1.5 + rnd() * 2.5, rnd() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

let sharedCanopy: { geometry: THREE.BufferGeometry; material: THREE.MeshStandardMaterial } | undefined;

export function createCanopy() {
  if (sharedCanopy) return sharedCanopy;
  const planes: THREE.BufferGeometry[] = [];
  // Overlapping small leaf clusters make a volume without a solid polygon silhouette.
  // The golden-angle distribution avoids the visible cross of three full-crown cards.
  for (let i = 0; i < 8; i++) {
    const y = 1 - 2 * (i + 0.5) / 8;
    const radial = Math.sqrt(1 - y * y), angle = i * 2.399963;
    const plane = new THREE.PlaneGeometry(1.2, 1.1)
      .rotateX(y * 0.9).rotateY(angle)
      .translate(Math.cos(angle) * radial * 0.65, y * 0.55, Math.sin(angle) * radial * 0.65);
    planes.push(plane);
  }
  const crownGeo = mergeGeometries(planes)!;
  for (const plane of planes) plane.dispose();
  // Rounded normals give the crossed leaf cards the lighting of a canopy.
  const positions = crownGeo.attributes.position, normals = crownGeo.attributes.normal;
  const normal = new THREE.Vector3();
  for (let i = 0; i < positions.count; i++) {
    normal.fromBufferAttribute(positions, i);
    normal.y = normal.y * 0.35 + 1.2;
    normal.normalize();
    normals.setXYZ(i, normal.x, normal.y, normal.z);
  }
  const crownMat = new THREE.MeshStandardMaterial({
    map: canopyTexture(), roughness: 1, side: THREE.DoubleSide,
    alphaTest: 0.38, alphaToCoverage: true,
  });
  crownMat.onBeforeCompile = (shader) => {
    // Leaf cards represent a volume: keep the outward canopy normal on both sides.
    shader.fragmentShader = shader.fragmentShader.replace("#include <normal_fragment_begin>",
      "#include <normal_fragment_begin>\nnormal *= faceDirection;");
  };
  sharedCanopy = { geometry: crownGeo, material: crownMat };
  return sharedCanopy;
}

/** Small spatial batches let the renderer reject trees outside the view. */
export async function createTrees(dem: Dem): Promise<THREE.Group> {
  const response = await fetch("data/trees.bin");
  if (!response.ok) throw new Error(`Trees: ${response.status}`);
  const raw = new Int16Array(await response.arrayBuffer());
  const { geometry: crownGeo, material: crownMat } = createCanopy();
  const trunkGeo = new THREE.CylinderGeometry(0.12, 0.18, 1, 5, 1, true).translate(0, 0.5, 0);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x625342, roughness: 1 });
  const batches = new Map<string, number[]>();
  for (let i = 0; i < raw.length / 3; i++) {
    const x = raw[i * 3] / 8, n = raw[i * 3 + 1] / 8;
    if (Math.hypot(x, n) < 600) {
      const slopeX = (elevation(dem, x + 3, n) - elevation(dem, x - 3, n)) / 6;
      const slopeN = (elevation(dem, x, n + 3) - elevation(dem, x, n - 3)) / 6;
      // A canopy detected in the aerial image may actually be on the cliff top.
      // Do not plant full-size trees on the near-vertical gorge faces beneath it.
      if (Math.hypot(slopeX, slopeN) > 1.25) continue;
    }
    const key = `${Math.floor(raw[i * 3] / 2000)},${Math.floor(raw[i * 3 + 1] / 2000)}`;
    if (!batches.has(key)) batches.set(key, []);
    batches.get(key)!.push(i);
  }
  const group = new THREE.Group();
  group.name = "Woodland tiles";
  const matrix = new THREE.Matrix4(), q = new THREE.Quaternion(), scale = new THREE.Vector3(), pos = new THREE.Vector3();
  const axis = new THREE.Vector3(0, 1, 0), color = new THREE.Color();
  for (const indices of batches.values()) {
    const crowns = new THREE.InstancedMesh(crownGeo, crownMat, indices.length);
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, indices.length);
    crowns.userData.treeIndices = trunks.userData.treeIndices = indices;
    for (let j = 0; j < indices.length; j++) {
      const i = indices[j], x = raw[i * 3] / 8, n = raw[i * 3 + 1] / 8, size = raw[i * 3 + 2] / 100;
      let seed = i + 1;
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      const y = elevation(dem, x, n) - Y_OFFSET, r = 1.6 + size * 1.7, trunkH = 0.9 + size * 0.9;
      q.setFromAxisAngle(axis, rnd() * Math.PI * 2);
      scale.set(r * (0.9 + rnd() * 0.25), r * (0.8 + rnd() * 0.3), r * (0.9 + rnd() * 0.25));
      pos.set(x, y + trunkH + scale.y * 0.45, -n);
      matrix.compose(pos, q, scale);
      crowns.setMatrixAt(j, matrix);
      color.setHSL(0.20 + rnd() * 0.06, 0.22 + rnd() * 0.16, 0.40 + rnd() * 0.14);
      crowns.setColorAt(j, color);
      scale.set(1 + size * 0.5, trunkH + scale.y * 0.3, 1 + size * 0.5);
      pos.set(x, y - 0.3, -n);
      trunks.setMatrixAt(j, matrix.compose(pos, q, scale));
    }
    crowns.castShadow = crowns.receiveShadow = trunks.receiveShadow = true;
    crowns.computeBoundingSphere();
    trunks.computeBoundingSphere();
    group.add(crowns, trunks);
  }
  return group;
}
