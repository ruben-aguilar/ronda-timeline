# /// script
# dependencies = ["numpy", "tifffile", "pillow"]
# ///
"""Write public/data/dem.bin (Uint16, decimetres, row 0 = north) and the era textures."""
import json
from pathlib import Path

import numpy as np
import tifffile
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
dem = tifffile.imread(ROOT / "raw/dem.tif").astype(np.float32)
out = ROOT / "public/data"
out.mkdir(parents=True, exist_ok=True)
(np.round(dem * 10).astype("<u2")).tofile(out / "dem.bin")
meta = json.loads((ROOT / "raw/bbox.json").read_text())
meta.update({"rows": int(dem.shape[0]), "cols": int(dem.shape[1]), "min": float(dem.min()), "max": float(dem.max())})
(out / "dem.json").write_text(json.dumps(meta))
tex = ROOT / "public/textures"
tex.mkdir(parents=True, exist_ok=True)
for key, size in (("1956", 2048), ("1980", 2048), ("2004", 2048), ("2024", 4096)):
    Image.open(ROOT / f"raw/ortho_{key}.jpg").convert("RGB").resize((size, size), Image.LANCZOS).save(tex / f"ortho_{key}.jpg", quality=82, optimize=True)
print(meta)
