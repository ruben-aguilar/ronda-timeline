# /// script
# dependencies = ["requests", "pyproj", "numpy", "pillow", "tifffile"]
# ///
"""Download the terrain (IGN MDT05) and the orthophotos for each era (IGN PNOA historical WMS)."""
import io
import json
import sys
from pathlib import Path

import numpy as np
import requests
from pyproj import Transformer

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "raw"
RAW.mkdir(exist_ok=True)

# Scene center: Puente Nuevo. Scene is a square of SIZE metres in ETRS89 / UTM 30N.
to_utm = Transformer.from_crs("EPSG:4326", "EPSG:25830", always_xy=True)
cx, cy = to_utm.transform(-5.16595, 36.74095)
cx, cy = round(cx), round(cy)
SIZE = 4000
x0, y0, x1, y1 = cx - SIZE // 2, cy - SIZE // 2, cx + SIZE // 2, cy + SIZE // 2
(RAW / "bbox.json").write_text(json.dumps({"cx": cx, "cy": cy, "size": SIZE, "bbox": [x0, y0, x1, y1]}))
print("bbox", x0, y0, x1, y1)

if "dem" in sys.argv or len(sys.argv) == 1:
    url = (
        "https://servicios.idee.es/wcs-inspire/mdt?SERVICE=WCS&VERSION=2.0.1&REQUEST=GetCoverage"
        f"&COVERAGEID=Elevacion25830_5&SUBSET=x({x0},{x1})&SUBSET=y({y0},{y1})&FORMAT=image/tiff"
    )
    r = requests.get(url, timeout=300)
    r.raise_for_status()
    (RAW / "dem.tif").write_bytes(r.content)
    import tifffile

    a = tifffile.imread(io.BytesIO(r.content)).astype(np.float32)
    print("dem", a.shape, a.dtype, float(a.min()), float(a.max()))

LAYERS = {
    "1956": ("https://www.ign.es/wms/pnoa-historico", "AMS_1956-1957", 2048),
    "1980": ("https://www.ign.es/wms/pnoa-historico", "Interministerial_1973-1986", 2048),
    "2004": ("https://www.ign.es/wms/pnoa-historico", "PNOA2004", 4096),
    "2024": ("https://www.ign.es/wms-inspire/pnoa-ma", "OI.OrthoimageCoverage", 4096),
}
if "ortho" in sys.argv or len(sys.argv) == 1:
    for key, (base, layer, px) in LAYERS.items():
        url = (
            f"{base}?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS={layer}&STYLES=&CRS=EPSG:25830"
            f"&BBOX={x0},{y0},{x1},{y1}&WIDTH={px}&HEIGHT={px}&FORMAT=image/jpeg"
        )
        r = requests.get(url, timeout=600)
        ct = r.headers.get("content-type")
        print(key, r.status_code, ct, len(r.content))
        if ct and ct.startswith("image"):
            (RAW / f"ortho_{key}.jpg").write_bytes(r.content)
        else:
            print(r.text[:500])
