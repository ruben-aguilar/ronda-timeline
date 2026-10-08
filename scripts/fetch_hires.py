# /// script
# dependencies = ["requests", "pillow"]
# ///
"""Download a sharper 2024 orthophoto (about 0.5 m/px) for the central 2 x 2 km, in 2 x 2 tiles."""
import io
import json
from pathlib import Path

import requests
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
b = json.loads((ROOT / "raw/bbox.json").read_text())
cx, cy = b["cx"], b["cy"]
H = 1000
out = Image.new("RGB", (4096, 4096))
for i in range(2):
    for j in range(2):
        x0 = cx - H + i * H
        y1 = cy + H - j * H
        url = (
            "https://www.ign.es/wms-inspire/pnoa-ma?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=OI.OrthoimageCoverage"
            f"&STYLES=&CRS=EPSG:25830&BBOX={x0},{y1 - H},{x0 + H},{y1}&WIDTH=2048&HEIGHT=2048&FORMAT=image/jpeg"
        )
        r = requests.get(url, timeout=600)
        print(i, j, r.status_code, r.headers.get("content-type"), len(r.content))
        r.raise_for_status()
        out.paste(Image.open(io.BytesIO(r.content)).convert("RGB"), (i * 2048, j * 2048))
out.save(ROOT / "raw/ortho_2024_center.jpg", quality=92)
