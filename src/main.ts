import { t, getLanguage, setLanguage, bindTranslations, onLanguageChange } from "./i18n";
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
import { createAlameda } from "./alameda";
import { createGallery } from "./gallery";
import { createTerrain } from "./terrain";
import { createSky } from "./sky";
import { createTrees } from "./trees";
import { createRailway } from "./railway";
import { createTajo } from "./tajo";
import { refineBridgeFoundations } from "./puente-nuevo";
import { CONFIDENCE_LABEL, Era, eraAt, formatNumber, formatYear, NOW, posAt, yearAt, yearsPerStep } from "./timeline";
import { buildTimelineUI } from "./ui";

const HAZE = new THREE.Color("#b9c6d2");
const SUN_DIR = new THREE.Vector3(-1400, 1150, 900).normalize();

async function main() {
  document.documentElement.lang = getLanguage();
  bindTranslations(document.documentElement);
  const app = document.getElementById("app")!;
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;
  renderer.info.autoReset = false;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.96;
  app.appendChild(renderer.domElement);

  const labelRenderer = new CSS2DRenderer();
  labelRenderer.domElement.className = "labels";
  app.appendChild(labelRenderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(HAZE, 2400, 7500);

  const sky = createSky(SUN_DIR, HAZE);
  scene.add(sky.mesh);

  const camera = new THREE.PerspectiveCamera(42, 1, 1.2, 12000);

  scene.add(new THREE.HemisphereLight(0xd8e0ea, 0x9a8466, 1.05));
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
  sun.shadow.normalBias = 0.4;
  scene.add(sun);
  scene.add(sun.target);

  // Postproceso: oclusión ambiental (GTAO) sobre un render multimuestreado.
  const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
  target.depthTexture = new THREE.DepthTexture(1, 1, THREE.UnsignedIntType);
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));
  const gtao = new GTAOPass(scene, camera, 1, 1);
  gtao.updateGtaoMaterial({ radius: 3, distanceExponent: 1.5, thickness: 1, scale: 1, samples: 8 });
  // Read the visible render depth: the override normal pass does not apply building growth.
  gtao.setGBuffer(composer.readBuffer.depthTexture!);
  gtao.blendIntensity = 0.65;
  composer.addPass(gtao);
  composer.addPass(new OutputPass());
  let dirty = true;
  let labelsOn = true;
  const resize = () => {
    dirty = true;
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(window.innerWidth, window.innerHeight);
    gtao.setSize(Math.max(1, Math.round(window.innerWidth * renderer.getPixelRatio() / 2)), Math.max(1, Math.round(window.innerHeight * renderer.getPixelRatio() / 2)));
    labelRenderer.setSize(window.innerWidth, window.innerHeight);
  };
  resize();
  window.addEventListener("resize", resize);

  const loading = document.getElementById("loading")!;
  const [dem, bdata] = await Promise.all([loadDem(), loadBuildings(), sky.ready]);
  refineBridgeFoundations(dem);
  // Keep the loading screen until textures and their shared clones have image data.
  let texturesPending = false;
  THREE.DefaultLoadingManager.onStart = () => { texturesPending = true; };
  THREE.DefaultLoadingManager.onLoad = () => { texturesPending = false; };
  const loader = new THREE.TextureLoader();
  const terrain = createTerrain(dem, loader, renderer.capabilities.getMaxAnisotropy(), () => { dirty = true; });
  scene.add(terrain.mesh);
  const monuments = createMonuments(dem, bdata);
  scene.add(monuments.group);
  const buildings = createBuildings(bdata, monuments.exclude);
  scene.add(buildings.mesh);
  const landmarks = createLandmarks(dem);
  scene.add(landmarks.group);
  const [trees, alameda, railway, tajo] = await Promise.all([createTrees(dem), createAlameda(dem), createRailway(dem), createTajo(dem)]);
  scene.add(trees);
  scene.add(alameda.group);
  scene.add(railway.group);
  scene.add(tajo.group);

  // Cámara.
  const rig = createCameraRig(camera, labelRenderer.domElement, dem);
  rig.goTo(VIEWPOINTS[0]);
  rig.update(10, { tx: 0, tn: 0, dist: 1, height: 1 });
  rig.setMode(matchMedia("(prefers-reduced-motion: reduce)").matches ? "orbit" : "cine");
  const camFor = (year: number) => {
    const t = THREE.MathUtils.smoothstep(posAt(year), 0.25, 0.85);
    return {
      tx: THREE.MathUtils.lerp(40, 120, t),
      tn: THREE.MathUtils.lerp(-330, 180, t),
      dist: THREE.MathUtils.lerp(1100, 2600, t),
      height: THREE.MathUtils.lerp(150, 360, t),
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

  new ResizeObserver(([entry]) => {
    document.documentElement.style.setProperty("--timeline-height", `${entry.target.getBoundingClientRect().height}px`);
  }).observe(document.getElementById("timeline")!);

  const yearEl = document.getElementById("year")!;
  const countEl = document.getElementById("count")!;
  const eraTitle = document.getElementById("era-title")!;
  const eraSub = document.getElementById("era-sub")!;
  const eraText = document.getElementById("era-text")!;
  const eraConf = document.getElementById("era-conf")!;
  const splash = document.getElementById("splash")!;

  const gallery = await createGallery();
  const card = document.getElementById("era-card")!;
  const toggle = document.getElementById("era-toggle")!;
  const setCollapsed = (on: boolean) => {
    card.classList.toggle("collapsed", on);
    toggle.setAttribute("aria-label", t(on ? "Mostrar panel" : "Ocultar panel"));
    localStorage.setItem("eraCollapsed", on ? "1" : "0");
  };
  setCollapsed(localStorage.getItem("eraCollapsed") === "1");
  toggle.addEventListener("click", () => setCollapsed(!card.classList.contains("collapsed")));

  const showEra = (e: Era, animate = true) => {
    if (animate) gallery.show(e.id);
    eraTitle.textContent = t(e.title);
    eraSub.textContent = `${formatYear(e.from)} – ${e.to >= NOW ? t("hoy") : formatYear(e.to)} · ${t(e.subtitle)}`;
    eraText.textContent = t(e.text);
    eraConf.innerHTML = `<span class="dots">${"●".repeat(e.confidence + 1)}${"○".repeat(3 - e.confidence)}</span> ${t(CONFIDENCE_LABEL[e.confidence])}`;
    document.documentElement.style.setProperty("--era", e.color);
    splash.innerHTML = `<div class="splash-title">${t(e.title)}</div><div class="splash-sub">${t(e.subtitle)}</div>`;
    if (!animate) return;
    splash.classList.remove("show");
    void splash.offsetWidth;
    splash.classList.add("show");
  };

  window.addEventListener("keydown", (ev) => {
    if ((ev.target as HTMLElement).closest("input, select, button, textarea")) return;
    if (ev.code === "Space") {
      ev.preventDefault();
      ui.togglePlay();
    } else if (rig.mode === "orbit" || rig.mode === "cine") {
      if (ev.code === "ArrowRight") pos = Math.min(pos + 0.005, 1);
      else if (ev.code === "ArrowLeft") pos = Math.max(pos - 0.005, 0);
    }
  });

  if (texturesPending) await new Promise<void>((resolve) => { THREE.DefaultLoadingManager.onLoad = resolve; });
  loading.classList.add("done");
  setTimeout(() => loading.remove(), 900);
  const timer = new THREE.Timer();
  let lastHash = 0;

  // Use only rendered frames for adaptation; an idle or hidden tab is not a slow GPU.
  let quality = 2;
  let automatic = true;
  let fpsFrames = 0;
  let frameTime = 0;
  let lastRender = 0;
  let renderedFrames = 0;
  const setQuality = (level: number) => {
    quality = level;
    gtao.enabled = level > 0;
    renderer.setPixelRatio(Math.min(devicePixelRatio, level === 2 ? 1.5 : level === 1 ? 1.15 : 1));
    resize();
    fpsFrames = 0;
    frameTime = 0;
  };
  const adaptQuality = (now: number) => {
    const previous = lastRender;
    const elapsed = now - previous;
    lastRender = now;
    if (!automatic || previous === 0 || elapsed < 1) return;
    frameTime += Math.min(elapsed, 250);
    fpsFrames++;
    if (fpsFrames < 90) return;
    if (frameTime / fpsFrames > 28 && quality > 0) setQuality(quality - 1);
    fpsFrames = 0;
    frameTime = 0;
  };
  const settings = document.createElement("div");
  settings.className = "scene-settings";
  settings.innerHTML = `
    <label>Luz <select id="light-select" aria-label="Luz"><option value="day">Día</option><option value="late">Tarde</option></select></label>
    <label>Detalle <select id="detail-select" aria-label="Detalle"><option value="auto">Auto</option><option value="2">Alto</option><option value="1">Medio</option><option value="0">Ligero</option></select></label>
    <button aria-pressed="true" title="Mostrar u ocultar nombres">Nombres</button>
    <label>Idioma <select id="language-select" aria-label="Idioma"><option value="es" lang="es">Español</option><option value="en" lang="en">English</option></select></label>`;
  document.body.appendChild(settings);
  bindTranslations(settings);
  const languageSelect = settings.querySelector<HTMLSelectElement>("#language-select")!;
  languageSelect.value = getLanguage();
  languageSelect.addEventListener("change", () => setLanguage(languageSelect.value === "en" ? "en" : "es"));
  settings.querySelector<HTMLSelectElement>("#light-select")!.onchange = (event) => {
    const late = (event.target as HTMLSelectElement).value === "late";
    SUN_DIR.set(-1400, late ? 650 : 1150, 900).normalize();
    sun.position.copy(SUN_DIR).multiplyScalar(2500);
    sun.color.set(late ? 0xffd6a0 : 0xffe7c4);
    sun.intensity = late ? 2.5 : 2.8;
    renderer.shadowMap.needsUpdate = dirty = true;
  };
  settings.querySelector<HTMLSelectElement>("#detail-select")!.onchange = (event) => {
    const value = (event.target as HTMLSelectElement).value;
    automatic = value === "auto";
    setQuality(automatic ? 2 : Number(value));
  };
  settings.querySelector("button")!.onclick = (event) => {
    labelsOn = !labelsOn;
    (event.currentTarget as HTMLButtonElement).setAttribute("aria-pressed", String(labelsOn));
    labelRenderer.domElement.classList.toggle("hide-names", !labelsOn);
    dirty = true;
  };
  document.addEventListener("visibilitychange", () => { timer.reset(); dirty = true; lastRender = 0; });
  const previousCamera = new THREE.Matrix4();
  let previousYear = NaN;
  let lastUI = 0;
  let displayedYear = NaN;
  let hashYear = NaN;
  onLanguageChange(() => {
    const year = yearAt(pos);
    showEra(eraAt(year), false);
    ui.setPos(pos, year, eraAt(year));
    yearEl.textContent = formatYear(year);
    countEl.textContent = `${formatNumber(countUpTo(buildings.years, year))} ${t("edificios")}`;
    toggle.setAttribute("aria-label", t(card.classList.contains("collapsed") ? "Mostrar panel" : "Ocultar panel"));
    dirty = true;
  });
  document.addEventListener("ronda:interface", () => { dirty = true; });

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
      dirty = true;
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
      dirty = true;
      frame();
      frame();
      frozen = true;
    },
    resume() {
      document.body.classList.remove("shot");
      frozen = false;
      dirty = true;
    },
    stats() {
      return { renderedFrames, quality, year: previousYear, pixelRatio: renderer.getPixelRatio(), ao: gtao.enabled,
        calls: renderer.info.render.calls, triangles: renderer.info.render.triangles,
        geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures };
    },
    dbg: { scene, renderer, gtao, sun, composer, direct: false },
  };

  function frame() {
    if (frozen || document.hidden) return;
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
    const now = performance.now();
    const yearChanged = year !== previousYear;
    if (yearChanged) {
      buildings.setYear(year, yearsPerStep(pos));
      terrain.setYear(year);
      monuments.update(year);
      alameda.update(year);
      tajo.update(year);
      renderer.shadowMap.needsUpdate = true;
      dirty = true;
    }
    const era = eraAt(year);
    if (era !== currentEra) { currentEra = era; showEra(era); }
    if (year !== displayedYear && (!playing || now - lastUI > 80)) {
      ui.setPos(pos, year, era);
      yearEl.textContent = formatYear(year);
      countEl.textContent = `${formatNumber(countUpTo(buildings.years, year))} ${t("edificios")}`;
      lastUI = now;
      displayedYear = year;
    }
    if (year !== hashYear && (!playing || now - lastHash > 500)) {
      lastHash = now;
      hashYear = year;
      history.replaceState(null, "", `#year=${Math.round(year)}`);
    }
    previousYear = year;
    rig.update(dt, camFor(year));
    camera.updateMatrixWorld();
    const cameraChanged = !previousCamera.equals(camera.matrixWorld);
    if (!dirty && !cameraChanged) { lastRender = 0; return; }
    if (terrain.update(camera)) renderer.shadowMap.needsUpdate = true;
    landmarks.update(year, camera);
    railway.update(year, camera);
    previousCamera.copy(camera.matrixWorld);
    renderer.info.reset();
    if ((window as unknown as { __ronda: { dbg: { direct: boolean } } }).__ronda.dbg.direct) renderer.render(scene, camera);
    else {
      // EffectComposer swaps buffers; bind the depth of this frame's scene render.
      gtao.setGBuffer(composer.readBuffer.depthTexture!);
      composer.render();
    }
    if (labelsOn) labelRenderer.render(scene, camera);
    dirty = false;
    renderedFrames++;
    adaptQuality(now);
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
      <button class="cam-views-title" aria-expanded="false">Vistas</button>
      ${VIEWPOINTS.map((v) => `<button data-view="${v.id}">${v.name}</button>`).join("")}
    </div>
    <button class="ui-toggle" aria-pressed="false"></button>`;
  bindTranslations(bar);
  const uiToggle = bar.querySelector<HTMLButtonElement>(".ui-toggle")!;
  const refreshToggle = () => {
    const hidden = document.body.classList.contains("ui-hidden");
    uiToggle.textContent = t(hidden ? "Mostrar interfaz" : "Ocultar interfaz");
    uiToggle.setAttribute("aria-pressed", String(hidden));
  };
  uiToggle.addEventListener("click", () => {
    document.body.classList.toggle("ui-hidden");
    document.getElementById("info")!.classList.remove("open");
    document.dispatchEvent(new Event("ronda:interface"));
    refreshToggle();
  });
  refreshToggle();
  const viewMenu = bar.querySelector<HTMLElement>(".cam-views")!;
  const viewToggle = bar.querySelector<HTMLButtonElement>(".cam-views-title")!;
  viewToggle.addEventListener("click", () => {
    const open = viewMenu.classList.toggle("open");
    viewToggle.setAttribute("aria-expanded", String(open));
  });
  const help = bar.querySelector<HTMLDivElement>(".cam-help")!;
  const sync = (m: CamMode) => {
    bar.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach((b) => b.classList.toggle("on", b.dataset.mode === m));
    help.textContent = t(modes.find((x) => x[0] === m)![2]);
  };
  rig.onModeChange = sync;
  sync(rig.mode);
  onLanguageChange(() => { sync(rig.mode); refreshToggle(); });
  bar.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach((b) => b.addEventListener("click", () => rig.setMode(b.dataset.mode as CamMode)));
  bar.querySelectorAll<HTMLButtonElement>("[data-view]").forEach((b) =>
    b.addEventListener("click", () => {
      rig.goTo(VIEWPOINTS.find((v) => v.id === b.dataset.view)!);
      viewMenu.classList.remove("open");
      viewToggle.setAttribute("aria-expanded", "false");
    }),
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
