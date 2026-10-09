# /// script
# dependencies = ["requests", "pillow"]
# ///
"""Fetch a georeferenced PNOA detail tile for a named Ronda region."""
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
# Each region covers 1200 m. Output: 4096 px (four requests) or 2048 px (one).
CX, CY = 306617, 4068323
REGION = sys.argv[1] if len(sys.argv) > 1 else "northeast"
assert REGION in ("northeast", "station", "tajo", "west", "south")
OUTPUT_SIZE = int(sys.argv[2]) if len(sys.argv) > 2 else 4096
assert OUTPUT_SIZE in (2048, 4096)
TILE_SIZE = 2048
STEP = 600 if OUTPUT_SIZE == 4096 else 1200
WEST, SOUTH = {"northeast": (800, 800), "station": (0, 500), "tajo": (-650, -650), "west": (-850, 500), "south": (-650, -1750)}[REGION]


def fetch_tile(ij):
    i, j = ij
    x0, y1 = CX + WEST + i * STEP, CY + SOUTH + 1200 - j * STEP
    response = requests.get(SERVICE, params={
        "SERVICE": "WMS", "VERSION": "1.3.0", "REQUEST": "GetMap",
        "LAYERS": "OI.OrthoimageCoverage", "STYLES": "", "CRS": "EPSG:25830",
        "BBOX": f"{x0},{y1 - STEP},{x0 + STEP},{y1}",
        "WIDTH": TILE_SIZE, "HEIGHT": TILE_SIZE, "FORMAT": "image/jpeg", "TRANSPARENT": "FALSE",
    }, timeout=90)
    response.raise_for_status()
    tile = Image.open(io.BytesIO(response.content)).convert("RGB")
    assert tile.size == (TILE_SIZE, TILE_SIZE)
    return i, j, tile


out = Image.new("RGB", (OUTPUT_SIZE, OUTPUT_SIZE))
with ThreadPoolExecutor(max_workers=4) as pool:
    for i, j, tile in pool.map(fetch_tile, [(0, 0), (1, 0), (0, 1), (1, 1)] if OUTPUT_SIZE == 4096 else [(0, 0)]):
        out.paste(tile, (i * TILE_SIZE, j * TILE_SIZE))
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
    "size": [OUTPUT_SIZE, OUTPUT_SIZE], "metresPerOutputPixel": 1200 / OUTPUT_SIZE,
    "retrieved": str(date.today()), "credit": "© Instituto Geográfico Nacional, CC BY 4.0",
    "flightMonth": properties["Fecha"], "sourceResolutionMetres": float(properties["Resolucion"]),
    "note": "PNOA máxima actualidad. Retrieval date is not the flight date.",
}, indent=2) + "\n")
out.thumbnail((480, 480))
out.save(ROOT / f"public/gallery/{REGION}_t.webp", quality=85)
print(f"Saved {destination.name}: {destination.stat().st_size:,} bytes")
