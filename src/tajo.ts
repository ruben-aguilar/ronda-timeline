import * as THREE from "three";
import { Dem, elevation, Y_OFFSET } from "./data";
import { texturedMaterial } from "./textures";

/** Ground-following surfaces on mapped lines; widths are visual estimates. */
export async function createTajo(dem: Dem) {
  const data: { lines: { kind: string; points: [number, number][] }[] } = await (await fetch("data/tajo.json")).json();
  const group = new THREE.Group();
  group.name = "Tajo river and paths";
  const pathMaterial = texturedMaterial("cobble", { albedo: [0.47, 0.42, 0.33], normalScale: 0.45, scale: 0.7 });
  const riverMaterial = new THREE.MeshStandardMaterial({ color: 0x465f55, metalness: 0.1, roughness: 0.3, side: THREE.DoubleSide });
  const paths = { positions: [] as number[], uv: [] as number[] };
  const river = { positions: [] as number[], uv: [] as number[] };
  const ground = (x: number, n: number) => elevation(dem, x, n) - Y_OFFSET;
  for (const line of data.lines) {
    const water = line.kind === "river", width = water ? 2.6 : 1.5;
    const output = water ? river : paths;
    let distance = 0;
    for (let i = 1; i < line.points.length; i++) {
      const [x, n] = line.points[i - 1], [xx, nn] = line.points[i];
      const length = Math.hypot(xx - x, nn - n);
      if (length < 0.01) continue;
      const dx = (xx - x) / length, dn = (nn - n) / length;
      const count = Math.ceil(length / 1.5);
      for (let j = 0; j < count; j++) {
        const a = j / count, b = (j + 1) / count;
        const point = (t: number, side: number) => {
          const cx = x + (xx - x) * t, cn = n + (nn - n) * t;
          const px = cx - dn * width * side / 2, pn = cn + dx * width * side / 2;
          return [px, (water ? ground(cx, cn) : ground(px, pn)) + 0.14, -pn];
        };
        const p = point(a, -1), q = point(a, 1), r = point(b, 1), s = point(b, -1);
        output.positions.push(...p, ...q, ...r, ...p, ...r, ...s);
        output.uv.push(0, distance + a * length, width, distance + a * length, width, distance + b * length,
          0, distance + a * length, width, distance + b * length, 0, distance + b * length);
      }
      distance += length;
    }
  }
  const add = (source: typeof paths, material: THREE.Material) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(source.positions, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(source.uv, 2));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, material);
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };
  pathMaterial.side = THREE.DoubleSide;
  const pathMesh = add(paths, pathMaterial);
  add(river, riverMaterial);
  return { group, update(year: number) { pathMesh.visible = year >= 2022; } };
}
