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
  const photograph = new THREE.TextureLoader().load("textures/photo/puente-nuevo-original.jpg");
  photograph.colorSpace = THREE.SRGBColorSpace;
  photograph.anisotropy = 8;
  // The original photograph is sampled directly. UV corrections are done in the shader,
  // so there is no generated stone tile or repeated pattern on the bridge masonry.
  const stone = new THREE.MeshStandardMaterial({ map: photograph, roughness: 0.95 });
  const trim = stone;
  const paving = texturedMaterial("cobble", { albedo: [0.35, 0.33, 0.29], scale: 0.65, normalScale: 0.5 });
  stone.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vBridgePos;\nvarying vec3 vBridgeNormal;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvBridgePos = position;\nvBridgeNormal = normal;");
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>", `#include <common>
varying vec3 vBridgePos;
varying vec3 vBridgeNormal;
float photoX(float x) {
  if (x < -33.8) return mix(0.036, 0.070, clamp((x + 37.0) / 3.2, 0.0, 1.0));
  if (x < -20.2) return mix(0.070, 0.288, (x + 33.8) / 13.6);
  if (x < -9.0) return mix(0.288, 0.436, (x + 20.2) / 11.2);
  if (x < 9.0) return mix(0.436, 0.656, (x + 9.0) / 18.0);
  if (x < 20.2) return mix(0.656, 0.786, (x - 9.0) / 11.2);
  if (x < 33.8) return mix(0.786, 0.949, (x - 20.2) / 13.6);
  return mix(0.949, 0.976, clamp((x - 33.8) / 3.2, 0.0, 1.0));
}
float photoY(float y) {
  if (y < 35.0) return mix(0.985, 0.844, clamp((y - 21.0) / 14.0, 0.0, 1.0));
  if (y < 90.0) return mix(0.844, 0.356, (y - 35.0) / 55.0);
  if (y < 99.0) return mix(0.356, 0.242, (y - 90.0) / 9.0);
  if (y < 106.0) return mix(0.242, 0.213, (y - 99.0) / 7.0);
  if (y < 112.8) return mix(0.213, 0.133, (y - 106.0) / 6.8);
  return mix(0.133, 0.090, clamp((y - 112.8) / 6.2, 0.0, 1.0));
}`)
      .replace("#include <map_fragment>", `
vec3 bp = vBridgePos;
float px = photoX(bp.x);
float py = photoY(bp.y);
// The photograph's deck and spring lines slope slightly in perspective.
py += clamp(bp.x / 27.0, -1.0, 1.0) * 0.014 * smoothstep(90.0, 106.0, bp.y);
// Below the main spring line, compensate for the photographed piers' perspective.
px += (1.0 - smoothstep(35.0, 90.0, bp.y)) * 0.012;
// The outer lower faces are hidden by rock in the source photograph. Keep those
// surfaces within photographed masonry, instead of painting cliffs onto the bridge.
if (bp.y < 90.0 && abs(bp.x) > 9.0) {
  float pier = clamp((abs(bp.x) - 9.0) / 12.0, 0.0, 1.0);
  px = bp.x < 0.0 ? mix(0.436, 0.310, pier) : mix(0.662, 0.755, pier);
  // Continue through a stone patch on the outer abutments. A clamped single
  // image column would smear into horizontal stripes across these wide faces.
  if (abs(bp.x) > 21.0) {
    float abutment = clamp((abs(bp.x) - 21.0) / 16.0, 0.0, 1.0);
    px = bp.x < 0.0 ? mix(0.310, 0.390, abutment) : mix(0.755, 0.690, abutment);
  }
}
if (bp.y > 118.0) py = 0.100 + clamp(bp.x / 37.0, -1.0, 1.0) * 0.015;
vec3 faceColour = texture2D(map, vec2(px, 1.0 - clamp(py, 0.07, 0.985))).rgb;
// Tunnel walls, cornice tops and returns use an unobstructed stone portion of the
// same photograph. They must not inherit photographed sky, cliffs or arch shadows.
vec2 returnUV = vec2(mix(0.690, 0.770, clamp((bp.z + 9.0) / 18.0, 0.0, 1.0)),
  1.0 - mix(0.800, 0.430, clamp((bp.y - 21.0) / 98.0, 0.0, 1.0)));
vec3 returnColour = texture2D(map, returnUV).rgb;
float facade = smoothstep(0.65, 0.90, abs(normalize(vBridgeNormal).z));
diffuseColor.rgb *= mix(returnColour, faceColour, facade);
`);
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
    // Align the small relief pieces to the window in the photograph; do not cover
    // its real wood and ironwork with an opaque black rectangle.
    for (const side of [-1, 1]) box(0.28, 3.4, 0.4, side * 1.12, deck - 10.6, z);
    box(2.8, 0.3, 0.7, 0, deck - 12.5, z);
    const pediment = new THREE.Shape([new THREE.Vector2(-1.7, deck - 8.1), new THREE.Vector2(1.7, deck - 8.1), new THREE.Vector2(0, deck - 6.8)]);
    add(new THREE.ExtrudeGeometry(pediment, { depth: 0.55, bevelEnabled: false }).translate(0, 0, z - 0.275), trim);
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
