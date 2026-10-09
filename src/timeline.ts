import { t, formatNumber } from "./i18n";
export { formatNumber } from "./i18n";

// Each chapter receives reading time instead of a share based on the number of years.
export const NOW = 2026;

export function yearAt(pos: number): number {
  const p = Math.min(Math.max(pos, 0), 1);
  for (let i = 1; i < KEYS.length; i++) {
    const [p0, y0] = KEYS[i - 1];
    const [p1, y1] = KEYS[i];
    if (p === p1) return y1;
    if (p <= p1) return y0 + ((p - p0) / (p1 - p0)) * (y1 - y0);
  }
  return NOW;
}

export function posAt(year: number): number {
  const y = Math.min(Math.max(year, KEYS[0][1]), NOW);
  for (let i = 1; i < KEYS.length; i++) {
    const [p0, y0] = KEYS[i - 1];
    const [p1, y1] = KEYS[i];
    if (y === y1) return p1;
    if (y <= y1) return p0 + ((y - y0) / (y1 - y0)) * (p1 - p0);
  }
  return 1;
}

/** Años que cubre un paso pequeño del deslizador en esta posición (para la animación de crecimiento). */
export function yearsPerStep(pos: number, step = 0.006): number {
  return Math.max(yearAt(Math.min(pos + step, 1)) - yearAt(Math.max(pos - step, 0)), 0.5) / 2;
}

export function formatYear(y: number): string {
  const r = Math.round(y);
  if (r < 0) return `${formatNumber(Math.abs(r))} ${t("a. C.")}`;
  if (r < 1000) return `${r} ${t("d. C.")}`;
  return String(r);
}

export interface Era {
  id: string;
  from: number;
  to: number;
  title: string;
  subtitle: string;
  text: string;
  detail: string;
  look: string;
  note: string;
  sources: Array<{ title: string; url: string }>;
  seconds: number;
  approximateStart?: boolean;
  /** Cuánto de lo que se ve son datos medidos: de 0 (imaginado) a 3 (medido). */
  confidence: 0 | 1 | 2 | 3;
  color: string;
}

export const ERAS: Era[] = [
  {
    "id": "prehistory",
    "from": -25000,
    "confidence": 0,
    "to": -800,
    "color": "#6b5640",
    "seconds": 9,
    "title": "Prehistoria",
    "subtitle": "Huellas antes de las calles",
    "text": "La Pileta conserva animales y signos pintados en la prehistoria. En el casco antiguo de Ronda también hay hallazgos neolíticos: la meseta no estuvo siempre vacía. No conocemos el trazado de aquellos primeros asentamientos.",
    "detail": "En La Pileta conviven pinturas paleolíticas y motivos esquemáticos posteriores. No pertenecen a una sola fecha: la cueva guarda huellas de varias etapas.",
    "look": "Abre el plano de La Pileta y compara sus galerías con la fotografía de la cueva.",
    "note": "El paisaje sin edificios es una simplificación visual, no una prueba de ausencia de población. El inicio de la escala es orientativo.",
    "sources": [
      {
        "title": "Turismo de Ronda · Historia",
        "url": "https://info.turismoderonda.es/historia/"
      },
      {
        "title": "Universidad de Salamanca · Arte de La Pileta",
        "url": "https://revistas.usal.es/uno/index.php/0514-7336/article/download/1964/2020/4808"
      }
    ]
  },
  {
    "id": "iberian",
    "from": -800,
    "confidence": 0,
    "to": -206,
    "color": "#8a6440",
    "seconds": 13,
    "title": "Antes de Roma",
    "subtitle": "Poblados sobre las alturas",
    "text": "Antes del dominio romano, Ronda y Acinipo ya tienen una larga historia de ocupación. Las mesetas ofrecen control del territorio y acceso a tierras de cultivo. La arqueología no permite dibujar aquí cada casa ni fijar una fecha única de fundación.",
    "detail": "Acinipo conserva restos anteriores a Roma, aunque el teatro que domina hoy el yacimiento es romano. Ver una ruina en una foto no significa que existiera durante toda la historia del lugar.",
    "look": "Busca el borde de la meseta: el relieve ayuda a entender dónde se asentaba la población.",
    "note": "Las casas de esta etapa son ilustrativas. Se evita atribuir a toda la población una identidad celta o una fundación exacta sin pruebas.",
    "sources": [
      {
        "title": "Turismo de Ronda · Acinipo",
        "url": "https://info.turismoderonda.es/patrimonio-cultural/yacimiento-arqueologico-de-acinipo/"
      },
      {
        "title": "IAPH · Paisaje de Acinipo",
        "url": "https://repositorio.iaph.es/handle/11532/326526"
      }
    ]
  },
  {
    "id": "roman",
    "from": -206,
    "confidence": 0,
    "to": 411,
    "color": "#9b3f2f",
    "seconds": 22,
    "title": "Hispania romana",
    "subtitle": "Dos ciudades, no una mudanza",
    "text": "Arunda, bajo la actual Ronda, y Acinipo son dos núcleos distintos. En Acinipo se conservan un teatro, termas y viviendas romanas. Su apodo «Ronda la Vieja» puede confundir: no significa que toda la ciudad se trasladara de un lugar al otro.",
    "detail": "En el teatro de Acinipo, el graderío aprovecha la pendiente de la roca. La arquitectura convierte el relieve en parte del edificio.",
    "look": "Abre la foto del teatro y observa los asientos tallados en la ladera. Acinipo queda fuera de este mapa 3D.",
    "note": "206 a. C. sirve de referencia regional para el avance de Roma; no es una fecha demostrada de fundación de Arunda.",
    "sources": [
      {
        "title": "Turismo de Ronda · Acinipo",
        "url": "https://info.turismoderonda.es/patrimonio-cultural/yacimiento-arqueologico-de-acinipo/"
      },
      {
        "title": "IAPH · Paisaje de Acinipo",
        "url": "https://repositorio.iaph.es/handle/11532/326526"
      }
    ]
  },
  {
    "id": "visigoth",
    "from": 411,
    "confidence": 0,
    "to": 711,
    "color": "#6f5e7a",
    "seconds": 12,
    "title": "Antigüedad tardía",
    "subtitle": "Una ciudad difícil de reconstruir",
    "text": "Acinipo pierde importancia durante los últimos siglos del mundo romano, mientras Arunda gana protagonismo. Los restos conservados son fragmentarios. En lugar de imaginar una ciudad conocida al detalle, esta etapa invita a mirar las pequeñas piezas que sí han sobrevivido.",
    "detail": "El ladrillo funerario de la galería procede de Acinipo y está catalogado entre los siglos IV y VI. Es una pieza antigua fotografiada en un museo, no una imagen de una calle de aquella época.",
    "look": "Abre el ladrillo y observa sus letras y motivos moldeados.",
    "note": "Los límites 411–711 organizan el relato; no indican cambios instantáneos en las casas. La iglesia rupestre de la Cabeza es posterior y aparece en la etapa siguiente.",
    "sources": [
      {
        "title": "Turismo de Ronda · Acinipo",
        "url": "https://info.turismoderonda.es/patrimonio-cultural/yacimiento-arqueologico-de-acinipo/"
      },
      {
        "title": "Turismo de Ronda · Virgen de la Cabeza",
        "url": "https://info.turismoderonda.es/natur/ruta-1-sl-a-36-ronda-ermita-de-la-virgen-de-la-cabeza/"
      }
    ]
  },
  {
    "id": "andalus",
    "from": 711,
    "confidence": 1,
    "to": 1039,
    "color": "#2f7462",
    "seconds": 20,
    "title": "Al-Ándalus",
    "subtitle": "Ronda y la cora de Takurunna",
    "text": "Durante el periodo islámico, Ronda se consolida como ciudad y capital de la cora de Takurunna, una división territorial de al-Ándalus. La vida urbana se concentra en la meseta que hoy llamamos La Ciudad. Las defensas conservadas se transformarán a lo largo de varios siglos.",
    "detail": "Frente a Ronda, la iglesia rupestre de la Virgen de la Cabeza se excavó en la roca en los siglos IX–X. Es una huella de las comunidades cristianas de época andalusí.",
    "look": "Compara las habitaciones excavadas de La Cabeza con las construcciones sobre la meseta.",
    "note": "711 marca el comienzo de la conquista de la península, no una fecha comprobada para cada edificio de Ronda.",
    "sources": [
      {
        "title": "Turismo de Ronda · Historia",
        "url": "https://info.turismoderonda.es/historia/"
      },
      {
        "title": "Turismo de Ronda · Virgen de la Cabeza",
        "url": "https://info.turismoderonda.es/natur/ruta-1-sl-a-36-ronda-ermita-de-la-virgen-de-la-cabeza/"
      }
    ]
  },
  {
    "id": "taifa",
    "from": 1039,
    "confidence": 1,
    "to": 1065,
    "color": "#2b8573",
    "seconds": 18,
    "title": "Taifa de Ronda",
    "subtitle": "Un pequeño reino del siglo XI",
    "text": "Al fragmentarse el poder de Córdoba, Ronda llega a gobernarse como una taifa: un reino independiente. Su autonomía termina con la incorporación a Sevilla en 1065. Durante unas décadas, la ciudad es una capital política, aunque su extensión exacta sigue siendo incierta.",
    "detail": "«Taifa» designa uno de los reinos surgidos de la fragmentación de al-Ándalus. Un cambio de gobernante no implica que aparezca de golpe un barrio nuevo.",
    "look": "Mira la posición de La Ciudad sobre el Tajo: ayuda a entender su valor defensivo.",
    "note": "El comienzo de esta taifa tiene dataciones distintas en la bibliografía. Hacia 1039 es una referencia convencional del recorrido, no una fundación indiscutida. La foto muestra defensas conservadas y reformadas después.",
    "sources": [
      {
        "title": "Ministerio de Cultura · Taifa de Runda",
        "url": "https://tesauros.cultura.gob.es/tesauros/toponimiahistorica/1216505.html"
      },
      {
        "title": "Turismo de Ronda · Historia",
        "url": "https://info.turismoderonda.es/historia/"
      }
    ],
    "approximateStart": true
  },
  {
    "id": "frontier",
    "from": 1065,
    "confidence": 1,
    "to": 1485,
    "color": "#3e8f6c",
    "seconds": 30,
    "title": "Fortaleza de frontera",
    "subtitle": "Agua, murallas y vida cotidiana",
    "text": "En los siglos XIII–XV, Ronda ocupa una posición estratégica entre Granada, Castilla y el norte de África. Bajo la medina, el arrabal de San Miguel reúne viviendas y talleres. Allí, junto al agua, se construyen los baños árabes de los siglos XIII–XIV.",
    "detail": "El hammam tenía salas fría, templada y caliente. Una noria suministraba agua y el calor circulaba bajo el suelo. Era un lugar de aseo y encuentro social, no una piscina como las actuales.",
    "look": "Abre la foto interior de los baños y busca los lucernarios en forma de estrella.",
    "note": "El título resume un periodo largo: la condición de frontera nazarí corresponde sobre todo a sus últimos siglos. El alminar conservado es del siglo XIV, con un cuerpo superior cristiano.",
    "sources": [
      {
        "title": "Junta de Andalucía · Baños Árabes",
        "url": "https://www.juntadeandalucia.es/aaiicc/enclaves/enclave-arqueologico-banos-arabes-ronda"
      },
      {
        "title": "Turismo de Ronda · El hammam",
        "url": "https://info.turismoderonda.es/wp-content/uploads/2024/09/BANOSARABES-SPA.pdf"
      },
      {
        "title": "Turismo de Ronda · Legado árabe",
        "url": "https://info.turismoderonda.es/patrimonio-cultural/el-legado-arabe/"
      }
    ]
  },
  {
    "id": "castile",
    "from": 1485,
    "confidence": 1,
    "to": 1700,
    "color": "#a8692a",
    "seconds": 26,
    "title": "Ronda castellana",
    "subtitle": "La ciudad cambia de manos",
    "text": "El 22 de mayo de 1485, las tropas de Fernando el Católico toman Ronda. La conquista cambia la propiedad de las casas y la organización urbana. La mezquita mayor se transforma en Santa María la Mayor; nuevas plazas y conventos alteran la antigua medina.",
    "detail": "El Puente Viejo conserva una fábrica de 1616. Antes del Puente Nuevo, llegar desde el fondo del Tajo al Mercadillo exigía salvar fuertes pendientes.",
    "look": "Compara la altura del Puente Viejo con la meseta donde crecerá el Mercadillo.",
    "note": "Las fotos muestran edificios conservados y reformados durante siglos; no reproducen exactamente su aspecto en 1485.",
    "sources": [
      {
        "title": "Archivo RMR · Asiento de las cosas de Ronda (1485)",
        "url": "https://www.rmcr.org/2020/05/14/documentos-en-el-archivo-de-la-rmr-no21-2020-asiento-de-las-cosas-de-ronda-1485/"
      },
      {
        "title": "Turismo de Ronda · Historia",
        "url": "https://info.turismoderonda.es/historia/"
      },
      {
        "title": "Universidad de Sevilla · Puente Nuevo",
        "url": "https://grupo.us.es/encrucijada/puente-nuevo-de-ronda-malaga/"
      }
    ]
  },
  {
    "id": "bridges",
    "from": 1700,
    "confidence": 2,
    "to": 1800,
    "color": "#bf8c2c",
    "seconds": 34,
    "title": "Puentes y toros",
    "subtitle": "Dos obras que cambian Ronda",
    "text": "El primer puente sobre la parte alta del Tajo se derrumba en 1741. El nuevo proyecto llega en 1751; las obras del Puente Nuevo comienzan en 1759 y terminan en 1793. Mientras tanto, la plaza de toros se inaugura el 19 de mayo de 1785.",
    "detail": "La plaza comenzó a levantarse de forma definitiva en 1779. Su archivo documenta funciones antes de terminarla y dificultades durante las obras. El edificio que vemos es el resultado de un proceso, no de un solo día.",
    "look": "Sigue cómo el puente une las dos mesetas: cambia la forma de cruzar y recorrer la ciudad.",
    "note": "1751 corresponde al proyecto y 1759 al inicio de las obras según la Universidad de Sevilla. Aldehuela concluyó un trabajo en el que intervinieron varios maestros.",
    "sources": [
      {
        "title": "Universidad de Sevilla · Puente Nuevo",
        "url": "https://grupo.us.es/encrucijada/puente-nuevo-de-ronda-malaga/"
      },
      {
        "title": "Archivo RMR · Construcción de la plaza",
        "url": "https://www.rmcr.org/2020/05/15/la-aventura-de-construir-una-plaza-de-toros/"
      }
    ]
  },
  {
    "id": "romantic",
    "from": 1800,
    "confidence": 2,
    "to": 1900,
    "color": "#a26d44",
    "seconds": 28,
    "title": "Viajeros, molinos y ferrocarril",
    "subtitle": "La ciudad entra en las fotografías",
    "text": "Los grabados y las primeras fotografías muestran una Ronda de molinos, caminos y viajeros. La Alameda data de 1806. En septiembre de 1891 entra en servicio la estación de Ronda: el ferrocarril cambia las conexiones de una ciudad rodeada de montañas.",
    "detail": "En la fotografía de Carl Curman de 1878 se ve el barrio de Los Molinos bajo el puente. Compara los edificios del valle con la ciudad en lo alto: el paisaje también era un lugar de trabajo.",
    "look": "Abre «Los Molinos, 1878» y busca los edificios que hoy faltan al pie del Tajo.",
    "note": "ADIF fecha la estación en 1891. No se confunde su apertura con la terminación de toda la línea. Las fechas de grabados y fotos se indican por separado.",
    "sources": [
      {
        "title": "ADIF · Estación de Ronda",
        "url": "https://www.adif.es/w/ronda"
      },
      {
        "title": "Turismo de Ronda · Alameda del Tajo",
        "url": "https://info.turismoderonda.es/natur/rutas-de-la-flora-urbana-de-ronda/"
      }
    ]
  },
  {
    "id": "early20",
    "from": 1900,
    "confidence": 2,
    "to": 1936,
    "color": "#6f8193",
    "seconds": 24,
    "title": "Principios del siglo XX",
    "subtitle": "Ronda y los símbolos andaluces",
    "text": "Los días 13 y 14 de enero de 1918, la Asamblea de Ronda reúne al movimiento regionalista andaluz. Allí se adoptan la bandera verde, blanca y verde y el escudo de Andalucía. El encuentro se celebra en el Círculo de Artistas, en la plaza del Socorro.",
    "detail": "El escudo representa a Hércules entre dos columnas y acompañado por dos leones. La plaza conserva un monumento con estos símbolos, frente al edificio de la Asamblea.",
    "look": "Abre la fotografía del Círculo de Artistas: es el edificio donde se celebró la Asamblea, fotografiado después.",
    "note": "Las imágenes modernas del edificio y de monumentos conmemorativos no son fotografías de la reunión de 1918.",
    "sources": [
      {
        "title": "Junta de Andalucía · Asamblea de Ronda",
        "url": "https://www.juntadeandalucia.es/presidencia/28f2021/ronda-donde-nacio-la-andalucia-autonomica/"
      }
    ]
  },
  {
    "id": "war",
    "from": 1936,
    "confidence": 3,
    "to": 1975,
    "color": "#5d6873",
    "seconds": 25,
    "title": "Guerra Civil y dictadura",
    "subtitle": "Memoria y fotografía aérea",
    "text": "La Guerra Civil rompe la vida de la ciudad. El 16 de septiembre de 1936, Ronda cae en manos de las fuerzas sublevadas; siguen la huida de familias y la represión franquista. Décadas después, las fotografías aéreas permiten comparar con detalle calles, huertas y nuevos barrios.",
    "detail": "El vuelo americano Serie B se realizó en 1956–57. Es una referencia de este proyecto, pero no el primer vuelo de España: el IGN también conserva la Serie A de 1945–46. En 1966 se protege el conjunto histórico de Ronda.",
    "look": "Compara la imagen aérea con la ciudad actual: busca los campos que después se convirtieron en calles.",
    "note": "No se utilizan escenas literarias de Hemingway como prueba de episodios concretos. La memoria de las víctimas requiere documentación histórica.",
    "sources": [
      {
        "title": "Junta de Andalucía · Memoria de San Lorenzo",
        "url": "https://www.juntadeandalucia.es/organismos/culturapatrimoniohistoricoydeporte/areas/cultura/memoria-democratica/lugares-memoria-democratica/paginas/cementerio-san-lorenzo.html"
      },
      {
        "title": "IGN · Catálogo de vuelos históricos",
        "url": "https://pnoa.ign.es/pnoa-imagen/catalogo-y-casos-de-uso"
      },
      {
        "title": "BOE · Conjunto Histórico de Ronda",
        "url": "https://www.boe.es/diario_boe/txt.php?id=BOE-A-2001-20831"
      }
    ]
  },
  {
    "id": "democracy",
    "from": 1975,
    "confidence": 3,
    "to": 2000,
    "color": "#3f7cac",
    "seconds": 20,
    "title": "Democracia y transformación",
    "subtitle": "La ciudad vista desde el aire",
    "text": "Las elecciones municipales del 3 de abril de 1979 abren una nueva etapa de gobierno local. Los vuelos aéreos de las décadas siguientes permiten seguir la transformación de Ronda: calles, viviendas y equipamientos que se extienden más allá del casco histórico.",
    "detail": "El «Vuelo Interministerial» abarca campañas entre 1973 y 1986. Ese intervalo identifica una colección de imágenes; no significa que cada fotografía se tomara en 1980.",
    "look": "Mira el entorno de la estación y compara las superficies construidas con las del vuelo de 1956–57.",
    "note": "Las fechas de las capas aéreas son rangos de campaña cuando no se ha comprobado el día de captura. La transición entre imágenes es visual, no una filmación del crecimiento.",
    "sources": [
      {
        "title": "Junta Electoral Central · Elecciones de 1979",
        "url": "https://www.juntaelectoralcentral.es/cs/jec/elecciones/Locales-abril1979?p=1379061494769"
      },
      {
        "title": "IGN · Catálogo de vuelos históricos",
        "url": "https://pnoa.ign.es/pnoa-imagen/catalogo-y-casos-de-uso"
      }
    ]
  },
  {
    "id": "today",
    "from": 2000,
    "confidence": 3,
    "to": 2026,
    "color": "#2f8fb0",
    "seconds": 22,
    "title": "Ronda hoy",
    "subtitle": "33.708 habitantes · dato de 2025",
    "text": "Ronda es una ciudad habitada, además de un paisaje monumental. El IECA registra 33.708 habitantes en el municipio en 2025. En 2019, el Tajo fue declarado Monumento Natural: su valor reúne la garganta del Guadalevín, el puente y la vida que albergan los cortados.",
    "detail": "En las paredes del Tajo habitan aves como el cernícalo primilla y la chova. La protección del paisaje incluye valores naturales y culturales.",
    "look": "Prueba una vista desde el río y otra desde la ciudad: el mismo puente cuenta dos paisajes distintos.",
    "note": "La fecha del deslizador no es la fecha de todas las imágenes. Los detalles aéreos del Tajo, la estación y el noreste son de julio de 2022. Los edificios 3D y sus fechas siguen siendo una aproximación.",
    "sources": [
      {
        "title": "IECA · Ronda, población de 2025",
        "url": "https://ws089.juntadeandalucia.es/sima/ficha.htm?mun=29084"
      },
      {
        "title": "Junta de Andalucía · Monumento Natural Tajo de Ronda",
        "url": "https://www.juntadeandalucia.es/medioambiente/portal/areas-tematicas/espacios-protegidos/legislacion-autonomica-nacional/monumentos-naturales/monumento-natural-tajo-ronda"
      }
    ]
  }
];

export const PLAY_SECONDS = ERAS.reduce((sum, era) => sum + era.seconds, 0);
let elapsed = 0;
const KEYS: Array<[number, number]> = ERAS.map(era => {
  const start: [number, number] = [elapsed / PLAY_SECONDS, era.from];
  elapsed += era.seconds;
  return start;
});
KEYS.push([1, NOW]);

export function eraRange(era: Era): string {
  return `${era.approximateStart ? t("hacia") + " " : ""}${formatYear(era.from)} – ${era.to >= NOW ? t("hoy") : formatYear(era.to)}`;
}

export function eraAt(year: number): Era {
  for (const e of ERAS) if (year < e.to) return e;
  return ERAS[ERAS.length - 1];
}

export const CONFIDENCE_LABEL = [
  "Modelo ilustrativo · trazado desconocido",
  "Reconstrucción aproximada · referencias históricas",
  "Reconstrucción aproximada · monumentos documentados",
  "Fotos aéreas y Catastro · modelo aproximado"
];

export interface TimelineEvent {
  year: number;
  title: string;
}

export const EVENTS: TimelineEvent[] = [
  {
    "year": -20000,
    "title": "Arte de La Pileta · fecha orientativa"
  },
  {
    "year": -206,
    "title": "Avance de Roma en el sur peninsular"
  },
  {
    "year": 711,
    "title": "Comienza la conquista islámica de la península"
  },
  {
    "year": 1039,
    "title": "Ronda, reino taifa · inicio aproximado"
  },
  {
    "year": 1065,
    "title": "La taifa de Ronda se incorpora a Sevilla"
  },
  {
    "year": 1485,
    "title": "Conquista castellana · 22 de mayo"
  },
  {
    "year": 1573,
    "title": "Hermandad del Santo Espíritu, origen de la Maestranza"
  },
  {
    "year": 1616,
    "title": "Fábrica actual del Puente Viejo"
  },
  {
    "year": 1741,
    "title": "Se derrumba el primer puente del Tajo"
  },
  {
    "year": 1759,
    "title": "Comienzan las obras del Puente Nuevo"
  },
  {
    "year": 1785,
    "title": "Inauguración de la plaza de toros · 19 de mayo"
  },
  {
    "year": 1793,
    "title": "Se termina el Puente Nuevo"
  },
  {
    "year": 1806,
    "title": "La Alameda del Tajo"
  },
  {
    "year": 1891,
    "title": "Abre la estación de Ronda · septiembre"
  },
  {
    "year": 1918,
    "title": "Asamblea de Ronda · 13 y 14 de enero"
  },
  {
    "year": 1936,
    "title": "Guerra Civil · ocupación de Ronda el 16 de septiembre"
  },
  {
    "year": 1956,
    "title": "Vuelo americano Serie B · 1956–57"
  },
  {
    "year": 1966,
    "title": "Protección del conjunto histórico"
  },
  {
    "year": 1979,
    "title": "Elecciones municipales · 3 de abril"
  },
  {
    "year": 2001,
    "title": "Se amplía el conjunto histórico protegido"
  },
  {
    "year": 2019,
    "title": "El Tajo, Monumento Natural"
  }
];
