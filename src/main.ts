import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import "./style.css";
import { countUpTo, createBuildings } from "./buildings";
import { elevation, loadBuildings, loadDem, Y_OFFSET } from "./data";
import { createLandmarks } from "./landmarks";
import { createTerrain } from "./terrain";
import { CONFIDENCE_LABEL, Era, eraAt, formatYear, NOW, posAt, yearAt, yearsPerStep } from "./timeline";
import { buildTimelineUI } from "./ui";

// Walled medina outline (local metres), drawn over the 1956 aerial photo. Same as scripts/zones.json.
const MEDINA = [[-20, -45], [-80, -60], [-130, -130], [-150, -230], [-140, -330], [-100, -430], [-50, -520], [10, -620], [70, -700], [160, -725], [210, -660], [205, -520], [175, -400], [165, -280], [180, -165], [110, -100], [50, -55]];

const HORIZON = new THREE.Color("#c9d3d6");

async function main() {
  const app = document.getElementById("app")!;
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  app.appendChild(renderer.domElement);

  const labelRenderer = new CSS2DRenderer();
  labelRenderer.setSize(window.innerWidth, window.innerHeight);
  labelRenderer.domElement.className = "labels";
  app.appendChild(labelRenderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(HORIZON, 2600, 7000);

  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(20000, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: { uTop: { value: new THREE.Color("#5c8fc4") }, uBottom: { value: HORIZON } },
      vertexShader: "varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
      fragmentShader: "uniform vec3 uTop, uBottom; varying vec3 vP; void main(){ float t = smoothstep(-0.02, 0.45, vP.y); gl_FragColor = vec4(mix(uBottom, uTop, t), 1.0); }",
    }),
  );
  scene.add(sky);

  const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 2, 40000);
  const controls = new OrbitControls(camera, labelRenderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.maxPolarAngle = Math.PI * 0.47;
  controls.minDistance = 80;
  controls.maxDistance = 5000;

  scene.add(new THREE.HemisphereLight(0xdfe8f2, 0x6b5a42, 1.1));
  const sun = new THREE.DirectionalLight(0xfff1dc, 2.6);
  sun.position.set(-1400, 1500, 900); // low afternoon sun from the south-west
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  const sc = sun.shadow.camera;
  sc.left = -1700;
  sc.right = 1700;
  sc.top = 1700;
  sc.bottom = -1700;
  sc.near = 100;
  sc.far = 5000;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 1.2;
  scene.add(sun);
  scene.add(sun.target);

  const loading = document.getElementById("loading")!;
  const [dem, bdata] = await Promise.all([loadDem(), loadBuildings()]);
  const loader = new THREE.TextureLoader();
  const terrain = createTerrain(dem, loader, renderer.capabilities.getMaxAnisotropy());
  scene.add(terrain.mesh);
  const buildings = createBuildings(bdata);
  scene.add(buildings.mesh);
  const landmarks = createLandmarks(dem, MEDINA);
  scene.add(landmarks.group);

  // Camera: start looking at the gorge from the west, the classic view of the Puente Nuevo.
  const ground = (x: number, n: number) => elevation(dem, x, n) - Y_OFFSET;
  controls.target.set(40, ground(40, -200) + 10, 200);
  camera.position.set(-1250, 520, 650);
  controls.update();

  // Auto camera: early eras look at the medina, later eras pull back to show the whole town.
  let autoCam = true;
  let orbit = 0;
  controls.addEventListener("start", () => {
    autoCam = false;
    ui.setAutoCam(false);
  });
  const camFor = (year: number) => {
    const t = THREE.MathUtils.smoothstep(posAt(year), 0.25, 0.85);
    const tx = THREE.MathUtils.lerp(40, 120, t);
    const tn = THREE.MathUtils.lerp(-330, 180, t);
    const dist = THREE.MathUtils.lerp(1100, 2600, t);
    const height = THREE.MathUtils.lerp(420, 1050, t);
    return { tx, tn, dist, height };
  };

  // State.
  let pos = posAt(Number(new URLSearchParams(location.hash.slice(1)).get("year")) || -25000);
  let playing = false;
  let currentEra: Era | null = null;
  const PLAY_SECONDS = 150; // a full run from prehistory to today

  const ui = buildTimelineUI({
    onSeek(p) {
      pos = p;
    },
    onPlay(on) {
      playing = on;
      if (on && pos >= 1) pos = 0;
      if (on) {
        autoCam = true;
        ui.setAutoCam(true);
      }
    },
    onAutoCam(on) {
      autoCam = on;
    },
    onEra(e) {
      pos = posAt(e.from) + 0.0005;
    },
  });

  const yearEl = document.getElementById("year")!;
  const countEl = document.getElementById("count")!;
  const eraTitle = document.getElementById("era-title")!;
  const eraSub = document.getElementById("era-sub")!;
  const eraText = document.getElementById("era-text")!;
  const eraConf = document.getElementById("era-conf")!;
  const splash = document.getElementById("splash")!;

  const showEra = (e: Era) => {
    eraTitle.textContent = e.title;
    eraSub.textContent = `${formatYear(e.from)} – ${e.to >= NOW ? "today" : formatYear(e.to)} · ${e.subtitle}`;
    eraText.textContent = e.text;
    eraConf.innerHTML = `<span class="dots">${"●".repeat(e.confidence + 1)}${"○".repeat(3 - e.confidence)}</span> ${CONFIDENCE_LABEL[e.confidence]}`;
    document.documentElement.style.setProperty("--era", e.color);
    splash.innerHTML = `<div class="splash-title">${e.title}</div><div class="splash-sub">${e.subtitle}</div>`;
    splash.classList.remove("show");
    void splash.offsetWidth;
    splash.classList.add("show");
  };

  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    labelRenderer.setSize(window.innerWidth, window.innerHeight);
  });
  window.addEventListener("keydown", (ev) => {
    if (ev.code === "Space") {
      ev.preventDefault();
      ui.togglePlay();
    } else if (ev.code === "ArrowRight") pos = Math.min(pos + 0.005, 1);
    else if (ev.code === "ArrowLeft") pos = Math.max(pos - 0.005, 0);
  });

  loading.remove();
  const clock = new THREE.Clock();
  let lastHash = 0;
  // Debug hook for automated screenshots: __ronda.shot(year, [x, y, z], [tx, ty, tz]) renders
  // one frame at that year and camera, then stops the loop until __ronda.resume().
  let frozen = false;
  (window as unknown as { __ronda: object }).__ronda = {
    shot(year: number, cam?: [number, number, number], tgt?: [number, number, number]) {
      pos = posAt(year);
      autoCam = false;
      playing = false;
      if (cam) camera.position.set(...cam);
      if (tgt) controls.target.set(...tgt);
      document.body.classList.add("shot");
      frozen = false;
      frame();
      frame();
      frozen = true;
    },
    resume() {
      document.body.classList.remove("shot");
      frozen = false;
    },
  };
  const frame = () => {
    if (frozen) return;
    const dt = Math.min(clock.getDelta(), 0.1);
    if (playing) {
      pos += dt / PLAY_SECONDS;
      if (pos >= 1) {
        pos = 1;
        playing = false;
        ui.setPlaying(false);
      }
    }
    const year = yearAt(pos);
    const grow = yearsPerStep(pos);
    buildings.setYear(year, grow);
    terrain.setYear(year);
    landmarks.update(year, camera);
    ui.setPos(pos);

    const era = eraAt(year);
    if (era !== currentEra) {
      currentEra = era;
      showEra(era);
    }
    yearEl.textContent = formatYear(year);
    countEl.textContent = `${countUpTo(buildings.years, year).toLocaleString("en-US")} buildings`;
    const now = performance.now();
    if (now - lastHash > 500) {
      lastHash = now;
      history.replaceState(null, "", `#year=${Math.round(year)}`);
    }

    if (autoCam) {
      orbit += dt * 0.035;
      const c = camFor(year);
      const ang = -2.1 + Math.sin(orbit) * 0.9;
      const tgt = new THREE.Vector3(c.tx, ground(c.tx, c.tn) + 20, -c.tn);
      controls.target.lerp(tgt, 0.03);
      const want = new THREE.Vector3(tgt.x + Math.cos(ang) * c.dist, tgt.y + c.height, tgt.z - Math.sin(ang) * c.dist);
      camera.position.lerp(want, 0.02);
    }
    controls.update();
    renderer.render(scene, camera);
    labelRenderer.render(scene, camera);
  };
  renderer.setAnimationLoop(frame);
}

main().catch((err) => {
  console.error(err);
  const l = document.getElementById("loading");
  if (l) l.textContent = `Error: ${err}`;
});

