import { t, onLanguageChange } from "./i18n";
// Era gallery in the era card, and a full-screen viewer with title, caption and credit.

interface GalleryItem {
  img: string;
  thumb: string;
  title: string;
  caption: string;
  kind: string;
  date: string;
  credit: string;
  license: string;
  source: string;
}

export interface Gallery {
  show(eraId: string): void;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export async function createGallery(pausePlayback: () => void): Promise<Gallery> {
  const data: Record<string, GalleryItem[]> = await (await fetch("data/gallery.json")).json();
  const strip = document.getElementById("era-gallery")!;
  const box = document.getElementById("lightbox")!;
  const img = box.querySelector("img")!;
  const title = box.querySelector<HTMLDivElement>(".lb-title")!;
  const caption = box.querySelector<HTMLDivElement>(".lb-caption")!;
  const credit = box.querySelector<HTMLDivElement>(".lb-credit")!;
  const metadata = document.createElement("div");
  metadata.className = "lb-meta";
  title.after(metadata);
  let items: GalleryItem[] = [];
  let index = 0;

  const open = (i: number) => {
    pausePlayback();
    index = (i + items.length) % items.length;
    const it = items[index];
    img.src = it.img;
    img.alt = t(it.title);
    title.textContent = t(it.title);
    metadata.textContent = `${t(it.kind)} · ${t(it.date)}`;
    caption.textContent = t(it.caption);
    credit.innerHTML = `${esc(t(it.credit))} · ${esc(it.license)} · <a href="${esc(it.source)}" target="_blank" rel="noopener">${t("fuente")}</a> · ${index + 1}/${items.length}`;
    box.classList.add("open");
    box.setAttribute("aria-hidden", "false");
  };
  const close = () => {
    box.classList.remove("open");
    box.setAttribute("aria-hidden", "true");
  };
  box.querySelector(".lb-close")!.addEventListener("click", close);
  box.querySelector(".lb-prev")!.addEventListener("click", () => open(index - 1));
  box.querySelector(".lb-next")!.addEventListener("click", () => open(index + 1));
  box.addEventListener("click", (e) => {
    if (e.target === box) close();
  });
  window.addEventListener(
    "keydown",
    (e) => {
      if (!box.classList.contains("open")) return;
      if (e.key === "Escape") close();
      else if (e.key === "ArrowLeft") open(index - 1);
      else if (e.key === "ArrowRight") open(index + 1);
      else return;
      e.stopImmediatePropagation();
      e.preventDefault();
    },
    true,
  );

  const renderStrip = () => {
      strip.innerHTML = items
        .map((it, i) => `<button class="g-thumb" data-i="${i}" title="${esc(t(it.title))} · ${esc(t(it.kind))} · ${esc(t(it.date))}"><img src="${it.thumb}" alt="${esc(t(it.title))}" loading="lazy" /><span>${esc(t(it.title))}</span><small>${esc(t(it.date))}</small></button>`)
        .join("");
      strip.querySelectorAll<HTMLButtonElement>(".g-thumb").forEach((b) => b.addEventListener("click", () => open(Number(b.dataset.i))));
  };
  onLanguageChange(() => {
    const scroll = strip.scrollLeft;
    renderStrip();
    strip.scrollLeft = scroll;
    if (box.classList.contains("open")) open(index);
  });
  document.addEventListener("ronda:interface", close);
  return {
    show(eraId) {
      items = data[eraId] ?? [];
      renderStrip();
      strip.scrollLeft = 0;
    },
  };
}
