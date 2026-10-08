# /// script
# dependencies = ["lxml", "numpy", "pillow", "tifffile", "pyproj"]
# ///
"""Convert Catastro INSPIRE buildings into public/data/buildings.json.

Each building part becomes one record: footprint in local metres (x east, y north, origin at
the scene center), base elevation, height and the year it appears in the timeline.
"""
import json
import math
import sys
from pathlib import Path

import numpy as np
import tifffile
from lxml import etree
from PIL import Image, ImageDraw
from pyproj import Transformer

ROOT = Path(__file__).resolve().parent.parent
NS = {
    "gml": "http://www.opengis.net/gml/3.2",
    "bu-core2d": "http://inspire.jrc.ec.europa.eu/schemas/bu-core2d/2.0",
    "bu-ext2d": "http://inspire.jrc.ec.europa.eu/schemas/bu-ext2d/2.0",
}
BBOX = json.loads((ROOT / "raw/bbox.json").read_text())
CX, CY, SIZE = BBOX["cx"], BBOX["cy"], BBOX["size"]
HALF = SIZE / 2
DEM = tifffile.imread(ROOT / "raw/dem.tif").astype(np.float32)  # row 0 = north
N = DEM.shape[0]
CELL = SIZE / N
to_utm = Transformer.from_crs("EPSG:4326", "EPSG:25830", always_xy=True)


def ll(lat: float, lon: float) -> tuple[float, float]:
    x, y = to_utm.transform(lon, lat)
    return x - CX, y - CY


def dem_at(x: float, y: float) -> float:
    # pixel centers: col = (x + HALF)/CELL - 0.5, row = (HALF - y)/CELL - 0.5
    c = min(max((x + HALF) / CELL - 0.5, 0), N - 1.001)
    r = min(max((HALF - y) / CELL - 0.5, 0), N - 1.001)
    c0, r0 = int(c), int(r)
    fc, fr = c - c0, r - r0
    a = DEM[r0, c0] * (1 - fc) + DEM[r0, c0 + 1] * fc
    b = DEM[r0 + 1, c0] * (1 - fc) + DEM[r0 + 1, c0 + 1] * fc
    return float(a * (1 - fr) + b * fr)


def rings(el) -> list[list[tuple[float, float]]]:
    out = []
    for pl in el.iterfind(".//gml:PolygonPatch", NS):
        for ring in pl.iterfind(".//gml:posList", NS):
            v = [float(t) for t in ring.text.split()]
            pts = [(round(v[i] - CX, 2), round(v[i + 1] - CY, 2)) for i in range(0, len(v), 2)]
            out.append(pts)
        break  # first patch only; Catastro parts are single polygons
    return out


def year_of(el) -> int | None:
    e = el.find(".//bu-core2d:dateOfConstruction//bu-core2d:end", NS)
    if e is None or not e.text or not e.text[:4].isdigit():
        return None
    return int(e.text[:4])


def point_in_poly(x: float, y: float, poly: list[tuple[float, float]]) -> bool:
    inside = False
    j = len(poly) - 1
    for i in range(len(poly)):
        xi, yi = poly[i]
        xj, yj = poly[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


ZONES = json.loads((ROOT / "scripts/zones.json").read_text())
for z in ZONES:
    # zones.json is drawn in local metres over raw/ortho_1956.jpg (see scripts/grid_view.py)
    z["poly_xy"] = [tuple(p) for p in z["poly"]]
    z["seed_xy"] = tuple(z["seed"])


def zone_of(x: float, y: float) -> dict | None:
    for z in ZONES:
        if point_in_poly(x, y, z["poly_xy"]):
            return z
    return None


def hash01(s: str) -> float:
    h = 2166136261
    for ch in s.encode():
        h = ((h ^ ch) * 16777619) & 0xFFFFFFFF
    return h / 0xFFFFFFFF


def estimate_year(bid: str, catastro: int | None, x: float, y: float) -> tuple[int, str]:
    """Year the building appears in the timeline.

    Catastro has no year before 1900 and stamps most old houses with the year of their last
    major reform (often 1940s-1950s). Inside the historic districts, an "old" Catastro year is
    replaced by a district-based estimate that grows outwards from the district's seed point.
    """
    cy_ = catastro or 1950
    z = zone_of(x, y)
    if z is None:
        return cy_, "-"
    # Everything inside a zone was already built in the 1956 flight, so a later Catastro year
    # is a rebuild. A small share of the medina stands for the Iberian/Roman/Visigothic town.
    h = hash01(bid + "early")
    d0 = math.hypot(x - z["seed_xy"][0], y - z["seed_xy"][1])
    if h < z.get("early_fraction", 0) and d0 < z.get("early_radius", 1e9):
        t = h / z["early_fraction"]
        return int(z["early_from"] + (z["early_to"] - z["early_from"]) * t), z["id"]
    d = math.hypot(x - z["seed_xy"][0], y - z["seed_xy"][1])
    t = min(d / z["radius"], 1.0)
    jitter = (hash01(bid) - 0.5) * z["jitter"]
    yr = z["from"] + (z["to"] - z["from"]) * t ** z.get("power", 1.0) + jitter
    return int(round(min(yr, cy_))), z["id"]


# Buildings with a known construction date: (centre in local metres, radius, year).
OVERRIDES = [
    ((-98, 158), 48, 1785),  # Real Maestranza bullring, opened 1785
]


def write_urban_mask(parts: list[dict]) -> None:
    """Footprints of every building, dilated and blurred. The terrain shader uses it to hide
    the streets and roofs that the 1956 photo shows when the timeline is in earlier eras."""
    from PIL import ImageFilter

    px = 1024
    img = Image.new("L", (px, px), 0)
    dr = ImageDraw.Draw(img)
    s = px / SIZE
    for p in parts:
        pts = [((x + HALF) * s, (HALF - y) * s) for x, y in p["rings"][0]]
        dr.polygon(pts, fill=255, outline=255, width=4)
    img = img.filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.GaussianBlur(3))
    img.save(ROOT / "public/textures/urban_mask.png")


def main() -> None:
    bld = {}
    for _, el in etree.iterparse(str(ROOT / "raw/bu/A.ES.SDGC.BU.29084.building.gml"), tag="{%s}Building" % NS["bu-ext2d"]):
        bid = el.get("{%s}id" % NS["gml"]).split(".")[-1]
        bld[bid] = {"year": year_of(el), "use": el.findtext("bu-ext2d:currentUse", namespaces=NS) or "", "cond": el.findtext("bu-core2d:conditionOfConstruction", namespaces=NS) or ""}
        el.clear()

    parts = []
    for _, el in etree.iterparse(str(ROOT / "raw/bu/A.ES.SDGC.BU.29084.buildingpart.gml"), tag="{%s}BuildingPart" % NS["bu-ext2d"]):
        pid = el.get("{%s}id" % NS["gml"]).split(".")[-1]
        bid = pid.split("_part")[0]
        fl = el.findtext("bu-ext2d:numberOfFloorsAboveGround", namespaces=NS)
        floors = int(fl) if fl and fl.isdigit() else 0
        rr = rings(el)
        el.clear()
        if floors <= 0 or not rr:
            continue
        outer = rr[0]
        xs = [p[0] for p in outer]
        ys = [p[1] for p in outer]
        if max(xs) < -HALF or min(xs) > HALF or max(ys) < -HALF or min(ys) > HALF:
            continue
        if min(xs) < -HALF + 5 or max(xs) > HALF - 5 or min(ys) < -HALF + 5 or max(ys) > HALF - 5:
            continue
        b = bld.get(bid, {"year": None, "use": "", "cond": ""})
        cxp, cyp = sum(xs) / len(xs), sum(ys) / len(ys)
        yr, zone = estimate_year(bid, b["year"], cxp, cyp)
        for (ox, oy), r, oyear in OVERRIDES:
            if math.hypot(cxp - ox, cyp - oy) < r:
                yr = oyear
        base = min(dem_at(px, py) for px, py in outer)
        parts.append({"id": pid, "b": bid, "y": yr, "cy": b["year"], "z": zone, "f": floors, "base": base, "rings": rr, "use": b["use"][:1], "c": b["cond"][:1]})

    # Compact output: integers in decimetres.
    out = {
        "origin": {"x": CX, "y": CY, "size": SIZE},
        "parts": [
            [
                p["y"],
                p["f"],
                round(p["base"] * 10),
                [[v for pt in ring[:-1] for v in (round(pt[0] * 10), round(pt[1] * 10))] for ring in p["rings"]],
                p["use"],
                p["z"],
                p["cy"] or 1950,  # Catastro year: the last rebuild; the old form shows before it
            ]
            for p in parts
        ],
    }
    dst = ROOT / "public/data"
    dst.mkdir(parents=True, exist_ok=True)
    (dst / "buildings.json").write_text(json.dumps(out, separators=(",", ":")))
    print("parts", len(parts), "bytes", (dst / "buildings.json").stat().st_size)
    write_urban_mask(parts)

    if "debug" in sys.argv:
        for photo in ("1956", "2024"):
            img = Image.open(ROOT / f"raw/ortho_{photo}.jpg").convert("RGB").resize((2000, 2000))
            dr = ImageDraw.Draw(img, "RGBA")
            s = 2000 / SIZE

            def px(pt):
                return ((pt[0] + HALF) * s, (HALF - pt[1]) * s)

            for p in parts:
                y = p["y"]
                col = (255, 0, 0, 150) if y < 1500 else (255, 140, 0, 150) if y < 1800 else (255, 255, 0, 150) if y < 1900 else (0, 255, 0, 120) if y < 1956 else (0, 120, 255, 90)
                dr.polygon([px(q) for q in p["rings"][0]], fill=col)
            for z in ZONES:
                dr.line([px(q) for q in z["poly_xy"] + [z["poly_xy"][0]]], fill=(255, 0, 255, 255), width=3)
            img.crop((500, 400, 1500, 1500)).save(ROOT / f"raw/debug_years_{photo}.png")


if __name__ == "__main__":
    main()
