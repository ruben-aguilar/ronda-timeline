# /// script
# dependencies = ["lxml"]
# ///
import collections, re
from lxml import etree
NS = {"gml": "http://www.opengis.net/gml/3.2", "bu-core2d": "http://inspire.jrc.ec.europa.eu/schemas/bu-core2d/2.0", "bu-ext2d": "http://inspire.jrc.ec.europa.eu/schemas/bu-ext2d/2.0"}
years = collections.Counter(); uses = collections.Counter(); cond = collections.Counter()
for ev, el in etree.iterparse("raw/bu/A.ES.SDGC.BU.29084.building.gml", tag="{%s}Building" % NS["bu-ext2d"]):
    e = el.find(".//bu-core2d:dateOfConstruction//bu-core2d:end", NS)
    y = int(e.text[:4]) if e is not None and e.text and e.text[:4].isdigit() else None
    years[(y // 10 * 10) if y else None] += 1
    uses[el.findtext("bu-ext2d:currentUse", namespaces=NS)] += 1
    cond[el.findtext("bu-core2d:conditionOfConstruction", namespaces=NS)] += 1
    el.clear()
print(sorted(years.items(), key=lambda k: (k[0] is None, k[0] or 0)))
print(uses); print(cond)
