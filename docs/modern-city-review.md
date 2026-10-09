# Present-day city detail review — 9 October 2026

Scope: the last chapter, “Ronda hoy”. New mapped geometry and roof corrections
start at 2022. Photographic roof colour blends in during 2022–23. No new
construction dates have been inferred for earlier periods.

## Area review

| Area | Evidence checked | Changes |
|---|---|---|
| La Ciudad, Carmen/Cijara, Albacara | IGN imagery, OSM surviving-wall lines, municipal heritage description | Replace the schematic continuous medieval enclosure in the modern view with mapped surviving sections. Keep the existing Almocábar gate. Preserve roof courtyards and irregular footprints. |
| San Francisco / south | New IGN PNOA mosaic tile; cadastral footprints | Sharper terrain and photographic roofs; mapped pools; a neighbourhood camera preset. |
| Mercadillo / Alameda / centre | Central and Tajo IGN detail images; cadastral footprints | Roof colours, terraces and skylights from photographs, clipped pitched roofs. Existing monument and Alameda models retained. |
| Station / El Fuerte / industrial estate | Station IGN detail, cadastral industrial use, OSM pitches and fences | Photographed industrial roofs; industrial facade treatment; court nets, goals and boundary fences. Existing mapped railway retained. |
| Northwest neighbourhoods and school grounds | New IGN PNOA west tile; OSM playing surfaces | Sharper imagery, mapped court fittings and pools. |
| Northeast / Ciudad Deportiva | Northeast IGN tile; OSM pitch/pool outlines; municipal sports works announcements | Pool water and rims, football goals, mapped fencing, removal of false vegetation detections. Artificial turf and schematic pitch markings from 2023, following the documented replacement of natural grass. |

Eight rendered viewpoints were checked: Ciudad, Mercadillo, station, El Fuerte,
Ciudad Deportiva, San Francisco, Cijara and northeast entrance.

## Sources and limits

- [IGN PNOA maximum-current imagery](https://pnoa.ign.es/web/portal/pnoa-imagen/ortofotos-pnoa-maxima-actualidad).
  New west and south tiles are 2048 × 2048 over 1200 × 1200 metres (0.586 m per
  output pixel). IGN's mosaic metadata reports July 2022 and 25 cm source
  resolution at the queried point in each tile. Metadata is in
  `public/data/west-imagery.json` and `south-imagery.json`. © IGN, CC BY 4.0.
- [OpenStreetMap](https://www.openstreetmap.org/copyright), © contributors, ODbL 1.0.
  `public/data/modern.json` retains the 410 selected way IDs, geometry, retrieval
  date and API source URLs: 284 outdoor pool outlines, 28 uncovered playing
  surfaces, 76 fence ways, 14 city-wall ways and 8 fountains. These are mapped
  features, not a complete inventory. Basins with more than 2 m of DEM variation
  are omitted at runtime. Covered/roof features and existing modelled fountains
  are excluded from the extract. Source data is reproducible with
  `uv run scripts/fetch_modern.py`; delete raw caches to request a fresh extract.
- [Ronda Tourism: Cijara, Carmen and Albacara walls](https://info.turismoderonda.es/monumentos/murallas-de-la-cijara-murallas-del-carmen/).
  This supports modelling the surviving sections rather than keeping a complete
  conjectural enclosure in today's city.
- [Municipal sports works, 6 September 2023](https://ayuntamientoronda.es/arrancan-las-obras-para-renovar-casi-2-500-metros-cuadrados-de-las-pistas-de-atletismo-ubicadas-en-la-ciudad-deportiva/).
  Confirms completion of the football pitch's natural-to-artificial turf change.
  The surrounding athletics track retains the photographed appearance; the
  [2025 refurbishment notice](https://ayuntamientoronda.es/el-ayuntamiento-de-ronda-inicia-la-segunda-fase-de-la-renovacion-de-las-pistas-de-atletismo/)
  is not treated as proof of a specific completed 2026 appearance.

Building footprints and floor counts remain cadastral. Roof slopes, window
layouts, wall heights, goal/net dimensions and pool rims are approximations.
Photos contain baked light and have finite resolution; they are not a facade
survey or photogrammetric mesh. In particular, an OSM outline retrieved in 2026
is not evidence that every fitting was present in 2022. The end-of-timeline
layer is a present-day visual aid, not a year-by-year surveyed reconstruction.

## Rendering and validation

The modern geometry module and 69 KB data file load only on first reaching
2022. Geometry is grouped into 500 m sectors and culled by distance; small
fittings disappear at distance. Roofs reuse the terrain's existing GPU textures.
The two new images add 3.20 MB in total and load on demand near their regions.
Historical and modern roof index buffers select only the active roof geometry.
56 false tree detections inside mapped water/playing surfaces are hidden in the
modern layer; original instance transforms are restored when seeking backwards.

`npm run build` checks TypeScript and production bundling.
`node tools/check-modern.mjs` checks lazy loading, eight rendered sectors,
period boundaries, tree restoration, the wall replacement and the mobile camera
menu. `node tools/check-history.mjs` checks timeline timing, language/settings,
camera navigation during playback, gallery assets and mobile layout.

Screenshots and raw performance measurements are in `/tmp/ronda-modern-*` during
this review. Performance figures measure GPU render time, not end-to-end FPS;
see `docs/performance/modern-review.json` for results and conditions.

In the sequential final check, the general view changed from 2.78 ms to 3.31 ms
median GPU time; El Tajo changed from 5.06 ms to 3.48 ms. The general-view cost
increased by about 0.53 ms with the added geometry. These measurements vary with
GPU load and camera position and do not establish a general speed increase.
No browser, shader or asset errors were reported. Backward seeking restored all
original tree matrices exactly. The historical renderer keeps its original roof
index sequence; the extra modern triangles are not submitted in older periods.
