import * as THREE from "three";
import { Dem, elevation, Y_OFFSET } from "./data";

type Point = [number, number];
interface Line { points: Point[]; gauge: number }

/** Modern OSM alignment. Dimensions of sleepers and rail sections are illustrative. */
export async function createRailway(dem: Dem) {
  const data: { tracks: Line[]; platforms: Line[] } = await (await fetch("data/railway.json")).json();
  const group = new THREE.Group();
  group.name = "Station railway detail";
  const ground = (x: number, n: number) => elevation(dem, x, n) - Y_OFFSET;
  const rails: THREE.Matrix4[] = [], sleepers: THREE.Matrix4[] = [];
  const up = new THREE.Vector3(0, 1, 0);
  const transform = (x: number, n: number, yaw: number, sx: number, sy: number, sz: number, lift: number) =>
    new THREE.Matrix4().compose(new THREE.Vector3(x, ground(x, n) + lift, -n),
      new THREE.Quaternion().setFromAxisAngle(up, yaw), new THREE.Vector3(sx, sy, sz));
  for (const line of data.tracks) {
    let carry = 0;
    for (let i = 1; i < line.points.length; i++) {
      const [ax, an] = line.points[i - 1], [bx, bn] = line.points[i];
      const length = Math.hypot(bx - ax, bn - an);
      if (length < 0.01) continue;
      const dx = (bx - ax) / length, dn = (bn - an) / length;
      const yaw = Math.atan2(dn, dx);
      // Four metre rail sections follow the 5 m elevation model closely.
      const steps = Math.ceil(length / 4);
      for (let j = 0; j < steps; j++) {
        const start = j * length / steps, end = (j + 1) * length / steps;
        for (const side of [-1, 1]) {
          const offset = side * line.gauge / 2;
          const x0 = ax + dx * start - dn * offset, n0 = an + dn * start + dx * offset;
          const x1 = ax + dx * end - dn * offset, n1 = an + dn * end + dx * offset;
          const a = new THREE.Vector3(x0, ground(x0, n0) + 0.24, -n0);
          const b = new THREE.Vector3(x1, ground(x1, n1) + 0.24, -n1);
          const direction = b.clone().sub(a);
          rails.push(new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5),
            new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), direction.clone().normalize()),
            new THREE.Vector3(direction.length(), 0.14, 0.09)));
        }
      }
      for (let distance = carry; distance < length; distance += 0.65) {
        sleepers.push(transform(ax + dx * distance, an + dn * distance, yaw, 0.24, 0.12, 2.65, 0.1));
      }
      carry = ((carry - length) % 0.65 + 0.65) % 0.65;
    }
  }
  const instances = (matrices: THREE.Matrix4[], color: number, metalness = 0) => {
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color, metalness, roughness: metalness ? 0.48 : 0.95 }), matrices.length);
    matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };
  instances(rails, 0x61594d, 0.65);
  const ties = instances(sleepers, 0x999387);

  const vertices: number[] = [];
  for (const platform of data.platforms) {
    const ring = platform.points.slice(0, -1);
    const contour = ring.map(([x, n]) => new THREE.Vector2(x, -n));
    for (const triangle of THREE.ShapeUtils.triangulateShape(contour, [])) {
      // ShapeUtils gives counter-clockwise XY triangles; reversing gives upward XZ normals.
      for (const index of triangle.reverse()) {
        const [x, n] = ring[index];
        vertices.push(x, ground(x, n) + 0.48, -n);
      }
    }
    for (let i = 0; i < ring.length; i++) {
      const [x, n] = ring[i], [xx, nn] = ring[(i + 1) % ring.length];
      const y = ground(x, n), yy = ground(xx, nn);
      vertices.push(x, y, -n, xx, yy, -nn, xx, yy + 0.48, -nn,
        x, y, -n, xx, yy + 0.48, -nn, x, y + 0.48, -n);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.computeVertexNormals();
  const platforms = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0xbcb5a4, roughness: 0.95, side: THREE.DoubleSide }));
  platforms.receiveShadow = true;
  group.add(platforms);
  group.visible = false;
  return {
    group,
    update(year: number, camera: THREE.Camera) {
      const distance = Math.hypot(camera.position.x - 650, camera.position.z + 1050, camera.position.y - ground(650, 1050));
      // Current mapping must not be presented as a reconstruction of the historic yard.
      group.visible = year >= 2022 && distance < 1500;
      ties.visible = distance < 650;
    },
  };
}
