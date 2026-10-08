# /// script
# dependencies = ["pillow", "requests"]
# ///
"""Download the era gallery from Wikimedia Commons (with author and licence) and crop our IGN
aerial photos. Writes public/gallery/*.webp and public/data/gallery.json."""
import io
import json
import re
import time
from html import unescape
from pathlib import Path

import requests
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public/gallery"
OUT.mkdir(parents=True, exist_ok=True)
UA = {"User-Agent": "ronda-timeline/0.1 (personal project)"}

# era id -> list of (Commons file title, title, caption). Captions describe what the image shows.
ITEMS = {
    "prehistory": [
        ("Pileta interior.jpg", "Cueva de la Pileta", "Interior de la cueva, con pinturas paleolíticas, a unos 11 km de Ronda."),
        ("Entrada pileta.jpg", "Entrada a la Pileta", "La entrada de la cueva, en la sierra de Benaoján."),
        ("Pileta plano.png", "Plano de la cueva", "Plano de las galerías de la Cueva de la Pileta."),
        ("Above cueva de la pileta.jpg", "La Serranía", "El paisaje de la Serranía de Ronda sobre la cueva."),
    ],
    "iberian": [
        ("Acinipo.jpg", "Meseta de Acinipo", "La meseta vecina de Acinipo estaba poblada desde la Edad del Bronce. El muro es del teatro romano posterior."),
        ("Acinipo plano grande.png", "Plano de Acinipo", "Plano del yacimiento de Acinipo."),
        ("Frederic Leighton (1830-1896) - Puerta de los Vientos, near Ronda, Spain - N04006 - National Gallery.jpg", "Cerca de Ronda", "Frederic Leighton pinta el paisaje de la Serranía en el siglo XIX."),
    ],
    "roman": [
        ("Teatro romano de Acinipo, Ronda.jpg", "Teatro de Acinipo", "El graderío del teatro romano, del siglo I a. C., tallado en la roca."),
        ("Teatro Acinipo (Ronda).jpg", "Escena del teatro", "El muro de la escena del teatro de Acinipo."),
        ("Acinipo Termas.JPG", "Termas de Acinipo", "Restos de las termas romanas."),
        ("Acinipo Domus 1.JPG", "Casa romana", "Restos de una domus en Acinipo."),
        ("Coin of Acinipo DGRG.png", "Moneda de Acinipo", "Moneda de la ciudad, con espigas y racimos."),
    ],
    "visigoth": [
        ("Acinipo-Brique funéraire-Musée Sefardi.jpg", "Ladrillo funerario", "Ladrillo funerario de Acinipo, de la Antigüedad tardía."),
        ("Iglesia rupestre de la Cabeza Ronda (Malaga) por parpadeo.jpg", "Virgen de la Cabeza", "Iglesia excavada en la roca frente a Ronda. Su origen es altomedieval, quizá mozárabe."),
    ],
    "andalus": [
        ("Alminar de San Sebastián (Ronda).jpg", "Alminar de San Sebastián", "Alminar de una antigua mezquita, de época nazarí."),
        ("Muralla Urbana, Ronda 02.JPG", "Murallas", "Tramo de la muralla de la medina."),
    ],
    "taifa": [
        ("Ronda-Puerta del alminar de San Sébastiàn-20110912.jpg", "Puerta del alminar", "Arco de herradura del alminar de San Sebastián."),
        ("Muralla Urbana, Ronda 04.JPG", "La medina amurallada", "Las murallas cierran la meseta por el sur."),
    ],
    "frontier": [
        ("Ronda - Baños árabes.jpg", "Baños árabes", "Los baños, junto al arroyo de las Culebras, siglos XIII y XIV."),
        ("Arab baths.jpg", "Bóvedas de los baños", "Sala con bóvedas y lucernarios en forma de estrella."),
        ("Puerta de Almocabar, Ronda.JPG", "Puerta de Almocábar", "Puerta principal de la medina, del siglo XIII."),
        ("Casa del Rey Moro (Ronda).jpg", "La Mina", "La Casa del Rey Moro, sobre la mina que bajaba al río."),
    ],
    "castile": [
        ("Church of Santa María la Mayor, Ronda.JPG", "Santa María la Mayor", "La antigua mezquita mayor, iglesia desde 1485."),
        ("Ronda - Palacio de Mondragón.jpg", "Palacio de Mondragón", "Palacio de origen medieval, reformado tras la conquista."),
        ("Patio mudéjar, Palacio de Mondragón (Ronda).jpg", "Patio mudéjar", "Patio del Palacio de Mondragón."),
        ("Ronda - Puente Viejo.jpg", "Puente Viejo", "El Puente Viejo, reconstruido en 1616."),
        ("Iglesia del Espíritu Santo, Ronda, 2023.jpg", "Espíritu Santo", "Iglesia de 1505, junto a la puerta de Almocábar."),
        ("Iglesia del Padre Jesús.jpg", "Padre Jesús", "Iglesia de Padre Jesús, en el barrio bajo."),
    ],
    "bridges": [
        ("Francisco de Goya - Portrait of the Matador Pedro Romero - Google Art Project.jpg", "Pedro Romero", "Goya retrata al torero rondeño Pedro Romero (hacia 1795–98)."),
        ("Goya - Pedro Romero matando a toro parado (Pedro Romero Killing the Halted Bull).jpg", "Tauromaquia", "Goya: Pedro Romero matando a un toro parado (grabado, hacia 1816)."),
        ("Puente Nuevo (Ronda) 01.jpg", "El Puente Nuevo", "Litografía basada en un dibujo de Tenison, siglo XIX."),
        ("Puente Nuevo (Ronda).jpg", "El Tajo y el puente", "Grabado anónimo del Tajo con el Puente Nuevo."),
        ("Plaza de Toros Ronda 1102.jpg", "Plaza de la Maestranza", "La plaza de toros, inaugurada en 1785."),
    ],
    "romantic": [
        ("Fotografi av Ronda (Málaga). El Tajo de Ronda con los molinos - Hallwylska museet - 104974.tif", "El Tajo y los molinos", "Fotografía anterior a 1895: los molinos al pie del Tajo."),
        ("Fotografi av Ronda (Málaga). Vista general por la parte del norte - Hallwylska museet - 104969.tif", "Ronda desde el norte", "Vista general de la ciudad, antes de 1895."),
        ("Ronda - KMB - 16001000211804.jpg", "Molinos del Tajo, 1878", "Los molinos harineros al pie del Tajo, en una foto de 1878."),
        ('"Pont Romain, a Ronda" (19937326305).jpg', "Puente en Ronda", "Grabado del viaje de Davillier y Doré por España (1874)."),
        ('"Les enfants toreros, scène andalouse, a Ronda" (19314684224).jpg', "Niños toreros", "Escena andaluza en Ronda, del mismo libro (1874)."),
        ("Gaucín in the Serranía de Ronda, 1838.jpg", "La Serranía en 1838", "Gaucín, en la Serranía de los bandoleros y los viajeros románticos."),
        ("Estación de Ronda.jpg", "La estación", "La estación del ferrocarril Bobadilla–Algeciras, abierto en 1892 (foto actual)."),
    ],
    "early20": [
        ("Fotografi av Ronda (Málaga). Vista del Tajo de Ronda, tomada del Puente Nuevo - Hallwylska museet - 104970.tif", "El Tajo hacia 1900", "El Tajo visto desde el Puente Nuevo, finales del siglo XIX."),
        ("Monumento a Rilke, Ronda.JPG", "Rilke", "Estatua de Rainer Maria Rilke, que vivió en Ronda en 1912–13."),
        ("Casino de Ronda.jpg", "Círculo de Artistas", "El casino de la Plaza del Socorro, junto al lugar de la Asamblea de 1918."),
    ],
    "war": [
        ("@ign:1956", "Vuelo Americano, 1956", "Foto aérea de 1956 (IGN): la primera imagen completa de la ciudad."),
        ("Ronda-Ernest-Hemingway.jpg", "Hemingway", "Monumento a Hemingway; Ronda inspiró escenas de «Por quién doblan las campanas»."),
        ("Plaza de Toros de Ronda 04.JPG", "Trajes goyescos", "Trajes de la corrida goyesca, celebrada desde 1954, en el museo de la plaza."),
    ],
    "democracy": [
        ("@ign:1980", "Vuelo Interministerial", "Foto aérea de 1973–86 (IGN): la ciudad crece al norte de la vía."),
        ("Ronda-Espana0048.JPG", "El Guadalevín", "El río bajo el Puente Viejo. El turismo se convierte en la principal industria."),
    ],
    "today": [
        ("Ronda - Puente Nuevo tall.jpg", "Puente Nuevo", "El Puente Nuevo desde el fondo del Tajo."),
        ("Panorama of Ronda.jpg", "Panorama", "Ronda sobre el Tajo, con el Puente Nuevo."),
        ("Ronda Alameda del Tajo.jpg", "Alameda del Tajo", "La entrada del parque de la Alameda, de 1806."),
        ("PlazaDeTorosDeRonda.jpg", "Plaza de toros", "La plaza de la Real Maestranza, hoy."),
        ("@ign:2024", "Ortofoto 2024", "Foto aérea de 2024 (IGN, PNOA)."),
    ],
}


def strip(html: str) -> str:
    return re.sub(r"\s+", " ", unescape(re.sub(r"<[^>]+>", "", html or ""))).strip()


def commons(title: str) -> dict:
    url = "https://commons.wikimedia.org/w/api.php"
    params = {"action": "query", "prop": "imageinfo", "iiprop": "url|extmetadata", "iiurlwidth": 1400, "format": "json", "titles": "File:" + title}
    for attempt in range(6):
        r = requests.get(url, params=params, headers=UA, timeout=60)
        if r.status_code == 429:
            time.sleep(10 * (attempt + 1))
            continue
        r.raise_for_status()
        page = next(iter(r.json()["query"]["pages"].values()))
        if "imageinfo" not in page:
            raise SystemExit(f"missing on Commons: {title}")
        return page["imageinfo"][0]
    raise SystemExit("rate limited")


def get(url: str) -> bytes:
    for attempt in range(6):
        r = requests.get(url, headers=UA, timeout=120)
        if r.status_code == 429:
            time.sleep(10 * (attempt + 1))
            continue
        r.raise_for_status()
        return r.content
    raise SystemExit("rate limited")


def save(img: Image.Image, stem: str) -> None:
    img = img.convert("RGB")
    big = img.copy()
    big.thumbnail((1400, 1400))
    big.save(OUT / f"{stem}.webp", quality=84)
    th = img.copy()
    th.thumbnail((360, 360))
    th.save(OUT / f"{stem}_t.webp", quality=80)


IGN = {"1956": "ortho_1956.jpg", "1980": "ortho_1980.jpg", "2024": "ortho_2024.jpg"}
out: dict[str, list[dict]] = {}
for era, items in ITEMS.items():
    out[era] = []
    for i, (src, title, caption) in enumerate(items):
        stem = f"{era}_{i}"
        if src.startswith("@ign:"):
            year = src[5:]
            im = Image.open(ROOT / "raw" / IGN[year])
            w, h = im.size
            im = im.crop((int(w * 0.3), int(h * 0.15), int(w * 0.72), int(h * 0.62)))
            save(im, stem)
            out[era].append({"img": f"gallery/{stem}.webp", "thumb": f"gallery/{stem}_t.webp", "title": title, "caption": caption,
                             "credit": "Instituto Geográfico Nacional", "license": "CC BY 4.0", "source": "https://pnoa.ign.es/"})
            continue
        if not (OUT / f"{stem}.webp").exists():
            ii = commons(src)
            save(Image.open(io.BytesIO(get(ii["thumburl"]))), stem)
            em = ii["extmetadata"]
            meta = {"credit": strip(em.get("Artist", {}).get("value", ""))[:120] or "Wikimedia Commons",
                    "license": strip(em.get("LicenseShortName", {}).get("value", "")), "source": ii["descriptionurl"]}
            (OUT / f"{stem}.json").write_text(json.dumps(meta, ensure_ascii=False))
            time.sleep(1.5)
        meta = json.loads((OUT / f"{stem}.json").read_text())
        if "Unknown author" in meta["credit"] or meta["credit"].startswith("Anonymous"):
            meta["credit"] = "Autor desconocido"
        out[era].append({"img": f"gallery/{stem}.webp", "thumb": f"gallery/{stem}_t.webp", "title": title, "caption": caption, **meta})
        print(era, i, meta["license"], "|", meta["credit"][:50])
(ROOT / "public/data/gallery.json").write_text(json.dumps(out, ensure_ascii=False, indent=1))
