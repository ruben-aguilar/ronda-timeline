import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Dem, elevation, Y_OFFSET } from "./data";

export type CamMode = "orbit" | "fly" | "walk" | "cine";

export interface Viewpoint {
  id: string;
  name: string;
  /** Camera and target in local metres: [x east, n north, height above ground]. */
  cam: [number, number, number];
  tgt: [number, number, number];
  mode?: CamMode;
}

export const VIEWPOINTS: Viewpoint[] = [
  { id: "general", name: "Vista general", cam: [-1250, 650, 520], tgt: [60, -120, 20] },
  { id: "tajo", name: "El Tajo desde el valle", cam: [-360, -240, 90], tgt: [6, -26, 45] },
  { id: "puente", name: "Puente Nuevo de cerca", cam: [-160, -60, 90], tgt: [6, -26, 42] },
  { id: "toros", name: "Plaza de toros", cam: [-10, 70, 75], tgt: [-100, 156, 4] },
  { id: "santamaria", name: "Santa María la Mayor", cam: [88, -492, 30], tgt: [32, -372, 16] },
  { id: "almocabar", name: "Puerta de Almocábar", cam: [140, -800, 28], tgt: [114, -712, 8] },
  { id: "banos", name: "Baños árabes", cam: [345, -300, 38], tgt: [280, -239, 3] },
  { id: "alameda", name: "Alameda del Tajo y miradores", cam: [-470, 170, 330], tgt: [-280, 290, 0] },
  { id: "ciudad", name: "La Ciudad (medina)", cam: [520, -760, 330], tgt: [40, -380, 10] },
  { id: "mercadillo", name: "El Mercadillo", cam: [-480, 420, 230], tgt: [-60, 180, 10] },
  { id: "cenital", name: "Vista cenital", cam: [60, -101, 2300], tgt: [60, -100, 0] },
  { id: "paseo", name: "A pie: Balcón del Tajo", cam: [-338, 319, 1.7], tgt: [-700, 250, 140], mode: "walk" },
];

const EYE = 1.7;

export interface CameraRig {
  controls: OrbitControls;
  mode: CamMode;
  setMode(m: CamMode): void;
  goTo(v: Viewpoint): void;
  /** Place the camera at a viewpoint at once, without a transition. */
  jumpTo(v: Viewpoint): void;
  update(dt: number, cine: { tx: number; tn: number; dist: number; height: number }): void;
  onModeChange?: (m: CamMode) => void;
}

export function createCameraRig(camera: THREE.PerspectiveCamera, dom: HTMLElement, dem: Dem): CameraRig {
  const ground = (x: number, n: number) => elevation(dem, x, n) - Y_OFFSET;
  const w = (x: number, n: number, h: number) => new THREE.Vector3(x, ground(x, n) + h, -n);

  const controls = new OrbitControls(camera, dom);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.zoomToCursor = true;
  controls.maxPolarAngle = Math.PI * 0.495;
  controls.minDistance = 15;
  controls.maxDistance = 6000;
  controls.screenSpacePanning = false;

  // Free look (fly and walk): drag to look, WASD / arrows to move.
  const keys = new Set<string>();
  let yaw = 0;
  let pitch = 0;
  let dragging = false;
  let speedScale = 1;
  const syncAngles = () => {
    const e = new THREE.Euler().setFromQuaternion(camera.quaternion, "YXZ");
    yaw = e.y;
    pitch = e.x;
  };

  // Smooth transitions between viewpoints.
  let tween: { from: THREE.Vector3; to: THREE.Vector3; tFrom: THREE.Vector3; tTo: THREE.Vector3; t: number; then?: CamMode } | null = null;

  /** Where a ray from the camera hits the terrain (marching over the elevation model). */
  const terrainHit = (origin: THREE.Vector3, dir: THREE.Vector3): THREE.Vector3 | null => {
    const p = origin.clone();
    for (let s = 0; s < 8000; s += 4) {
      p.copy(origin).addScaledVector(dir, s);
      if (p.y < ground(p.x, -p.z)) return p;
    }
    return null;
  };

  const rig: CameraRig = {
    controls,
    mode: "cine",
    setMode(m) {
      if (m === rig.mode) return;
      const prev = rig.mode;
      rig.mode = m;
      controls.enabled = m === "orbit" || m === "cine";
      if (m === "fly" || m === "walk") {
        if (prev === "orbit" || prev === "cine") camera.lookAt(controls.target);
        syncAngles();
        if (m === "walk") camera.position.y = ground(camera.position.x, -camera.position.z) + EYE;
      }
      if (m === "orbit" && (prev === "fly" || prev === "walk")) {
        const dir = camera.getWorldDirection(new THREE.Vector3());
        const hit = terrainHit(camera.position, dir);
        controls.target.copy(hit ?? camera.position.clone().addScaledVector(dir, 300));
      }
      rig.onModeChange?.(m);
    },
    goTo(v) {
      const to = w(v.cam[0], v.cam[1], v.cam[2]);
      const tTo = w(v.tgt[0], v.tgt[1], v.tgt[2]);
      if (rig.mode !== "orbit") rig.setMode("orbit");
      tween = { from: camera.position.clone(), to, tFrom: controls.target.clone(), tTo, t: 0, then: v.mode };
    },
    jumpTo(v) {
      tween = null;
      rig.setMode("orbit");
      camera.position.copy(w(v.cam[0], v.cam[1], v.cam[2]));
      controls.target.copy(w(v.tgt[0], v.tgt[1], v.tgt[2]));
      camera.lookAt(controls.target);
      if (v.mode) rig.setMode(v.mode);
    },
    update(dt, cine) {
      if (tween) {
        tween.t = Math.min(tween.t + dt / 2.2, 1);
        const e = tween.t < 0.5 ? 4 * tween.t ** 3 : 1 - (-2 * tween.t + 2) ** 3 / 2;
        // Arc upwards a little so long moves do not cut through hills.
        const lift = Math.sin(e * Math.PI) * Math.min(tween.from.distanceTo(tween.to) * 0.25, 400);
        camera.position.lerpVectors(tween.from, tween.to, e).y += lift;
        controls.target.lerpVectors(tween.tFrom, tween.tTo, e);
        camera.lookAt(controls.target);
        if (tween.t >= 1) {
          const then = tween.then;
          tween = null;
          if (then) rig.setMode(then);
        }
        return;
      }
      if (rig.mode === "cine") {
        orbit += dt * 0.035;
        const ang = -2.1 + Math.sin(orbit) * 0.9;
        const tgt = new THREE.Vector3(cine.tx, ground(cine.tx, cine.tn) + 20, -cine.tn);
        controls.target.lerp(tgt, 0.03);
        const want = new THREE.Vector3(tgt.x + Math.cos(ang) * cine.dist, tgt.y + cine.height, tgt.z - Math.sin(ang) * cine.dist);
        camera.position.lerp(want, 0.02);
        controls.update();
      } else if (rig.mode === "orbit") {
        controls.update();
      } else {
        const fast = keys.has("ShiftLeft") || keys.has("ShiftRight") ? 4 : 1;
        const base = rig.mode === "walk" ? 6 : 70;
        const v = base * fast * speedScale * dt;
        const fwd = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
        const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
        const look = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(pitch, yaw, 0, "YXZ"));
        const move = new THREE.Vector3();
        const along = rig.mode === "fly" ? look : fwd;
        if (keys.has("KeyW") || keys.has("ArrowUp")) move.add(along);
        if (keys.has("KeyS") || keys.has("ArrowDown")) move.sub(along);
        if (keys.has("KeyD") || keys.has("ArrowRight")) move.add(right);
        if (keys.has("KeyA") || keys.has("ArrowLeft")) move.sub(right);
        if (rig.mode === "fly") {
          if (keys.has("KeyE")) move.y += 1;
          if (keys.has("KeyQ")) move.y -= 1;
        }
        if (move.lengthSq() > 0) camera.position.addScaledVector(move.normalize(), v);
        const g = ground(camera.position.x, -camera.position.z);
        if (rig.mode === "walk") camera.position.y = THREE.MathUtils.lerp(camera.position.y, g + EYE, 0.3);
        else camera.position.y = Math.max(camera.position.y, g + 3);
        camera.quaternion.setFromEuler(new THREE.Euler(pitch, yaw, 0, "YXZ"));
      }
      // Never go under the terrain.
      const g = ground(camera.position.x, -camera.position.z);
      if (camera.position.y < g + 1.2) camera.position.y = g + 1.2;
    },
  };
  let orbit = 0;

  controls.addEventListener("start", () => {
    tween = null;
    if (rig.mode === "cine") rig.setMode("orbit");
  });

  dom.addEventListener("pointerdown", (e) => {
    if (rig.mode !== "fly" && rig.mode !== "walk") return;
    dragging = true;
    dom.setPointerCapture(e.pointerId);
  });
  dom.addEventListener("pointerup", () => (dragging = false));
  dom.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    yaw -= e.movementX * 0.0035;
    pitch = THREE.MathUtils.clamp(pitch - e.movementY * 0.0035, -1.45, 1.45);
  });
  dom.addEventListener(
    "wheel",
    (e) => {
      if (rig.mode !== "fly" && rig.mode !== "walk") return;
      speedScale = THREE.MathUtils.clamp(speedScale * (e.deltaY > 0 ? 0.85 : 1.18), 0.2, 8);
    },
    { passive: true },
  );
  // Double click: fly to that point of the terrain.
  dom.addEventListener("dblclick", (e) => {
    const r = dom.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, camera);
    const hit = terrainHit(ray.ray.origin, ray.ray.direction);
    if (!hit) return;
    const off = camera.position.clone().sub(controls.target).setLength(Math.min(camera.position.distanceTo(controls.target) * 0.5, 600));
    if (rig.mode !== "orbit") rig.setMode("orbit");
    tween = { from: camera.position.clone(), to: hit.clone().add(off), tFrom: controls.target.clone(), tTo: hit, t: 0 };
  });
  window.addEventListener("keydown", (e) => {
    if ((e.target as HTMLElement)?.tagName === "INPUT") return;
    keys.add(e.code);
  });
  window.addEventListener("keyup", (e) => keys.delete(e.code));
  window.addEventListener("blur", () => keys.clear());

  return rig;
}
