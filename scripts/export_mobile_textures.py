# /// script
# dependencies = ["pillow"]
# ///
"""Export terrain images with a 1024 px limit before mobile browsers decode them.

Run with: uv run scripts/export_mobile_textures.py
Repeat after regenerating the terrain orthophotos or urban mask.
"""
from pathlib import Path

from PIL import Image

textures = Path(__file__).resolve().parent.parent / "public/textures"
output = textures / "mobile"
output.mkdir(exist_ok=True)
for source in sorted([textures / "historic.webp", textures / "urban_mask.png", *textures.glob("ortho_*.webp")]):
    with Image.open(source) as image:
        image.thumbnail((1024, 1024), Image.Resampling.LANCZOS)
        options = {"quality": 85, "method": 6} if source.suffix == ".webp" else {}
        image.save(output / source.name, **options)
        print(f"{source.name}: {image.width} × {image.height}")
