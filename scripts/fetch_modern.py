# /// script
# dependencies = ["requests", "pyproj", "shapely"]
# ///
"""Export current mapped features; never infer construction dates from OSM edits.

Raw API responses stay in raw/. The distributable extract contains only selected
geometry and relevant tags, with OSM way IDs for review and ODbL attribution.
"""
import json
from datetime import date
from pathlib import Path
import xml.etree.ElementTree as ET
import requests
from pyproj import Transformer
from shapely.geometry import Polygon, Point
from shapely.strtree import STRtree
import struct

ROOT = Path(__file__).resolve().parent.parent
BOXES = [(-5.191,36.722,-5.165,36.742),(-5.165,36.722,-5.139,36.742),
         (-5.191,36.742,-5.165,36.762),(-5.165,36.742,-5.139,36.762)]
nodes, ways, sources = {}, {}, []
transform = Transformer.from_crs(4326,25830,always_xy=True)
for i, bbox in enumerate(BOXES):
    url = 'https://api.openstreetmap.org/api/0.6/map?bbox=' + ','.join(map(str,bbox))
    sources.append(url)
    path = ROOT / f'raw/modern-{i}.osm'
    if not path.exists():
        response = requests.get(url, timeout=90)
        response.raise_for_status()
        path.write_bytes(response.content)
    root = ET.parse(path).getroot()
    for node in root.findall('node'):
        x,n = transform.transform(float(node.get('lon')),float(node.get('lat')))
        nodes[node.get('id')] = [round(x-306617,2), round(n-4068323,2)]
    for way in root.findall('way'):
        ways[way.get('id')] = way
features = []
for id, way in ways.items():
    tags = {t.get('k'):t.get('v') for t in way.findall('tag')}
    kind = {'pitch':'pitch', 'swimming_pool':'pool'}.get(tags.get('leisure'))
    if tags.get('barrier') in ('fence','city_wall'): kind = tags['barrier']
    if tags.get('amenity') == 'fountain': kind = 'fountain'
    if not kind or tags.get('covered') == 'yes' or tags.get('indoor') == 'yes' or tags.get('location') == 'roof': continue
    if kind == 'pitch' and tags.get('sport') not in ('soccer','tennis','padel','multi'): continue
    points = [nodes[n.get('ref')] for n in way.findall('nd')]
    if any(max(map(abs,p)) > 1950 for p in points): continue
    # Keep polygon surfaces only when the mapping actually closes the ring.
    if kind in ('pitch','pool','fountain'):
        if points[0] != points[-1] or len(points) < 4: continue
        poly = Polygon(points)
        if not poly.is_valid or poly.area < 3: continue
        # Existing hand-built fountains in the Alameda and Plaza del Socorro.
        cx,cn = poly.centroid.coords[0]
        if kind == 'fountain' and ((-340 < cx < 0 and 100 < cn < 420) or (abs(cx-27)<18 and abs(cn-221)<18)): continue
    feature = {'id':int(id),'kind':kind,'points':points}
    for key in ('name','sport','surface','height','width','lit'):
        if key in tags: feature[key] = tags[key]
    # The municipal announcement supersedes the old OSM grass tag (2023 works).
    if id == '474302908': feature.update(surface='artificial_turf', surfaceFrom=2023)
    features.append(feature)
features.sort(key=lambda f:f['id'])
# Grass and blue surfaces sometimes fooled the original vegetation classifier.
# Keep the original tree data intact and export a mask used only in the final period.
clear_polys = [Polygon(f['points']).buffer(0.5) for f in features if f['kind'] in ('pool','pitch','fountain')]
index = STRtree(clear_polys)
raw_trees = (ROOT/'public/data/trees.bin').read_bytes()
clear_trees = []
for i,(x,n,size) in enumerate(struct.iter_unpack('<hhh',raw_trees)):
    if len(index.query(Point(x/8,n/8),predicate='within')): clear_trees.append(i)
out = {'clearTreeIndices': clear_trees, 'retrieved' :str(date.today()),'source':sources,'credit':'© OpenStreetMap contributors, ODbL 1.0',
       'displayFrom':2022,'note':'Current mapped outlines, not a dated survey. Heights and small fittings are approximate. Roof/covered pools and pitches excluded.',
       'features':features}
(ROOT/'public/data/modern.json').write_text(json.dumps(out,separators=(',',':'),ensure_ascii=False)+'\n')
from collections import Counter
print(Counter(f['kind'] for f in features))
print((ROOT/'public/data/modern.json').stat().st_size, 'bytes')
