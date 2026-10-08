# /// script
# dependencies = ["pillow"]
# ///
"""Contact sheet: tools/montage.py OUT.png img1.png img2.png ... (crops the UI away, 2 columns)."""
import sys
from PIL import Image, ImageDraw
out, files = sys.argv[1], sys.argv[2:]
W, H = 720, 380
sheet = Image.new("RGB", (W * 2, H * ((len(files) + 1) // 2)), "black")
for i, f in enumerate(files):
    im = Image.open(f).convert("RGB")
    im = im.crop((440, 240, 1340, 715)).resize((W, H))  # middle of the 1440x900 frame, without panels
    d = ImageDraw.Draw(im)
    d.rectangle((0, 0, 260, 22), fill=(0, 0, 0))
    d.text((6, 5), f.split("/")[-1], fill=(255, 255, 255))
    sheet.paste(im, ((i % 2) * W, (i // 2) * H))
sheet.save(out)
