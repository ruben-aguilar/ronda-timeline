# Puente Nuevo and El Tajo

The bridge now uses a dedicated model instead of a photograph stretched across
two flat facades. Reference: [Ronda tourism](https://info.turismoderonda.es/patrimonio-cultural/puente-nuevo-sobre-el-tajo/)
describes its 98 m height and local stone. The existing Joe Mabel photograph
and panoramic reference in `raw/photos` informed the openings, piers, courses,
chamber window, cornices and parapets. The road axis follows OSM way 26698947.
Dimensions and ornament placement are approximate; this is not a measured survey.
The coarse DEM blends rock into the western piers. A small, photo-guided
foundation clearance (within 32 m along the bridge and 30 m across it) lowers
only this blended ground, with smooth margins. This is a reconstruction,
not a new elevation survey. Terrain, paths, river and tree placement use the
same adjusted height data.

The model has four openings, including the lower arch, two projecting piers,
individual arch voussoirs, coping, paving and a barred chamber window.
Existing CC0 Poly Haven ashlar colour, normal and roughness maps supply the
stone detail. A low-frequency shader varies weathering and base dampness.
Lighting is calculated by the scene instead of being baked into a facade photo.
Five merged material meshes replace the prior bridge. The existing 1759–1793
construction animation and the earlier bridge remain in place.

`uv run scripts/fetch_northeast.py tajo` downloads a 1.2 km square IGN detail
tile around the gorge at 29.3 cm/output pixel. The source query reports July
2022 and 25 cm resolution. This loads on demand and blends into the existing
modern imagery; metadata and credits are retained in `tajo-imagery.json`.

`uv run scripts/fetch_tajo.py` exports the mapped Guadalevín and Camino del
Albacar. Two ground-following meshes show water and the modern path surface.
These follow the existing 5 m DEM: river width, water level and path width are
illustrative, and narrow cliffs remain limited by that DEM. The modern path
is hidden before 2022. Trees detected in aerial imagery are omitted from steep
gorge faces to avoid large trees being planted on near-vertical rock.

No animated water pass, new shadow lights or per-stone draw calls are added.
The new `Puente Nuevo desde el río` view gives a lower view of the structure.

Validation: production build, close bridge and valley views, historical bridge
visibility, shader errors and render-on-demand checks in the collaborative browser.
