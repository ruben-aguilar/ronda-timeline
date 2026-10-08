import { t, bindTranslations, onLanguageChange } from "./i18n";
import { ERAS, EVENTS, Era, NOW, formatYear, posAt, yearAt } from "./timeline";

export interface TimelineUI {
  setPos(p: number, year: number, era: Era): void;
  setPlaying(on: boolean): void;
  togglePlay(): void;
}

const TICKS = [-25000, -800, -206, 411, 711, 1039, 1485, 1700, 1800, 1900, 1936, 1956, 1975, 2000, NOW];
const SPEEDS = [0.5, 1, 2, 4];

export function buildTimelineUI(opts: {
  years: Float32Array;
  onSeek(p: number): void;
  onPlay(on: boolean): void;
  onSpeed(s: number): void;
}): TimelineUI {
  const root = document.getElementById("timeline")!;
  root.innerHTML = `
    <div class="tl-head">
      <button class="tl-play" aria-label="Reproducir">
        <svg viewBox="0 0 24 24" class="i-play"><path d="M7 4.5v15l13-7.5z"/></svg>
        <svg viewBox="0 0 24 24" class="i-pause"><path d="M6 4h4.5v16H6zM13.5 4H18v16h-4.5z"/></svg>
      </button>
      <div class="tl-now">
        <div class="tl-now-era"><span class="tl-dot"></span><span class="tl-era-name"></span></div>
        <div class="tl-now-sub"></div>
      </div>
      <div class="tl-speed" role="group" aria-label="Velocidad">
        ${SPEEDS.map((s) => `<button data-s="${s}" class="${s === 1 ? "on" : ""}">${s}×</button>`).join("")}
      </div>
    </div>
    <div class="tl-track">
      <svg class="tl-growth" preserveAspectRatio="none" viewBox="0 0 1000 100" aria-label="Edificios en pie a lo largo del tiempo">
        <defs>
          <linearGradient id="tlg" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stop-color="#f3c77b" stop-opacity="0.75"/>
            <stop offset="1" stop-color="#f3c77b" stop-opacity="0.04"/>
          </linearGradient>
          <clipPath id="tlclip"><rect class="tl-clip" x="0" y="0" width="0" height="100"/></clipPath>
        </defs>
        <path class="tl-area-future"/>
        <path class="tl-area" clip-path="url(#tlclip)"/>
        <path class="tl-line" clip-path="url(#tlclip)"/>
      </svg>
      <div class="tl-events"></div>
      <div class="tl-eras"></div>
      <div class="tl-ticks"></div>
      <div class="tl-thumb"><div class="tl-bubble"></div></div>
      <div class="tl-tip"></div>
    </div>`;

  bindTranslations(root);

  const track = root.querySelector<HTMLDivElement>(".tl-track")!;
  const erasEl = root.querySelector<HTMLDivElement>(".tl-eras")!;
  const eventsEl = root.querySelector<HTMLDivElement>(".tl-events")!;
  const ticksEl = root.querySelector<HTMLDivElement>(".tl-ticks")!;
  const thumb = root.querySelector<HTMLDivElement>(".tl-thumb")!;
  const bubble = root.querySelector<HTMLDivElement>(".tl-bubble")!;
  const tip = root.querySelector<HTMLDivElement>(".tl-tip")!;
  const clip = root.querySelector<SVGRectElement>(".tl-clip")!;
  const playBtn = root.querySelector<HTMLButtonElement>(".tl-play")!;
  const eraName = root.querySelector<HTMLSpanElement>(".tl-era-name")!;
  const eraSub = root.querySelector<HTMLDivElement>(".tl-now-sub")!;
  const dot = root.querySelector<HTMLSpanElement>(".tl-dot")!;

  // Growth chart: buildings standing at each point of the slider (square-root scale so the
  // small medieval town is still visible next to the modern one).
  const N = 400;
  const sorted = opts.years;
  const total = sorted.length;
  let j = 0;
  const pts: string[] = [];
  for (let i = 0; i <= N; i++) {
    const y = yearAt(i / N);
    while (j < total && sorted[j] <= y) j++;
    const v = Math.sqrt(j / total);
    pts.push(`${((i / N) * 1000).toFixed(1)},${(100 - v * 92).toFixed(1)}`);
  }
  const line = `M${pts.join(" L")}`;
  const area = `${line} L1000,100 L0,100 Z`;
  root.querySelector(".tl-area")!.setAttribute("d", area);
  root.querySelector(".tl-area-future")!.setAttribute("d", area);
  root.querySelector(".tl-line")!.setAttribute("d", line);

  // Era segments.
  const eraEls = ERAS.map((e) => {
    const b = document.createElement("button");
    b.className = "tl-era";
    const p0 = posAt(e.from);
    const p1 = posAt(e.to);
    b.style.left = `${p0 * 100}%`;
    b.style.width = `${(p1 - p0) * 100}%`;
    b.style.setProperty("--c", e.color);
    b.innerHTML = `<span>${t(e.title)}</span>`;
    b.dataset.tip = `<b>${t(e.title)}</b><br>${formatYear(e.from)} – ${e.to >= NOW ? t("hoy") : formatYear(e.to)}`;
    b.addEventListener("click", (ev) => {
      ev.stopPropagation();
      opts.onSeek(p0 + 0.0005);
    });
    erasEl.appendChild(b);
    return { e, b };
  });

  // Event markers.
  for (const ev of EVENTS) {
    const m = document.createElement("button");
    m.className = "tl-event";
    m.style.left = `${posAt(ev.year) * 100}%`;
    m.setAttribute("aria-label", `${formatYear(ev.year)}: ${t(ev.title)}`);
    m.dataset.tip = `<b>${formatYear(ev.year)}</b><br>${t(ev.title)}`;
    m.addEventListener("click", (e) => {
      e.stopPropagation();
      opts.onSeek(posAt(ev.year) + 0.0008);
    });
    eventsEl.appendChild(m);
  }

  for (const y of TICKS) {
    const tick = document.createElement("div");
    tick.className = "tl-tick";
    tick.style.left = `${posAt(y) * 100}%`;
    tick.textContent = y === NOW ? t("Hoy") : y < 0 ? formatYear(y) : String(y);
    ticksEl.appendChild(tick);
  }

  // Scrubbing and hover tooltip.
  let dragging = false;
  const posOf = (ev: PointerEvent) => {
    const r = track.getBoundingClientRect();
    return Math.min(Math.max((ev.clientX - r.left) / r.width, 0), 1);
  };
  track.addEventListener("pointerdown", (ev) => {
    if ((ev.target as HTMLElement).closest(".tl-era, .tl-event")) return;
    dragging = true;
    track.setPointerCapture(ev.pointerId);
    opts.onSeek(posOf(ev));
  });
  track.addEventListener("pointermove", (ev) => {
    if (dragging) {
      opts.onSeek(posOf(ev));
      tip.classList.remove("show");
      return;
    }
    const target = (ev.target as HTMLElement).closest<HTMLElement>("[data-tip]");
    const r = track.getBoundingClientRect();
    tip.innerHTML = target ? target.dataset.tip! : formatYear(yearAt(posOf(ev)));
    tip.style.left = `${Math.min(Math.max(ev.clientX - r.left, 60), r.width - 60)}px`;
    tip.classList.add("show");
  });
  track.addEventListener("pointerup", () => (dragging = false));
  track.addEventListener("pointerleave", () => tip.classList.remove("show"));

  let playing = false;
  const setPlaying = (on: boolean) => {
    playing = on;
    root.classList.toggle("playing", on);
    playBtn.setAttribute("aria-label", t(on ? "Pausa" : "Reproducir"));
  };
  playBtn.addEventListener("click", () => {
    setPlaying(!playing);
    opts.onPlay(playing);
  });
  root.querySelectorAll<HTMLButtonElement>(".tl-speed button").forEach((b) =>
    b.addEventListener("click", () => {
      root.querySelectorAll(".tl-speed button").forEach((x) => x.classList.remove("on"));
      b.classList.add("on");
      opts.onSpeed(Number(b.dataset.s));
    }),
  );

  let lastEra: Era | null = null;
  onLanguageChange(() => {
    lastEra = null;
    setPlaying(playing);
    tip.classList.remove("show");
    for (const { e, b } of eraEls) {
      b.querySelector("span")!.textContent = t(e.title);
      b.dataset.tip = `<b>${t(e.title)}</b><br>${formatYear(e.from)} – ${e.to >= NOW ? t("hoy") : formatYear(e.to)}`;
    }
    eventsEl.querySelectorAll<HTMLButtonElement>("button").forEach((button, i) => {
      const ev = EVENTS[i];
      button.dataset.tip = `<b>${formatYear(ev.year)}</b><br>${t(ev.title)}`;
      button.setAttribute("aria-label", `${formatYear(ev.year)}: ${t(ev.title)}`);
    });
    ticksEl.querySelectorAll(".tl-tick").forEach((tick, i) => {
      const y = TICKS[i];
      tick.textContent = y === NOW ? t("Hoy") : y < 0 ? formatYear(y) : String(y);
    });
  });
  return {
    setPos(p, year, era) {
      thumb.style.left = `${p * 100}%`;
      bubble.textContent = formatYear(year);
      clip.setAttribute("width", String(p * 1000));
      if (era !== lastEra) {
        lastEra = era;
        eraName.textContent = t(era.title);
        eraSub.textContent = `${formatYear(era.from)} – ${era.to >= NOW ? t("hoy") : formatYear(era.to)}`;
        dot.style.background = era.color;
        for (const { e, b } of eraEls) b.classList.toggle("active", e === era);
      }
      for (const { e, b } of eraEls) b.classList.toggle("past", e.to <= year);
    },
    setPlaying,
    togglePlay() {
      setPlaying(!playing);
      opts.onPlay(playing);
    },
  };
}
