# /// script
# dependencies = ["pillow"]
# ///
"""Copy the chosen Poly Haven (CC0) textures to public/textures/pbr as WebP, and crop the
Puente Nuevo photo (Wikimedia Commons, CC BY-SA 3.0, Joe Mabel) to the bridge face."""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "raw/ph"
DST = ROOT / "public/textures/pbr"
DST.mkdir(parents=True, exist_ok=True)
SETS = {
    "sandstone": ("old_sandstone_02", 1024),
    "blocks": ("large_sandstone_blocks", 1024),
    "rubble": ("medieval_blocks_05", 1024),
    "tapial": ("plaster_stone_wall_01", 1024),
    "plaster": ("plastered_wall", 1024),
    "roof": ("ceramic_roof_01", 1024),
    "arena": ("baseball_playground", 1024),
    "cliff": ("cliff_side", 2048),
    "cobble": ("cobblestone_floor_04", 1024),
    "gravel": ("gravel_floor", 1024),
    "ashlar": ("large_sandstone_blocks_01", 1024),
    "brick": ("medieval_red_brick", 1024),
    "wood": ("medieval_wood", 1024),
    "paving": ("large_floor_tiles_02", 1024),
    "masonry": ("castle_wall_varriation", 1024),
}
for key, (name, size) in SETS.items():
    for part in ("diff", "nor", "arm"):
        im = Image.open(SRC / name / f"{part}.jpg").convert("RGB").resize((size, size), Image.LANCZOS)
        im.save(DST / f"{key}_{part}.webp", quality=85)
    print(key)

photo = Image.open(ROOT / "raw/photos/puente_tall.jpg").convert("RGB")
w, h = photo.size
face = photo.crop((0, int(h * 0.07), w, h)).resize((1024, 1536), Image.LANCZOS)
(ROOT / "public/textures/photo").mkdir(parents=True, exist_ok=True)
face.save(ROOT / "public/textures/photo/puente_nuevo.webp", quality=88)
print("photo", w, h)
