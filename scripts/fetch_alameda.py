# /// script
# dependencies = ["requests", "pyproj"]
# ///
"""Alameda del Tajo park outline and the cliff-edge walks (OpenStreetMap via Nominatim),
converted to local metres -> public/data/alameda.json."""
import json
import time
from pathlib import Path

import requests
from pyproj import Transformer

ROOT = Path(__file__).resolve().parent.parent
b = json.loads((ROOT / "raw/bbox.json").read_text())
t = Transformer.from_crs("EPSG:4326", "EPSG:25830", always_xy=True)
UA = {"User-Agent": "ronda-timeline/0.1 (personal project)"}


def local(lon: float, lat: float) -> list[float]:
    x, y = t.transform(lon, lat)
    return [round(x - b["cx"], 1), round(y - b["cy"], 1)]


def find(q: str, osm_type: str) -> dict:
    r = requests.get(
        "https://nominatim.openstreetmap.org/search",
        params={"q": q, "format": "jsonv2", "limit": 5, "polygon_geojson": 1, "viewbox": "-5.19,36.76,-5.14,36.72", "bounded": 1},
        headers=UA,
        timeout=60,
    )
    time.sleep(1.1)
    for x in r.json():
        if x["geojson"]["type"] == osm_type:
            return x["geojson"]
    raise SystemExit(f"not found: {q}")


park = find("parque Alameda del Tajo Ronda", "Polygon")["coordinates"][0]
ingleses = find("Paseo de los Ingleses, Ronda", "LineString")["coordinates"]
blas = find("Paseo Blas Infante Ronda", "LineString")["coordinates"]
out = {
    "park": [local(*p) for p in park],
    "ingleses": [local(*p) for p in ingleses],
    "blasInfante": [local(*p) for p in blas],
    "aldehuela": local(-5.165274, 36.740548),
}
(ROOT / "public/data/alameda.json").write_text(json.dumps(out))
print({k: len(v) for k, v in out.items()})
print(out["park"][:3], out["ingleses"][:3], out["blasInfante"])
