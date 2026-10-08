# /// script
# dependencies = ["requests", "pillow"]
# ///
"""Fetch a georeferenced PNOA detail tile for Ronda's northeast entrance."""
import io
import sys
import json
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from pathlib import Path

import requests
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SERVICE = "https://www.ign.es/wms-inspire/pnoa-ma"
# Local east/north bounds: 800..2000 m. Four 600 m tiles, 0.293 m/output pixel.
CX, CY = 306617, 4068323
REGION = sys.argv[1] if len(sys.argv) > 1 else "northeast"
assert REGION in ("northeast", "station")
WEST, SOUTH = (0, 500) if REGION == "station" else (800, 800)


def fetch_tile(ij):
    i, j = ij
    x0, y1 = CX + WEST + i * 600, CY + SOUTH + 1200 - j * 600
    response = requests.get(SERVICE, params={
        "SERVICE": "WMS", "VERSION": "1.3.0", "REQUEST": "GetMap",
        "LAYERS": "OI.OrthoimageCoverage", "STYLES": "", "CRS": "EPSG:25830",
        "BBOX": f"{x0},{y1 - 600},{x0 + 600},{y1}",
        "WIDTH": 2048, "HEIGHT": 2048, "FORMAT": "image/jpeg",
    }, timeout=90)
    response.raise_for_status()
    tile = Image.open(io.BytesIO(response.content)).convert("RGB")
    assert tile.size == (2048, 2048)
    return i, j, tile


out = Image.new("RGB", (4096, 4096))
with ThreadPoolExecutor(max_workers=4) as pool:
    for i, j, tile in pool.map(fetch_tile, [(0, 0), (1, 0), (0, 1), (1, 1)]):
        out.paste(tile, (i * 2048, j * 2048))
destination = ROOT / f"public/textures/ortho_{REGION}.webp"
out.save(destination, quality=90, method=6)
info = requests.get(SERVICE, params={
    "SERVICE": "WMS", "VERSION": "1.3.0", "REQUEST": "GetFeatureInfo",
    "LAYERS": "OI.MosaicElement", "QUERY_LAYERS": "OI.MosaicElement",
    "STYLES": "", "CRS": "EPSG:25830",
    "BBOX": f"{CX + WEST},{CY + SOUTH},{CX + WEST + 1200},{CY + SOUTH + 1200}",
    "WIDTH": 4096, "HEIGHT": 4096, "I": 3000, "J": 1000,
    "INFO_FORMAT": "application/json",
}, timeout=30)
info.raise_for_status()
properties = info.json()["features"][0]["properties"]
(ROOT / f"public/data/{REGION}-imagery.json").write_text(json.dumps({
    "source": SERVICE, "layer": "OI.OrthoimageCoverage", "crs": "EPSG:25830",
    "bbox": [CX + WEST, CY + SOUTH, CX + WEST + 1200, CY + SOUTH + 1200],
    "size": [4096, 4096], "metresPerOutputPixel": 1200 / 4096,
    "retrieved": str(date.today()), "credit": "© Instituto Geográfico Nacional, CC BY 4.0",
    "flightMonth": properties["Fecha"], "sourceResolutionMetres": float(properties["Resolucion"]),
    "note": "PNOA máxima actualidad. Retrieval date is not the flight date.",
}, indent=2) + "\n")
out.thumbnail((480, 480))
out.save(ROOT / f"public/gallery/{REGION}_t.webp", quality=85)
print(f"Saved {destination.name}: {destination.stat().st_size:,} bytes")
