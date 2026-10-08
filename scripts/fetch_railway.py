# /// script
# dependencies = ["requests", "pyproj"]
# ///
"""Export surveyed/map-traced OSM track and platform outlines in local metres."""
import json
import xml.etree.ElementTree as ET
from pathlib import Path

import requests
from pyproj import Transformer

ROOT = Path(__file__).resolve().parent.parent
url = "https://api.openstreetmap.org/api/0.6/map?bbox=-5.164,36.746,-5.153,36.755"
response = requests.get(url, timeout=60)
response.raise_for_status()
root = ET.fromstring(response.content)
transform = Transformer.from_crs(4326, 25830, always_xy=True)
points = {}
for node in root.findall("node"):
    x, n = transform.transform(float(node.get("lon")), float(node.get("lat")))
    points[node.get("id")] = [round(x - 306617, 2), round(n - 4068323, 2)]
out = {"source": url, "credit": "© OpenStreetMap contributors, ODbL", "tracks": [], "platforms": []}
for way in root.findall("way"):
    tags = {tag.get("k"): tag.get("v") for tag in way.findall("tag")}
    if tags.get("railway") not in ("rail", "platform"):
        continue
    line = [points[node.get("ref")] for node in way.findall("nd")]
    key = "tracks" if tags["railway"] == "rail" else "platforms"
    out[key].append({"id": way.get("id"), "points": line, "gauge": int(tags.get("gauge", "1668")) / 1000})
(ROOT / "public/data/railway.json").write_text(json.dumps(out, separators=(",", ":")) + "\n")
print(f'{len(out["tracks"])} track lines, {len(out["platforms"])} platform outlines')
