import english from "./locales/en.json";

export type Language = "es" | "en";
const catalog: Record<string, string> = english;
let language: Language = "es";
try {
  if (localStorage.getItem("ronda-language") === "en") language = "en";
} catch { /* Storage can be disabled in private browsers. */ }
const listeners = new Set<() => void>();
const numbers = { es: new Intl.NumberFormat("es-ES"), en: new Intl.NumberFormat("en-GB") };

export const getLanguage = () => language;
export const t = (source: string): string => language === "en" ? catalog[source] ?? source : source;
export const formatNumber = (value: number): string => numbers[language].format(value);
export const onLanguageChange = (refresh: () => void): void => { listeners.add(refresh); };

export function setLanguage(next: Language): void {
  if (next === language) return;
  language = next;
  try { localStorage.setItem("ronda-language", next); } catch { /* Keep the selection for this visit. */ }
  document.documentElement.lang = next;
  for (const refresh of listeners) refresh();
}

/** Bind static UI once. Keep the original text and DOM nodes, including links and listeners. */
export function bindTranslations(root: Node): void {
  const updates: Array<() => void> = [];
  const visit = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const original = node.textContent ?? "";
      const source = original.trim();
      if (source in catalog) updates.push(() => { node.textContent = original.replace(source, t(source)); });
    } else if (node instanceof Element) {
      if (node.matches("script, style")) return;
      for (const attr of ["aria-label", "title", "alt"]) {
        const source = node.getAttribute(attr);
        if (source && source in catalog) updates.push(() => node.setAttribute(attr, t(source)));
      }
    }
    node.childNodes.forEach(visit);
  };
  visit(root);
  const refresh = () => updates.forEach(update => update());
  onLanguageChange(refresh);
  refresh();
}
