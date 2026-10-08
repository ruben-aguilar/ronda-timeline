import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { GTAOPass } from "three/examples/jsm/postprocessing/GTAOPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import "./style.css";
import { countUpTo, createBuildings } from "./buildings";
import { CamMode, createCameraRig, VIEWPOINTS } from "./camera";
import { loadBuildings, loadDem } from "./data";
import { createLandmarks } from "./landmarks";
import { createMonuments } from "./monuments";
import { createTerrain } from "./terrain";
import { createTrees } from "./trees";
import { CONFIDENCE_LABEL, Era, eraAt, formatNumber, formatYear, NOW, posAt, yearAt, yearsPerStep } from "./timeline";
import { buildTimelineUI } from "./ui";

const HAZE = new THREE.Color("#b9c6d2");
const SUN_DIR = new THREE.Vector3(-1400, 1150, 900).normalize();

/** Sky dome: deep blue at the zenith, warm haze at the horizon, a soft glow around the sun. */
function makeSky(): THREE.Mesh {
  return new THREE.Mesh(
    new THREE.SphereGeometry(9000, 48, 24),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uTop: { value: new THREE.Color("#3f74b5") },
        uMid: { value: new THREE.Color("#8fb3d9") },
        uHaze: { value: HAZE },
        uSun: { value: SUN_DIR },
      },
      vertexShader: "varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
      fragmentShader: `uniform vec3 uTop, uMid, uHaze, uSun; varying vec3 vP;
void main(){
  float h = vP.y;
  vec3 c = mix(uHaze, uMid, smoothstep(-0.02, 0.18, h));
  c = mix(c, uTop, smoothstep(0.18, 0.7, h));
  float sd = max(dot(normalize(vP), normalize(uSun)), 0.0);
  c += vec3(1.0, 0.85, 0.6) * (pow(sd, 12.0) * 0.25 + pow(sd, 400.0) * 0.8);
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}`,
    }),
  );
}

async function main() {
  const app = document.getElementById("app")!;
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.9;
  app.appendChild(renderer.domElement);

  const labelRenderer = new CSS2DRenderer();
  labelRenderer.domElement.className = "labels";
  app.appendChild(labelRenderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(HAZE, 2400, 7500);

  scene.add(makeSky());

  const camera = new THREE.PerspectiveCamera(42, 1, 1.2, 12000);

  scene.add(new THREE.HemisphereLight(0xcfdcec, 0x6a5a44, 0.9));
  const sun = new THREE.DirectionalLight(0xffe7c4, 2.8);
  sun.position.copy(SUN_DIR).multiplyScalar(2500);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  const sc = sun.shadow.camera;
  sc.left = -1600;
  sc.right = 1600;
  sc.top = 1600;
  sc.bottom = -1600;
  sc.near = 100;
  sc.far = 6000;
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 1.0;
  scene.add(sun);
  scene.add(sun.target);

  // Postproceso: oclusión ambiental (GTAO) sobre un render multimuestreado.
  const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));
  const gtao = new GTAOPass(scene, camera, 1, 1);
  gtao.updateGtaoMaterial({ radius: 6, distanceExponent: 1.5, thickness: 2, scale: 1.2, samples: 12 });
  gtao.blendIntensity = 0.85;
  composer.addPass(gtao);
  composer.addPass(new OutputPass());
  const resize = () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
    labelRenderer.setSize(window.innerWidth, window.innerHeight);
  };
  resize();
  window.addEventListener("resize", resize);

  const loading = document.getElementById("loading")!;
  const [dem, bdata] = await Promise.all([loadDem(), loadBuildings()]);
  const loader = new THREE.TextureLoader();
  const terrain = createTerrain(dem, loader, renderer.capabilities.getMaxAnisotropy());
  scene.add(terrain.mesh);
  const monuments = createMonuments(dem, bdata);
  scene.add(monuments.group);
  const buildings = createBuildings(bdata, monuments.exclude);
  scene.add(buildings.mesh);
  const landmarks = createLandmarks(dem);
  scene.add(landmarks.group);
  scene.add(await createTrees(dem));

  // Cámara.
  const rig = createCameraRig(camera, labelRenderer.domElement, dem);
  rig.goTo(VIEWPOINTS[0]);
  rig.update(10, { tx: 0, tn: 0, dist: 1, height: 1 });
  rig.setMode("cine");
  const camFor = (year: number) => {
    const t = THREE.MathUtils.smoothstep(posAt(year), 0.25, 0.85);
    return {
      tx: THREE.MathUtils.lerp(40, 120, t),
      tn: THREE.MathUtils.lerp(-330, 180, t),
      dist: THREE.MathUtils.lerp(1100, 2600, t),
      height: THREE.MathUtils.lerp(420, 1050, t),
    };
  };
  buildCameraBar(rig);

  // Estado.
  let pos = posAt(Number(new URLSearchParams(location.hash.slice(1)).get("year")) || -25000);
  let playing = false;
  let speed = 1;
  let currentEra: Era | null = null;
  const PLAY_SECONDS = 150; // a 1×: de la prehistoria a hoy

  const ui = buildTimelineUI({
    years: buildings.years,
    onSeek(p) {
      pos = p;
    },
    onPlay(on) {
      playing = on;
      if (on && pos >= 1) pos = 0;
    },
    onSpeed(s) {
      speed = s;
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
    eraSub.textContent = `${formatYear(e.from)} – ${e.to >= NOW ? "hoy" : formatYear(e.to)} · ${e.subtitle}`;
    eraText.textContent = e.text;
    eraConf.innerHTML = `<span class="dots">${"●".repeat(e.confidence + 1)}${"○".repeat(3 - e.confidence)}</span> ${CONFIDENCE_LABEL[e.confidence]}`;
    document.documentElement.style.setProperty("--era", e.color);
    splash.innerHTML = `<div class="splash-title">${e.title}</div><div class="splash-sub">${e.subtitle}</div>`;
    splash.classList.remove("show");
    void splash.offsetWidth;
    splash.classList.add("show");
  };

  window.addEventListener("keydown", (ev) => {
    if (ev.code === "Space") {
      ev.preventDefault();
      ui.togglePlay();
    } else if (rig.mode === "orbit" || rig.mode === "cine") {
      if (ev.code === "ArrowRight") pos = Math.min(pos + 0.005, 1);
      else if (ev.code === "ArrowLeft") pos = Math.max(pos - 0.005, 0);
    }
  });

  loading.classList.add("done");
  setTimeout(() => loading.remove(), 900);
  const timer = new THREE.Timer();
  let lastHash = 0;

  // Automatic quality: if the frame rate stays low, drop ambient occlusion, then resolution.
  let quality = 2;
  let fpsFrames = 0;
  let fpsStart = performance.now();
  const adaptQuality = () => {
    fpsFrames++;
    const el = performance.now() - fpsStart;
    if (el < 2500) return;
    const fps = (fpsFrames * 1000) / el;
    fpsFrames = 0;
    fpsStart = performance.now();
    if (fps > 40 || quality === 0) return;
    quality--;
    if (quality === 1) gtao.enabled = false;
    if (quality === 0) {
      renderer.setPixelRatio(1);
      resize();
    }
  };

  // Gancho de depuración para capturas: __ronda.shot(año, [x, y, z], [tx, ty, tz]) dibuja un
  // fotograma con ese año y esa cámara y para el bucle hasta __ronda.resume().
  let frozen = false;
  (window as unknown as { __ronda: object }).__ronda = {
    shot(year: number, cam?: [number, number, number], tgt?: [number, number, number]) {
      pos = posAt(year);
      playing = false;
      rig.setMode("orbit");
      if (cam) camera.position.set(...cam);
      if (tgt) rig.controls.target.set(...tgt);
      document.body.classList.add("shot");
      frozen = false;
      frame();
      frame();
      frozen = true;
    },
    view(year: number, id: string) {
      pos = posAt(year);
      playing = false;
      rig.jumpTo(VIEWPOINTS.find((v) => v.id === id)!);
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
    dbg: { scene, renderer, gtao, sun, composer, direct: false },
  };

  function frame() {
    if (frozen) return;
    adaptQuality();
    timer.update();
    const dt = Math.min(timer.getDelta(), 0.1);
    if (playing) {
      pos += (dt * speed) / PLAY_SECONDS;
      if (pos >= 1) {
        pos = 1;
        playing = false;
        ui.setPlaying(false);
      }
    }
    const year = yearAt(pos);
    buildings.setYear(year, yearsPerStep(pos));
    terrain.setYear(year);
    landmarks.update(year, camera);
    monuments.update(year);

    const era = eraAt(year);
    if (era !== currentEra) {
      currentEra = era;
      showEra(era);
    }
    ui.setPos(pos, year, era);
    yearEl.textContent = formatYear(year);
    countEl.textContent = `${formatNumber(countUpTo(buildings.years, year))} edificios`;
    const now = performance.now();
    if (now - lastHash > 500) {
      lastHash = now;
      history.replaceState(null, "", `#year=${Math.round(year)}`);
    }

    rig.update(dt, camFor(year));
    if ((window as unknown as { __ronda: { dbg: { direct: boolean } } }).__ronda.dbg.direct) renderer.render(scene, camera);
    else composer.render();
    labelRenderer.render(scene, camera);
  }
  renderer.setAnimationLoop(frame);
}

/** Barra de cámara: modos y vistas. */
function buildCameraBar(rig: ReturnType<typeof createCameraRig>) {
  const bar = document.getElementById("cambar")!;
  const modes: Array<[CamMode, string, string, string]> = [
    ["cine", "Cine", "La cámara se mueve sola mientras pasa el tiempo.", '<path d="M3 6h12v12H3zM15 10l6-3.5v11L15 14z"/>'],
    ["orbit", "Órbita", "Arrastra para girar · botón derecho para desplazar · rueda para acercar · doble clic para volar a un punto.", '<circle cx="12" cy="12" r="2.6"/><ellipse cx="12" cy="12" rx="9.5" ry="4.2" fill="none" stroke="currentColor" stroke-width="1.8"/>'],
    ["fly", "Vuelo", "W A S D para moverte · Q / E para bajar y subir · arrastra para mirar · Mayús para ir rápido · rueda para la velocidad.", '<path d="M21 3 3 10.5l7 2.5 2.5 7z"/>'],
    ["walk", "Paseo", "A pie de calle · W A S D para andar · arrastra para mirar · Mayús para correr.", '<circle cx="13" cy="4" r="2.2"/><path d="M11 8h3l3 4-1.6 1.2L13.5 11l-.8 3.6 2.8 3V22h-2v-3.6l-2.4-2.4-1.5 3.6L7.6 22l-1.8-1 2.4-4.7L9.6 10 8 11.2V14H6V10z"/>'],
  ];
  bar.innerHTML = `
    <div class="cam-modes">
      ${modes.map(([m, label, , icon]) => `<button data-mode="${m}"><svg viewBox="0 0 24 24">${icon}</svg><span>${label}</span></button>`).join("")}
    </div>
    <div class="cam-help"></div>
    <div class="cam-views">
      <div class="cam-views-title">Vistas</div>
      ${VIEWPOINTS.map((v) => `<button data-view="${v.id}">${v.name}</button>`).join("")}
    </div>`;
  const help = bar.querySelector<HTMLDivElement>(".cam-help")!;
  const sync = (m: CamMode) => {
    bar.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach((b) => b.classList.toggle("on", b.dataset.mode === m));
    help.textContent = modes.find((x) => x[0] === m)![2];
  };
  rig.onModeChange = sync;
  sync(rig.mode);
  bar.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach((b) => b.addEventListener("click", () => rig.setMode(b.dataset.mode as CamMode)));
  bar.querySelectorAll<HTMLButtonElement>("[data-view]").forEach((b) =>
    b.addEventListener("click", () => rig.goTo(VIEWPOINTS.find((v) => v.id === b.dataset.view)!)),
  );

  const info = document.getElementById("info")!;
  document.getElementById("info-btn")!.addEventListener("click", () => info.classList.toggle("open"));
  info.querySelector(".close")!.addEventListener("click", () => info.classList.remove("open"));
}

main().catch((err) => {
  console.error(err);
  const l = document.getElementById("loading");
  if (l) l.textContent = `Error: ${err}`;
});
