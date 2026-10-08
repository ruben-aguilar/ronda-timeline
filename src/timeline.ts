// Modelo del tiempo: la posición del deslizador (0..1) se convierte en un año con una escala
// lineal por tramos. Los primeros milenios ocupan poco; de 1900 a hoy ocupa la mayor parte.

export const NOW = 2026;

const KEYS: Array<[number, number]> = [
  [0.0, -25000],
  [0.05, -3000],
  [0.1, -800],
  [0.16, -206],
  [0.22, 411],
  [0.27, 711],
  [0.38, 1485],
  [0.48, 1700],
  [0.56, 1800],
  [0.64, 1900],
  [1.0, NOW],
];

export function yearAt(pos: number): number {
  const p = Math.min(Math.max(pos, 0), 1);
  for (let i = 1; i < KEYS.length; i++) {
    const [p0, y0] = KEYS[i - 1];
    const [p1, y1] = KEYS[i];
    if (p <= p1) return y0 + ((p - p0) / (p1 - p0)) * (y1 - y0);
  }
  return NOW;
}

export function posAt(year: number): number {
  const y = Math.min(Math.max(year, KEYS[0][1]), NOW);
  for (let i = 1; i < KEYS.length; i++) {
    const [p0, y0] = KEYS[i - 1];
    const [p1, y1] = KEYS[i];
    if (y <= y1) return p0 + ((y - y0) / (y1 - y0)) * (p1 - p0);
  }
  return 1;
}

/** Años que cubre un paso pequeño del deslizador en esta posición (para la animación de crecimiento). */
export function yearsPerStep(pos: number, step = 0.006): number {
  return Math.max(yearAt(Math.min(pos + step, 1)) - yearAt(Math.max(pos - step, 0)), 0.5) / 2;
}

const fmt = new Intl.NumberFormat("es-ES");

export function formatYear(y: number): string {
  const r = Math.round(y);
  if (r < 0) return `${fmt.format(Math.abs(r))} a. C.`;
  if (r < 1000) return `${r} d. C.`;
  return String(r);
}

export function formatNumber(n: number): string {
  return fmt.format(n);
}

export interface Era {
  id: string;
  from: number;
  to: number;
  title: string;
  subtitle: string;
  text: string;
  /** Cuánto de lo que se ve son datos medidos: de 0 (imaginado) a 3 (medido). */
  confidence: 0 | 1 | 2 | 3;
  color: string;
}

export const ERAS: Era[] = [
  {
    id: "prehistory",
    from: -25000,
    to: -800,
    title: "Prehistoria",
    subtitle: "Antes de la ciudad",
    text:
      "Hace más de 20.000 años, cazadores pintan las paredes de la Cueva de la Pileta, a unos 11 km al suroeste. Después, grupos del Neolítico y de la Edad del Bronce cultivan y pastorean en la Serranía. La meseta sobre el Tajo sigue vacía.",
    confidence: 0,
    color: "#6b5640",
  },
  {
    id: "iberian",
    from: -800,
    to: -206,
    title: "Íberos y celtas",
    subtitle: "Un poblado en la meseta",
    text:
      "Un pequeño poblado fortificado crece en la meseta al sur del Tajo. Los acantilados lo protegen por tres lados. El nombre de Arunda viene probablemente de esta época.",
    confidence: 0,
    color: "#8a6440",
  },
  {
    id: "roman",
    from: -206,
    to: 411,
    title: "Hispania romana",
    subtitle: "Arunda y Acinipo",
    text:
      "Tras la Segunda Guerra Púnica, Roma controla la región. Arunda es una ciudad pequeña. La gran ciudad romana es Acinipo, a unos 11 km al noroeste, con un teatro del siglo I a. C.",
    confidence: 0,
    color: "#9b3f2f",
  },
  {
    id: "visigoth",
    from: 411,
    to: 711,
    title: "Antigüedad tardía",
    subtitle: "Vándalos y visigodos",
    text: "El mundo romano se rompe. Los reyes visigodos gobiernan desde Toledo. En Ronda quedan muy pocos restos de esta época.",
    confidence: 0,
    color: "#6f5e7a",
  },
  {
    id: "andalus",
    from: 711,
    to: 1039,
    title: "Al-Ándalus",
    subtitle: "Izna Rand Onda",
    text:
      "Tropas bereberes llegan después del año 711. La ciudad, ahora Izna Rand Onda, pertenece a la cora de Takurunna. Las murallas, la alcazaba y la medina toman forma en la meseta. La revuelta de Umar ibn Hafsún (880–928) sacude las montañas de alrededor.",
    confidence: 1,
    color: "#2f7462",
  },
  {
    id: "taifa",
    from: 1039,
    to: 1065,
    title: "Taifa de Ronda",
    subtitle: "Un reino independiente",
    text:
      "Cuando cae el Califato de Córdoba, los Banu Ifrán gobiernan desde Ronda un pequeño reino independiente. En 1065 la taifa de Sevilla lo conquista.",
    confidence: 1,
    color: "#2b8573",
  },
  {
    id: "frontier",
    from: 1065,
    to: 1485,
    title: "Fortaleza de frontera",
    subtitle: "Almorávides, almohades, benimerines y nazaríes",
    text:
      "Ronda es una fortaleza en la frontera con Castilla. Los baños árabes, la mina de la Casa del Rey Moro y la puerta de Almocábar son de esta época. Fuera de las murallas, junto al río, crecen los arrabales.",
    confidence: 1,
    color: "#3e8f6c",
  },
  {
    id: "castile",
    from: 1485,
    to: 1700,
    title: "Ronda castellana",
    subtitle: "La conquista del 22 de mayo de 1485",
    text:
      "Fernando el Católico toma Ronda tras un asedio corto. La mezquita mayor se convierte en la iglesia de Santa María la Mayor. Al norte del Tajo crece un barrio de mercado: El Mercadillo. En 1616 se reconstruye el Puente Viejo.",
    confidence: 1,
    color: "#a8692a",
  },
  {
    id: "bridges",
    from: 1700,
    to: 1800,
    title: "Puentes y toros",
    subtitle: "El siglo XVIII",
    text:
      "Un primer puente sobre el Tajo se hunde en 1741. El Puente Nuevo se construye entre 1759 y 1793, con proyecto de José Martín de Aldehuela. La plaza de toros de la Real Maestranza se inaugura en 1785.",
    confidence: 2,
    color: "#bf8c2c",
  },
  {
    id: "romantic",
    from: 1800,
    to: 1900,
    title: "Guerra, bandoleros y viajeros",
    subtitle: "El siglo XIX",
    text:
      "Las tropas francesas ocupan Ronda durante la Guerra de la Independencia y vuelan la Alcazaba al marcharse en 1812. Los bandoleros de la Serranía y los viajeros románticos hacen famosa a Ronda. En 1892 llega el ferrocarril de Bobadilla a Algeciras.",
    confidence: 2,
    color: "#a26d44",
  },
  {
    id: "early20",
    from: 1900,
    to: 1936,
    title: "Principios del siglo XX",
    subtitle: "Rilke y la bandera andaluza",
    text:
      "El poeta Rainer Maria Rilke vive en Ronda en 1912–13. En 1918 la Asamblea de Ronda adopta la bandera y el escudo de Andalucía. La ciudad crece hacia la estación de tren.",
    confidence: 2,
    color: "#6f8193",
  },
  {
    id: "war",
    from: 1936,
    to: 1975,
    title: "Guerra Civil y dictadura",
    subtitle: "1936–1975",
    text:
      "La Guerra Civil trae la violencia a Ronda en 1936. En los años 50 y 60 aparecen nuevos bloques al norte del Mercadillo. Las fotos aéreas de 1956 son la primera imagen completa de la ciudad.",
    confidence: 3,
    color: "#5d6873",
  },
  {
    id: "democracy",
    from: 1975,
    to: 2000,
    title: "Democracia y turismo",
    subtitle: "1975–2000",
    text: "Nuevos barrios y un polígono industrial crecen al norte de la vía del tren. El turismo se convierte en la principal industria de la ciudad.",
    confidence: 3,
    color: "#3f7cac",
  },
  {
    id: "today",
    from: 2000,
    to: NOW,
    title: "Ronda hoy",
    subtitle: "Unos 34.000 habitantes",
    text:
      "Los años 2000 son la década con más edificios nuevos en el Catastro. Las fechas de los edificios posteriores a 1956 vienen directamente del Catastro.",
    confidence: 3,
    color: "#2f8fb0",
  },
];

export function eraAt(year: number): Era {
  for (const e of ERAS) if (year < e.to) return e;
  return ERAS[ERAS.length - 1];
}

export const CONFIDENCE_LABEL = [
  "Imaginado: sin datos, formas ilustrativas",
  "Reconstruido: barrios históricos, fechas estimadas",
  "Estimado: barrios históricos y monumentos fechados",
  "Medido: fotos aéreas y fechas del Catastro",
];

export interface TimelineEvent {
  year: number;
  title: string;
}

export const EVENTS: TimelineEvent[] = [
  { year: -20000, title: "Pinturas de la Cueva de la Pileta" },
  { year: -206, title: "Roma controla la región" },
  { year: 711, title: "Llegan las tropas bereberes" },
  { year: 1039, title: "Nace la taifa de Ronda" },
  { year: 1485, title: "Conquista castellana (22 de mayo)" },
  { year: 1572, title: "Se funda la Real Maestranza" },
  { year: 1616, title: "Se reconstruye el Puente Viejo" },
  { year: 1741, title: "Se hunde el primer puente" },
  { year: 1785, title: "Se inaugura la plaza de toros" },
  { year: 1793, title: "Se termina el Puente Nuevo" },
  { year: 1812, title: "Los franceses vuelan la Alcazaba" },
  { year: 1892, title: "Llega el ferrocarril" },
  { year: 1918, title: "Asamblea de Ronda: bandera andaluza" },
  { year: 1936, title: "Comienza la Guerra Civil" },
  { year: 1956, title: "Primer vuelo fotográfico completo" },
];
