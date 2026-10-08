// Time model: the slider position (0..1) maps to a year with a piecewise-linear scale.
// Early millennia take a small part of the slider; 1900 to today takes the largest part.

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

/** Years covered by a small slider step at this position. Used to size the growth animation. */
export function yearsPerStep(pos: number, step = 0.006): number {
  return Math.max(yearAt(Math.min(pos + step, 1)) - yearAt(Math.max(pos - step, 0)), 0.5) / 2;
}

export function formatYear(y: number): string {
  const r = Math.round(y);
  if (r < 0) return `${Math.abs(r).toLocaleString("en-US")} BC`;
  if (r < 1000) return `AD ${r}`;
  return String(r);
}

export interface Era {
  id: string;
  from: number;
  to: number;
  title: string;
  subtitle: string;
  text: string;
  /** How much of what you see is measured data, from 0 (imagined) to 3 (surveyed). */
  confidence: 0 | 1 | 2 | 3;
  color: string;
}

export const ERAS: Era[] = [
  {
    id: "prehistory",
    from: -25000,
    to: -800,
    title: "Prehistory",
    subtitle: "Before the town",
    text:
      "Hunters paint the walls of the Cueva de la Pileta, about 11 km south-west, more than 20,000 years ago. Later, Neolithic and Bronze Age groups farm and herd in the Serranía. The plateau over the gorge is still empty.",
    confidence: 0,
    color: "#5b4a3a",
  },
  {
    id: "iberian",
    from: -800,
    to: -206,
    title: "Iberians and Celts",
    subtitle: "A hilltop settlement",
    text:
      "A small fortified settlement grows on the plateau south of the gorge. The cliffs protect it on three sides. The name Arunda probably comes from this time.",
    confidence: 0,
    color: "#7a5c3e",
  },
  {
    id: "roman",
    from: -206,
    to: 411,
    title: "Roman Hispania",
    subtitle: "Arunda and Acinipo",
    text:
      "After the Second Punic War, Rome controls the region. Arunda stays a small town. The larger Roman city is Acinipo, about 11 km north-west, with a theatre from the 1st century BC.",
    confidence: 0,
    color: "#8c3b2e",
  },
  {
    id: "visigoth",
    from: 411,
    to: 711,
    title: "Late Antiquity",
    subtitle: "Vandals and Visigoths",
    text:
      "The Roman world breaks up. Visigothic kings rule from Toledo. Very few remains from this period survive in Ronda.",
    confidence: 0,
    color: "#6b5b73",
  },
  {
    id: "andalus",
    from: 711,
    to: 1039,
    title: "Al-Andalus",
    subtitle: "Izna Rand Onda",
    text:
      "Berber troops arrive after 711. The town, now Izna Rand Onda, belongs to the province of Takurunna. Walls, a citadel and the medina take shape on the plateau. The revolt of Umar ibn Hafsun (880–928) shakes the mountains around it.",
    confidence: 1,
    color: "#2f6f5e",
  },
  {
    id: "taifa",
    from: 1039,
    to: 1065,
    title: "Taifa of Ronda",
    subtitle: "An independent kingdom",
    text:
      "When the Caliphate of Córdoba collapses, the Banu Ifran rule a small independent kingdom from Ronda. In 1065 the taifa of Seville takes it.",
    confidence: 1,
    color: "#2f7f6e",
  },
  {
    id: "frontier",
    from: 1065,
    to: 1485,
    title: "Frontier fortress",
    subtitle: "Almoravids, Almohads, Marinids, Nasrids",
    text:
      "Ronda becomes a fortress on the frontier with Castile. The Arab baths, the water mine under the Casa del Rey Moro and the Almocábar gate belong to this period. Suburbs grow outside the walls, next to the river.",
    confidence: 1,
    color: "#3d8a6a",
  },
  {
    id: "castile",
    from: 1485,
    to: 1700,
    title: "Castilian Ronda",
    subtitle: "Conquest of 22 May 1485",
    text:
      "Ferdinand the Catholic takes Ronda after a short siege. The main mosque becomes the church of Santa María la Mayor. A market district, El Mercadillo, grows north of the gorge. The Puente Viejo is rebuilt in 1616.",
    confidence: 1,
    color: "#a0682a",
  },
  {
    id: "bridges",
    from: 1700,
    to: 1800,
    title: "Bridges and bulls",
    subtitle: "The 18th century",
    text:
      "A first bridge over the gorge collapses in 1741. The Puente Nuevo is built from 1759 to 1793 to a design by José Martín de Aldehuela. The bullring of the Real Maestranza opens in 1785.",
    confidence: 2,
    color: "#b5862e",
  },
  {
    id: "romantic",
    from: 1800,
    to: 1900,
    title: "War, bandits and travellers",
    subtitle: "The 19th century",
    text:
      "French troops occupy Ronda during the Peninsular War and blow up the Alcazaba when they leave in 1812. Bandits of the Serranía and romantic travellers make Ronda famous. The railway from Bobadilla to Algeciras reaches the town in 1892.",
    confidence: 2,
    color: "#9d6b45",
  },
  {
    id: "early20",
    from: 1900,
    to: 1936,
    title: "Early 20th century",
    subtitle: "Rilke and the Andalusian flag",
    text:
      "The poet Rainer Maria Rilke stays in Ronda in 1912–13. In 1918 the Ronda Assembly adopts the flag and the shield of Andalusia. The town grows toward the railway station.",
    confidence: 2,
    color: "#6d7f8f",
  },
  {
    id: "war",
    from: 1936,
    to: 1975,
    title: "Civil War and dictatorship",
    subtitle: "1936–1975",
    text:
      "The Civil War brings violence to Ronda in 1936. In the 1950s and 1960s new blocks appear north of the old Mercadillo. The aerial photos from 1956 are the first full picture of the town.",
    confidence: 3,
    color: "#5a6470",
  },
  {
    id: "democracy",
    from: 1975,
    to: 2000,
    title: "Democracy and tourism",
    subtitle: "1975–2000",
    text:
      "New districts and an industrial area grow north of the railway. Tourism becomes the main industry of the town.",
    confidence: 3,
    color: "#3f7cac",
  },
  {
    id: "today",
    from: 2000,
    to: NOW,
    title: "Ronda today",
    subtitle: "About 34,000 inhabitants",
    text:
      "The 2000s are the decade with the most new buildings in the Catastro. Building dates after 1956 come straight from the Catastro.",
    confidence: 3,
    color: "#2f8fb0",
  },
];

export function eraAt(year: number): Era {
  for (const e of ERAS) if (year < e.to) return e;
  return ERAS[ERAS.length - 1];
}

export const CONFIDENCE_LABEL = [
  "Imagined: no data, shapes are illustrative",
  "Reconstructed: historic districts, estimated dates",
  "Estimated: historic districts plus dated monuments",
  "Measured: aerial photos and Catastro dates",
];
