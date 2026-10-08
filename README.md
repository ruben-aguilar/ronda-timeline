# Ronda through time

An interactive Three.js timeline of Ronda (Málaga), from prehistory to today.
Drag the timeline, press play, or click an era. The scale is not linear: early millennia go
fast, and 1900–today takes about a third of the bar.

## Run

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # static site in dist/, ready for Vercel / GitHub Pages
```

## Data pipeline (`scripts/`, needs `uv`)

| Script | Output |
|---|---|
| `fetch_raster.py` | `raw/dem.tif` (IGN MDT05, 5 m) and `raw/ortho_*.jpg` (IGN PNOA 2024/2004, Interministerial 1973–86, Vuelo Americano 1956) for a 4 × 4 km square centred on the Puente Nuevo |
| `export_terrain.py` | `public/data/dem.bin`, `public/textures/ortho_*.jpg` |
| `process_buildings.py` | `public/data/buildings.json` (16k Catastro building parts) and `public/textures/urban_mask.png` |
| `grid_view.py` | debug image: an orthophoto with a metre grid, used to draw `zones.json` |

Catastro buildings come from the INSPIRE download:
`https://www.catastro.hacienda.gob.es/INSPIRE/buildings/29/29084-RONDA/A.ES.SDGC.BU.29084.zip` → `raw/bu/`.

## How building dates work

- Catastro has no year before 1900. For old houses it stores the year of the last major
  reform, so it cannot date the historic town.
- `scripts/zones.json` holds four historic districts drawn over the 1956 photo (La Ciudad,
  Arrabal Bajo, San Francisco, El Mercadillo). Every building inside them existed in 1956, so
  it gets an estimated date that grows outwards from the district core.
- Outside the districts, the Catastro year is used as is.
- Monuments with a known date can be forced with `OVERRIDES` in `process_buildings.py`.

Everything before 1956 is a reconstruction. The UI shows a confidence level for each era.

## Code

- `src/timeline.ts`: slider ↔ year scale, eras and texts
- `src/terrain.ts`: terrain mesh, blends the aerial photos by year
- `src/buildings.ts`: all buildings in one mesh; a shader grows each one at its year
- `src/landmarks.ts`: bridges, walls, alcazaba, labels
- `src/ui.ts`, `src/main.ts`: timeline bar, camera, render loop
- Debug: `__ronda.shot(year, [camX, camY, camZ], [tgtX, tgtY, tgtZ])` freezes one frame.

## Next ideas

- Better pre-1900 sources: 19th-century maps (Coello 1850s), the 1945 American flight.
- Simple models for Santa María, the bullring and the Alcazaba.
- Hover a building to see its date and source.
- Lighter assets for mobile (smaller terrain, compressed textures).
