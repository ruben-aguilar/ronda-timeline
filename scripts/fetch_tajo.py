# /// script
# dependencies = ["requests", "pyproj"]
# ///
"""Mapped Guadalevín course and Camino del Albacar, clipped to the bridge surroundings."""
import json
import xml.etree.ElementTree as ET
from pathlib import Path

import requests
from pyproj import Transformer

ROOT = Path(__file__).resolve().parent.parent
URL = "https://api.openstreetmap.org/api/0.6/map?bbox=-5.174,36.735,-5.158,36.746"
r = requests.get(URL, timeout=60)
r.raise_for_status()
root = ET.fromstring(r.content)
t = Transformer.from_crs(4326, 25830, always_xy=True)
nodes = {}
for node in root.findall("node"):
    x, n = t.transform(float(node.get("lon")), float(node.get("lat")))
    nodes[node.get("id")] = [round(x - 306617, 2), round(n - 4068323, 2)]
lines = []
for way in root.findall("way"):
    tags = {tag.get("k"): tag.get("v") for tag in way.findall("tag")}
    name = tags.get("name", "")
    if name not in ("Río Guadalevín", "Camino del Albacar") or tags.get("tunnel"):
        continue
    part = []
    def save():
        if len(part) > 1:
            lines.append({"id": way.get("id"), "name": name, "kind": "river" if "waterway" in tags else "path", "points": part.copy()})
    for node in way.findall("nd"):
        p = nodes[node.get("ref")]
        if -650 < p[0] < 550 and -650 < p[1] < 550:
            part.append(p)
        else:
            save()
            part = []
    save()
(ROOT / "public/data/tajo.json").write_text(json.dumps({"source": URL, "credit": "© OpenStreetMap contributors, ODbL", "lines": lines}, separators=(",", ":")) + "\n")
print([(line["name"], len(line["points"])) for line in lines])
