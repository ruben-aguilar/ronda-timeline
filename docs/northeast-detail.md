# Northeast entrance imagery

The marked sector is on the A-367 entrance, near Calle Santa María la Cañada,
north of the Ciudad Deportiva. Road names were checked against OpenStreetMap
ways 191808266 and 886284756. The municipal sports site's address is confirmed by
[Ronda's September 2024 notice](https://ayuntamientoronda.es/wp-content/uploads/2024/06/20240923_Otros_NOTA-INFORMATIVA-DESARROLLO-PRUEBAS-FISICAS-POLICIA-LOCAL-SEPTIEMBRE-2024-1.pdf).

`scripts/fetch_northeast.py` downloads the IGN PNOA maximum-current mosaic for
local east/north bounds 800..2000 m, in EPSG:25830. Four 2048 px tiles form one
4096 px WebP, about 5.1 MB. Output sampling is 29.3 cm/px. IGN's queryable
`OI.MosaicElement` layer reports **July 2022**, with **25 cm** source resolution
at the queried point. The download date is not the flight date. Metadata is in
`public/data/northeast-imagery.json`. The existing files named `2024` were not
redated as part of this change.

Credit: © Instituto Geográfico Nacional, CC BY 4.0.
[PNOA mosaic information](https://pnoa.ign.es/web/portal/pnoa-imagen/ortofotos-pnoa-maxima-actualidad).
Road-name credit: © OpenStreetMap contributors, ODbL.

The detail image loads on demand when the camera is within 1300 m horizontally
of this sector and the timeline passes 2020; it blends fully in at 2022.
The base image remains visible while loading and if the request fails.
It adds one texture, no terrain geometry or draw calls. Earlier historical
imagery is unaffected. Edge fade is limited to the final 60 m of the map.
The `Entrada noreste · A-367` view and the present-day gallery expose the area.
