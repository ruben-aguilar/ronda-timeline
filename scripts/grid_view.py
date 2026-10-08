# /// script
# dependencies = ["pillow"]
# ///
"""Render an orthophoto window with a labelled local-metre grid (for drawing zones by hand)."""
import json, sys
from pathlib import Path
from PIL import Image, ImageDraw
ROOT = Path(__file__).resolve().parent.parent
b = json.loads((ROOT / "raw/bbox.json").read_text()); S = b["size"]; H = S / 2
photo, x0, y0, x1, y1, step = sys.argv[1], *map(float, sys.argv[2:7])
img = Image.open(ROOT / f"raw/ortho_{photo}.jpg").convert("RGB")
k = img.width / S
crop = img.crop((int((x0 + H) * k), int((H - y1) * k), int((x1 + H) * k), int((H - y0) * k)))
crop = crop.resize((1000, int(1000 * (y1 - y0) / (x1 - x0))))
d = ImageDraw.Draw(crop); s = 1000 / (x1 - x0)
zones = json.loads((ROOT / "scripts/zones.json").read_text())
for z in zones:
    pts = [((x - x0) * s, (y1 - y) * s) for x, y in z["poly"]]
    d.line(pts + [pts[0]], fill=(255, 0, 255), width=3); d.text(pts[0], z["id"], fill=(255, 0, 255))
x = (x0 // step) * step
while x <= x1:
    d.line([((x - x0) * s, 0), ((x - x0) * s, crop.height)], fill=(255, 255, 0), width=1); d.text(((x - x0) * s + 2, 2), str(int(x)), fill=(255, 255, 0)); x += step
y = (y0 // step) * step
while y <= y1:
    d.line([(0, (y1 - y) * s), (1000, (y1 - y) * s)], fill=(0, 255, 255), width=1); d.text((2, (y1 - y) * s + 2), str(int(y)), fill=(0, 255, 255)); y += step
crop.save(sys.argv[7])
