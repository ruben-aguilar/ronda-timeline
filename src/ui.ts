import { ERAS, Era, NOW, formatYear, posAt, yearAt } from "./timeline";

export interface TimelineUI {
  setPos(p: number): void;
  setPlaying(on: boolean): void;
  setAutoCam(on: boolean): void;
  togglePlay(): void;
}

const TICKS = [-25000, -3000, -800, -206, 411, 711, 1039, 1485, 1616, 1700, 1793, 1892, 1918, 1936, 1956, 1975, 2000, NOW];

export function buildTimelineUI(h: {
  onSeek(p: number): void;
  onPlay(on: boolean): void;
  onAutoCam(on: boolean): void;
  onEra(e: Era): void;
}): TimelineUI {
  const bar = document.getElementById("bar")!;
  const bands = document.getElementById("bands")!;
  const ticks = document.getElementById("ticks")!;
  const thumb = document.getElementById("thumb")!;
  const play = document.getElementById("play") as HTMLButtonElement;
  const cam = document.getElementById("autocam") as HTMLButtonElement;

  for (const e of ERAS) {
    const b = document.createElement("button");
    b.className = "band";
    const p0 = posAt(e.from);
    const p1 = posAt(e.to);
    b.style.left = `${p0 * 100}%`;
    b.style.width = `${(p1 - p0) * 100}%`;
    b.style.background = e.color;
    b.title = `${e.title} (${formatYear(e.from)} – ${e.to >= NOW ? "today" : formatYear(e.to)})`;
    b.innerHTML = `<span>${e.title}</span>`;
    b.addEventListener("click", (ev) => {
      ev.stopPropagation();
      h.onEra(e);
    });
    bands.appendChild(b);
  }
  for (const y of TICKS) {
    const t = document.createElement("div");
    t.className = "tick";
    t.style.left = `${posAt(y) * 100}%`;
    t.textContent = y === NOW ? "Today" : y < 0 ? `${Math.abs(y).toLocaleString("en-US")} BC` : String(y);
    ticks.appendChild(t);
  }

  let dragging = false;
  const seek = (ev: PointerEvent) => {
    const r = bar.getBoundingClientRect();
    h.onSeek(Math.min(Math.max((ev.clientX - r.left) / r.width, 0), 1));
  };
  bar.addEventListener("pointerdown", (ev) => {
    dragging = true;
    bar.setPointerCapture(ev.pointerId);
    seek(ev);
  });
  bar.addEventListener("pointermove", (ev) => {
    const r = bar.getBoundingClientRect();
    const p = (ev.clientX - r.left) / r.width;
    bar.dataset.hover = formatYear(yearAt(p));
    bar.style.setProperty("--hover", `${p * 100}%`);
    if (dragging) seek(ev);
  });
  bar.addEventListener("pointerup", () => (dragging = false));
  bar.addEventListener("pointerleave", () => delete bar.dataset.hover);

  let playing = false;
  const setPlaying = (on: boolean) => {
    playing = on;
    play.textContent = on ? "❚❚" : "▶";
    play.setAttribute("aria-label", on ? "Pause" : "Play");
  };
  play.addEventListener("click", () => {
    setPlaying(!playing);
    h.onPlay(playing);
  });
  let auto = true;
  const setAutoCam = (on: boolean) => {
    auto = on;
    cam.classList.toggle("on", on);
  };
  cam.addEventListener("click", () => {
    setAutoCam(!auto);
    h.onAutoCam(auto);
  });
  setAutoCam(true);

  return {
    setPos(p) {
      thumb.style.left = `${p * 100}%`;
    },
    setPlaying,
    setAutoCam,
    togglePlay() {
      setPlaying(!playing);
      h.onPlay(playing);
    },
  };
}
