# /// script
# dependencies = ["numpy", "pillow", "opencv-python-headless"]
# ///
"""Build the terrain textures for the web app.

- historic.webp: the 2024 photo with the town painted out (OpenCV inpainting), used as the
  landscape before the aerial photos exist.
- urban_mask.png: where the town was painted out (the shader adds field/scrub detail there).
- trees.bin: tree positions detected in the 2024 photo (dark, green, round blobs).
- WebP copies of all orthophotos.
"""
import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
TEX = ROOT / "public/textures"
DATA = ROOT / "public/data"
TEX.mkdir(parents=True, exist_ok=True)
SIZE = json.loads((ROOT / "raw/bbox.json").read_text())["size"]
HALF = SIZE / 2
PX = 4096
S = PX / SIZE

photo = cv2.cvtColor(cv2.imread(str(ROOT / "raw/ortho_2024.jpg")), cv2.COLOR_BGR2RGB)
photo = cv2.resize(photo, (PX, PX), interpolation=cv2.INTER_AREA)

# Building footprints from the processed Catastro data.
parts = json.loads((DATA / "buildings.json").read_text())["parts"]
foot = np.zeros((PX, PX), np.uint8)
for p in parts:
    flat = p[3][0]
    pts = np.array([[(flat[i] / 10 + HALF) * S, (HALF - flat[i + 1] / 10) * S] for i in range(0, len(flat), 2)], np.int32)
    cv2.fillPoly(foot, [pts], 255)

# Town mask: footprints, then close the gaps (streets, patios) between them.
town = cv2.dilate(foot, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9)))
town = cv2.morphologyEx(town, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (31, 31)))

# Fill the town with real countryside: overlapping blocks copied (and randomly flipped) from
# rural "donor" blocks, blended with a tent window so there are no hard seams. Donors are away
# from the town, nearly free of grey asphalt and not dense forest.
grown = cv2.dilate(town, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15)))
far = cv2.dilate(town, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (121, 121)))
hsv0 = cv2.cvtColor(photo, cv2.COLOR_RGB2HSV)
asphalt = ((hsv0[..., 1] < 28) & (hsv0[..., 2] > 120)).astype(np.uint8)
lum0 = photo.mean(axis=2)
B, STEP = 256, 160
donors = []
for by in range(0, PX - B + 1, 64):
    for bx in range(0, PX - B + 1, 64):
        if far[by:by + B, bx:bx + B].any():
            continue
        if asphalt[by:by + B, bx:bx + B].mean() > 0.03:
            continue
        if lum0[by:by + B, bx:bx + B].mean() < 115:
            continue
        donors.append((bx, by))
print("donor blocks", len(donors))
rng0 = np.random.default_rng(3)
tent = np.minimum(np.linspace(0.02, 1, B), np.linspace(1, 0.02, B))
win = np.outer(tent, tent)[..., None].astype(np.float32)
acc = np.zeros((PX + 2 * B, PX + 2 * B, 3), np.float32)
wsum = np.zeros((PX + 2 * B, PX + 2 * B, 1), np.float32)
for by in range(-B // 2, PX, STEP):
    for bx in range(-B // 2, PX, STEP):
        y0, x0 = max(by, 0), max(bx, 0)
        if not grown[y0:by + B, x0:bx + B].any():
            continue
        sx, sy = donors[rng0.integers(len(donors))]
        blk = photo[sy:sy + B, sx:sx + B].astype(np.float32)
        k = rng0.integers(4)
        blk = np.rot90(blk, k)
        if rng0.random() < 0.5:
            blk = blk[:, ::-1]
        oy, ox = by + B // 2, bx + B // 2  # acc is padded by B/2 on each side
        acc[oy:oy + B, ox:ox + B] += blk * win
        wsum[oy:oy + B, ox:ox + B] += win
acc = acc[B // 2:B // 2 + PX, B // 2:B // 2 + PX]
wsum = wsum[B // 2:B // 2 + PX, B // 2:B // 2 + PX]
filled = np.where(wsum > 0.05, acc / np.maximum(wsum, 1e-6), photo).astype(np.uint8)
feather = cv2.GaussianBlur(grown, (0, 0), 8).astype(np.float32)[..., None] / 255
hist = (photo * (1 - feather) + filled * feather).astype(np.uint8)
# A little less saturated and a little warmer: an older, drier landscape.
hsv = cv2.cvtColor(hist, cv2.COLOR_RGB2HSV).astype(np.float32)
hsv[..., 1] *= 0.85
hist = cv2.cvtColor(hsv.astype(np.uint8), cv2.COLOR_HSV2RGB)
Image.fromarray(hist).save(TEX / "historic.webp", quality=82)
Image.fromarray(cv2.resize((feather[..., 0] * 255).astype(np.uint8), (1024, 1024), interpolation=cv2.INTER_AREA)).save(TEX / "urban_mask.png")

# Trees: dark green blobs that are local minima of brightness, away from buildings.
f = photo.astype(np.float32) / 255
lum = cv2.GaussianBlur(f.mean(axis=2), (0, 0), 1.0)
r, g, b = f[..., 0], f[..., 1], f[..., 2]
local_min = lum <= cv2.erode(lum, np.ones((5, 5), np.uint8))
around = cv2.GaussianBlur(lum, (0, 0), 6)
cand = local_min & (lum < 0.36) & (lum < around - 0.04) & (g >= r * 0.92) & (b < g * 1.02)
cand &= cv2.dilate(foot, np.ones((5, 5), np.uint8)) == 0
ys, xs = np.nonzero(cand)
rng = np.random.default_rng(7)
if len(xs) > 90000:
    keep = rng.choice(len(xs), 90000, replace=False)
    xs, ys = xs[keep], ys[keep]
depth = np.clip((around[ys, xs] - lum[ys, xs]) * 12, 0, 1)
x = (xs + rng.random(len(xs))) / S - HALF
n = HALF - (ys + rng.random(len(ys))) / S
size = 0.6 + depth * 0.8 + rng.random(len(xs)) * 0.3  # crown scale factor
arr = np.stack([np.round(x * 8), np.round(n * 8), np.round(size * 100)], axis=1).astype("<i2")
arr.tofile(DATA / "trees.bin")
print("trees", len(arr))

for key, size in (("1956", 2048), ("1980", 2048), ("2004", 2048), ("2024", 4096), ("2024_center", 4096)):
    Image.open(ROOT / f"raw/ortho_{key}.jpg").convert("RGB").resize((size, size), Image.LANCZOS).save(TEX / f"ortho_{key}.webp", quality=82)
for old in TEX.glob("ortho_*.jpg"):
    old.unlink()
for pth in sorted(TEX.iterdir()):
    print(pth.name, pth.stat().st_size // 1024, "KB")
