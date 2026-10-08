import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { metricUV, texturedMaterial } from "./textures";
import { Dem, Y_OFFSET } from "./data";

/** Photo-guided foundation clearance where the coarse DEM blends cliffs into the piers. */
export function refineBridgeFoundations(dem: Dem): void {
  const yaw = Math.atan2(-51.4, 29.6), c = Math.cos(yaw), s = Math.sin(yaw);
  for (let r = 0; r < dem.rows; r++) for (let col = 0; col < dem.cols; col++) {
    const x = -dem.size / 2 + (col + 0.5) * dem.cell - 5.8;
    const z = -dem.size / 2 + (r + 0.5) * dem.cell - 25.9;
    if (Math.abs(x) > 50 || Math.abs(z) > 50) continue;
    const along = c * x - s * z, across = s * x + c * z;
    const weight = (1 - THREE.MathUtils.smoothstep(Math.abs(along), 21, 32))
      * THREE.MathUtils.smoothstep(across, 0, 6)
      * (1 - THREE.MathUtils.smoothstep(across, 18, 30));
    const floor = 623 + Math.max(Math.abs(along) - 9, 0) * 0.65;
    const i = r * dem.cols + col;
    dem.h[i] -= Math.max(0, dem.h[i] - floor) * weight;
  }
}

/** Photo-guided reconstruction, aligned to OSM way 26698947; dimensions are approximate. */
export function createPuenteNuevo(): THREE.Group {
  const deck = 719 - Y_OFFSET, base = deck - 98, halfWidth = 7.5;
  const stone = texturedMaterial("ashlar", { albedo: [0.48, 0.39, 0.27], scale: 1.05, normalScale: 0.55 });
  const trim = texturedMaterial("ashlar", { albedo: [0.55, 0.45, 0.32], scale: 0.9, normalScale: 0.4 });
  const paving = texturedMaterial("cobble", { albedo: [0.35, 0.33, 0.29], scale: 0.65, normalScale: 0.5 });
  const iron = new THREE.MeshStandardMaterial({ color: 0x35342e, metalness: 0.55, roughness: 0.65 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x30271d, roughness: 1 });
  // Low-frequency damp and runoff stains remain attached to the masonry, with no baked sunlight.
  for (const material of [stone, trim]) material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vBridgePos;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvBridgePos = position;");
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>", `#include <common>
varying vec3 vBridgePos;
float bridgeNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  float a = fract(sin(dot(i, vec2(127.1, 311.7))) * 43758.5453);
  float b = fract(sin(dot(i + vec2(1, 0), vec2(127.1, 311.7))) * 43758.5453);
  float c = fract(sin(dot(i + vec2(0, 1), vec2(127.1, 311.7))) * 43758.5453);
  float d = fract(sin(dot(i + vec2(1, 1), vec2(127.1, 311.7))) * 43758.5453);
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}`)
      .replace("#include <map_fragment>", `#include <map_fragment>
float damp = 1.0 - smoothstep(${base.toFixed(1)}, ${(base + 30).toFixed(1)}, vBridgePos.y);
float runoff = pow(0.5 + 0.5 * sin(vBridgePos.x * 2.3 + sin(vBridgePos.x * 6.7)), 6.0);
float weather = bridgeNoise(vBridgePos.xy * vec2(0.21, 0.09));
diffuseColor.rgb *= 0.88 + 0.24 * weather - 0.16 * damp - 0.10 * runoff;
diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.82, 0.90, 0.75), damp * 0.16);`);
  };
  const parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const add = (geometry: THREE.BufferGeometry, material: THREE.Material) => {
    if (!parts.has(material)) parts.set(material, []);
    parts.get(material)!.push(metricUV(geometry));
  };
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, material = trim) =>
    add(new THREE.BoxGeometry(w, h, d).translate(x, y, z), material);
  const opening = (x: number, floor: number, spring: number, radius: number) => {
    const path = new THREE.Path();
    path.moveTo(x - radius, floor);
    path.lineTo(x - radius, spring);
    path.absarc(x, spring, radius, Math.PI, 0, true);
    path.lineTo(x + radius, floor);
    path.closePath();
    return path;
  };
  const arches = [
    { x: 0, floor: base - 2, spring: base + 4, radius: 6 },
    { x: 0, floor: base + 14, spring: deck - 29, radius: 9 },
    { x: -27, floor: deck - 27, spring: deck - 13, radius: 6.8 },
    { x: 27, floor: deck - 27, spring: deck - 13, radius: 6.8 },
  ];
  const outline = new THREE.Shape([
    new THREE.Vector2(-37, base - 5), new THREE.Vector2(37, base - 5),
    new THREE.Vector2(37, deck), new THREE.Vector2(-37, deck),
  ]);
  for (const arch of arches) outline.holes.push(opening(arch.x, arch.floor, arch.spring, arch.radius));
  add(new THREE.ExtrudeGeometry(outline, { depth: halfWidth * 2, bevelEnabled: false, curveSegments: 32 })
    .translate(0, 0, -halfWidth), stone);

  for (const face of [-1, 1]) {
    const z = face * (halfWidth + 0.3);
    // Separate wedge-shaped stones give the arch rings real depth and radial joints.
    for (const arch of arches) {
      const count = arch.radius > 8 ? 25 : 19;
      for (let i = 0; i < count; i++) {
        const a = i * Math.PI / count + 0.006, b = (i + 1) * Math.PI / count - 0.006;
        const wedge = new THREE.Shape();
        const outer = arch.radius + 1.1;
        wedge.moveTo(arch.x + Math.cos(a) * arch.radius, arch.spring + Math.sin(a) * arch.radius);
        wedge.absarc(arch.x, arch.spring, arch.radius, a, b, false);
        wedge.lineTo(arch.x + Math.cos(b) * outer, arch.spring + Math.sin(b) * outer);
        wedge.absarc(arch.x, arch.spring, outer, b, a, true);
        wedge.closePath();
        add(new THREE.ExtrudeGeometry(wedge, { depth: 0.55, bevelEnabled: false, curveSegments: 2 })
          .translate(0, 0, z - 0.275), trim);
      }
    }
    for (const side of [-1, 1]) {
      const pier = new THREE.Shape([
        new THREE.Vector2(side * 9, base + 10), new THREE.Vector2(side * 21, base + 10),
        new THREE.Vector2(side * 19.2, deck - 30), new THREE.Vector2(side * 9, deck - 30),
      ]);
      add(new THREE.ExtrudeGeometry(pier, { depth: 1.3, bevelEnabled: false })
        .translate(0, 0, face > 0 ? halfWidth - 0.1 : -halfWidth - 1.2), stone);
      for (const y of [base + 11, base + 13, deck - 33, deck - 30])
        box(12.1, 0.55, 1.8, side * 15, y, face * (halfWidth + 0.55));
      // Pilasters extend up to the cornice at the sides of the central chamber.
      box(1.0, 25, 0.6, side * 18.5, deck - 13.5, z);
      box(1.65, 0.6, 1, side * 18.5, deck - 26.2, z);
    }
    box(74.8, 0.8, 1.0, 0, deck - 1.8, z);
    box(36, 0.45, 0.75, 0, deck - 16.8, z);
    // Recessed chamber window, stone surround, pediment and iron bars.
    box(2.2, 4.2, 0.2, 0, deck - 12.9, face * (halfWidth + 0.15), dark);
    for (const side of [-1, 1]) box(0.36, 4.6, 0.55, side * 1.28, deck - 12.9, z);
    box(3.2, 0.4, 1.0, 0, deck - 15.3, z);
    const pediment = new THREE.Shape([new THREE.Vector2(-1.9, deck - 10.4), new THREE.Vector2(1.9, deck - 10.4), new THREE.Vector2(0, deck - 9.1)]);
    add(new THREE.ExtrudeGeometry(pediment, { depth: 0.55, bevelEnabled: false }).translate(0, 0, z - 0.275), trim);
    for (let x = -0.8; x <= 0.81; x += 0.4) box(0.06, 3.9, 0.08, x, deck - 12.9, face * (halfWidth + 0.31), iron);
    // Stone parapets with coping. Small blocks create a readable silhouette at street level.
    box(74, 1.1, 0.65, 0, deck + 0.65, face * (halfWidth - 0.33));
    box(74.3, 0.22, 0.85, 0, deck + 1.3, face * (halfWidth - 0.33));
    for (const x of [-36, -18.5, 18.5, 36]) box(1.3, 1.6, 1.0, x, deck + 0.8, face * (halfWidth - 0.33));
    box(74, 0.18, 1.65, 0, deck + 0.19, face * 6.05, paving);
  }
  box(74, 0.12, 10.5, 0, deck + 0.08, 0, paving);
  const group = new THREE.Group();
  group.name = "Puente Nuevo detailed masonry";
  // OSM road axis: local +X points south-east along the bridge.
  group.position.set(5.8, 0, 25.9);
  group.rotation.y = Math.atan2(-51.4, 29.6);
  for (const [material, geometries] of parts) {
    const merged = mergeGeometries(geometries.map(g => g.index ? g.toNonIndexed() : g), false)!;
    const mesh = new THREE.Mesh(merged, material);
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
    for (const geometry of geometries) geometry.dispose();
  }
  return group;
}
