// Loaders and the terrain sampler. Local coordinates: x = metres east, n = metres north of the
// scene centre (Puente Nuevo). World coordinates: X = x, Y = elevation - Y_OFFSET, Z = -n.

export const Y_OFFSET = 600;

export interface Dem {
  rows: number;
  cols: number;
  size: number;
  cell: number;
  /** Elevations in metres, row 0 = north. */
  h: Float32Array;
}

export async function loadDem(): Promise<Dem> {
  const meta = await (await fetch("data/dem.json")).json();
  const buf = await (await fetch("data/dem.bin")).arrayBuffer();
  const raw = new Uint16Array(buf);
  const h = new Float32Array(raw.length);
  for (let i = 0; i < raw.length; i++) h[i] = raw[i] / 10;
  return { rows: meta.rows, cols: meta.cols, size: meta.size, cell: meta.size / meta.cols, h };
}

/** Bilinear elevation (metres above sea level) at local x (east), n (north). */
export function elevation(dem: Dem, x: number, n: number): number {
  const half = dem.size / 2;
  const c = Math.min(Math.max((x + half) / dem.cell - 0.5, 0), dem.cols - 1.001);
  const r = Math.min(Math.max((half - n) / dem.cell - 0.5, 0), dem.rows - 1.001);
  const c0 = Math.floor(c);
  const r0 = Math.floor(r);
  const fc = c - c0;
  const fr = r - r0;
  const i = r0 * dem.cols + c0;
  const a = dem.h[i] * (1 - fc) + dem.h[i + 1] * fc;
  const b = dem.h[i + dem.cols] * (1 - fc) + dem.h[i + dem.cols + 1] * fc;
  return a * (1 - fr) + b * fr;
}

/** [year, floors, base elevation in dm, rings as flat dm coordinate lists, use, zone, Catastro year] */
export type PartRecord = [number, number, number, number[][], string, string, number];

export interface BuildingData {
  origin: { x: number; y: number; size: number };
  parts: PartRecord[];
}

export async function loadBuildings(): Promise<BuildingData> {
  return (await fetch("data/buildings.json")).json();
}
