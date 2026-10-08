# Railway station and northern approach

The requested area follows the station yard towards the north-east, around
local [650, 1050] m. It is on the Bobadilla–Algeciras line, documented by
[Adif](https://www.adif.es/w/adif-da-un-nuevo-paso-en-la-renovaci%C3%B3n-integral-de-la-l%C3%ADnea-bobadilla-algeciras).

Imagery: run `uv run scripts/fetch_northeast.py station`. This downloads the
IGN PNOA mosaic for local [0, 500, 1200, 1700] m (EPSG:25830), at 4096 square.
IGN metadata at the queried point reports July 2022, source resolution 25 cm.
Output sampling is 29.3 cm/px. The WebP is 4.84 MB, loaded within 900 m of the
sector, with no blocking of initial loading. Its four borders blend into the
existing imagery. The download and flight dates are stored separately.

Geometry: `uv run scripts/fetch_railway.py` exports 17 OpenStreetMap track ways
and two platform outlines to `public/data/railway.json`, including original
way IDs. These alignments were checked against the aerial image. Track gauge
comes from the mapped 1668 mm gauge. Rail sections, sleeper dimensions and
platform height are illustrative rather than an engineering survey. No
unverified electrification equipment or trains are added.

The model represents modern mapping and is shown from 2022 only; it does not
claim to reconstruct the historic siding layout. Existing historical imagery
continues to supply earlier views. The rails and sleepers use two instanced
meshes; platforms use a single mesh. Sleepers are hidden beyond 650 m and all
3D track detail beyond 1500 m. These objects receive but do not cast shadows.

Credits: imagery © IGN, CC BY 4.0; track and platform data © OpenStreetMap
contributors, ODbL. Credits also appear in the site's information panel.

Validation: TypeScript and production build; visual alignment check at the
station; WebGL error check; modern/historical visibility and distance checks.
