# Rendering check — 8 October 2026

Baseline: `c88e211` (the previously published site). The updated build uses the same terrain,
building records, dates, and monument models.

## Measurement

Chrome, ANGLE Metal, Apple M5 Pro; 1440 × 900, device pixel ratio 1; year 2026.
Both versions have ambient occlusion enabled. The original AO runs at full resolution;
the new AO runs at half resolution and reads the rendered scene depth. Each view has five
warm-up renders and 40 samples. GPU times use `EXT_disjoint_timer_query_webgl2`, with
availability and disjoint checks. These are GPU render times, **not frame-rate estimates**.

| View | Before, median GPU time | After, median GPU time | Reduction |
| --- | ---: | ---: | ---: |
| General view | 10.78 ms | 3.20 ms | 70% |
| El Tajo | 6.94 ms | 2.51 ms | 64% |

Submitted triangles fell from 27.8 million to 1.06 million (general) and 0.99 million
(El Tajo) with AO enabled. Counts include all rendering passes, not unique scene triangles.
Shadows are cached in the updated stationary views. A change to the year, light, or terrain
LOD rebuilds them. Moving views and timeline playback therefore have different costs.
Results are from one machine; they do not predict every phone or GPU.

Raw data: [before.json](before.json), [after.json](after.json).
Screenshots: `before-general.png`, `after-general.png`, `before-tajo.png`, `after-tajo.png`.

## Changes

- Terrain tiles retain 5 m DEM samples near the camera, with coarser distant levels,
  shared edge normals, skirts, and hysteresis to limit visible switching.
- Trees use instanced leaf clusters in spatial batches, including the Alameda canopy.
- Building indices are sorted by appearance year. Future buildings are not submitted.
- AO reads the visible scene depth, so it follows building growth and avoids a second
  full scene render with an incompatible override material.
- The shadow map updates only when scene geometry or the sun changes.
- Paused, settled orbit views stop rendering. Hidden tabs skip scene work.
- Quality changes update both the renderer and postprocessing resolution.
- Camera smoothing uses elapsed time. Terrain detail is softer and facade bump fades
  with distance. Reversed GLSL smoothstep bounds are corrected.
- Labels are filtered for overlap and terrain obstruction. Light, detail, and label controls
  fit the mobile layout; saved camera views have a touch-accessible menu.
- Texture-only shaders do not request unused PBR maps. The loading screen waits for images.

## Checks

`npm run build` passes. `npm run check -- http://localhost:5319` checks the production build:

- Nine years from prehistory to 2026; no submitted buildings in prehistory and monotonically
  increasing building index ranges.
- All 12 saved viewpoints render; timeline playback restarts from the end.
- No extra rendered frames during a settled 700 ms orbit interval.
- Light changes invalidate the frame; quality and label controls work.
- Gallery open/close, touch view selection, and a 390 × 844 layout.
- No page errors, shader errors, or failed same-origin assets.

To repeat with Chrome installed:

```sh
npm run build
npm run preview -- --host 127.0.0.1 --port 5319
npm run check -- http://localhost:5319
npm run benchmark -- http://localhost:5319 docs/performance/after
```

The terrain and historical reconstruction retain the accuracy limits documented in the main
README. Leaf clusters add visual detail; they do not add new historical evidence.
