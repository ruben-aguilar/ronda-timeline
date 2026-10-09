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

## Second visual pass — 9 October 2026

Reviewed the old town, Cijara, San Francisco, station/industrial area, El Fuerte,
Ciudad Deportiva and the northeast, plus the Puente Nuevo river view. The new
geometry remains restricted to the 2022+ layer in the final timeline period.

Corrections:

- Clipped hip roofs had open vertical edges above the wall tops, especially at
  courtyards and L-shaped corners. Close those edges with plaster faces. Preserve
  the courtyard holes. Do not add windows to the short roof-edge faces.
- The clipped roof vertices used map coordinates for tile UVs. Interpolate the
  original slope coordinates so the photographic tile grain follows each roof
  face. Retain the aerial photograph as the main roof colour and detail source;
  add subtle tile grain only at close range, fading out by 200 m.
- Ground, roofs and courts now share one orthophoto projection and overlap order.
  Courts previously omitted the south/Tajo detail photos, and roof overlap order
  differed from the ground around station/northeast tiles.
- Playing surfaces are clipped to the DEM's actual 5 m triangles. Their interiors
  no longer bridge over terrain changes between sparse outline vertices.
- Replace separate tilted wall boxes with joined, upright wall strips. Join
  corners, bury foundations, remove internal end caps and use continuous metric
  masonry UVs. Top faces now have a horizontal texture projection rather than
  a collapsed vertical projection. Keep the Almocábar gate opening clear.
- Close the gap below level pool rims on sloping ground. Anchor ripple detail in
  world space. Pools reflect the same sky photo used by the background, with a
  viewing-angle-dependent strength. This reuses the sky texture and adds no
  reflection render pass or continuous animation.

No new imagery or claimed construction dates were added. Generic roof forms,
wall heights and pool basin depths remain visual estimates. Reflections show the
sky; they do not reproduce surrounding buildings or trees. The imagery and DEM
resolution still limit street-level accuracy.

Checks passed: production build; eight-sector modern browser check; historical
layer/tree restoration; mobile camera menu; history/settings/language/playback
checks; geometry checks for concave courts on uneven terrain, both polygon
windings, upward wall caps, outward wall faces, courtyard roof area, square-roof
UVs and finite attributes throughout the real building mesh.

The added code is about 1.6 kB compressed across the main and optional modern
bundles. No image download was added. Hidden flat lids under modern pitched roofs
and unused modern copies of historical-only roofs are no longer submitted.
Final render measurements are recorded in `performance/modern-second-pass.json`.

With both views warmed and optional assets loaded, median GPU time changed from
3.37 to 3.33 ms in the general view and from 2.74 to 2.82 ms at El Tajo. Draw calls
remain 399 and 294 respectively. Submitted triangles increase by about 4%; these
counts include all passes. The differences in GPU time are small and do not show
a general speed increase. The benchmark now waits for optional assets instead of
using a fixed startup delay, which could measure different scene states.
