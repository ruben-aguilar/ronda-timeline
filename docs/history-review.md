# History and gallery review — 9 October 2026

The history cards use short Spanish and English stories with optional extra reading.
`history-sources.json` records the research sources; each card keeps its own relevant
links inside a collapsed “Notes and sources” disclosure. `gallery-audit.json` records
Commons catalogue dates and licences. Photo dates describe the image, not the age of
the monument or the selected timeline year.

## Main corrections

- Municipal history records Neolithic finds in Ronda's old town. An empty prehistoric
  model does not establish that the plateau was uninhabited.
- Arunda and Acinipo were distinct settlements. “Ronda la Vieja” does not demonstrate
  a wholesale move of one city into the other.
- La Cabeza's rock church belongs to the ninth–tenth centuries. It no longer
  illustrates the late antique chapter. The Acinipo funerary brick is catalogued
  to the fourth–sixth centuries; its image is a modern museum photograph.
- The beginning of the taifa is disputed. The timeline uses **circa 1039**, with an
  explicit note. Incorporation into Seville in 1065 is documented by the Ministry
  of Culture's historical place-name thesaurus.
- The bathhouse belongs to the thirteenth–fourteenth centuries. The San Sebastián
  minaret belongs to the fourteenth century, with a later Christian upper section.
- Puente Nuevo: the University of Seville distinguishes the 1751 project from works
  starting in 1759 and completion in 1793. The Royal Maestranza archive documents
  permanent bullring construction from 1779 and inauguration on 19 May 1785.
- ADIF dates Ronda station's entry into service to September **1891**. The narrative,
  timeline event, label and station model completion year now agree.
- The 1918 assembly took place inside the Círculo de Artistas on 13–14 January.
- The Civil War account uses the Junta's memorial record, not Hemingway's fiction
  as evidence of a particular episode.
- IGN's American Series B covers 1956–57; it was not Spain's first aerial survey.
  The Interministerial campaign covers 1973–86. A campaign range is not an exact
  exposure date. The modern overview mosaic's capture year remains unverified.
- The population is explicitly the **municipality's 2025 figure**, 33,708 (IECA).

## Image audit

Modern photographs, period photographs, paintings, prints, archaeological objects
and aerial images are identified separately. Known dates are visible on thumbnails
and in the viewer. Approximate dates remain approximate.

Corrections include an exterior bathhouse view previously labelled as vaults; a
Casa del Rey Moro facade that does not show the water mine; Hallwyl images made
before 1895 previously presented as 1900; and later memorials previously used as
if contemporary. Nineteenth-century prints and paintings now sit in that chapter.
Carl Curman's 1878 photograph leads the nineteenth-century gallery.

A public-domain 1910 painting by Childe Hassam was added from the Hispanic Society
of America collection via Wikimedia Commons. The original and Commons-generated
thumbnail are local assets. It is clearly identified as a painting. Photo credits,
licences and catalogue links remain in each image viewer.

`scripts/gallery.py` now creates `raw/gallery-proposal.json`; it must not overwrite
the reviewed published catalogue with old bootstrap descriptions.

## Playback and exploration

Timing follows the amount of material, rather than elapsed historical years.

| Chapter | Seconds at 1× |
|---|---:|
| Prehistory | 9 |
| Before Rome | 13 |
| Roman Hispania | 22 |
| Late antiquity | 12 |
| Al-Andalus | 20 |
| Taifa | 18 |
| Frontier fortress | 30 |
| Castilian Ronda | 26 |
| Bridges and bullring | 34 |
| Travellers, mills and railway | 28 |
| Early twentieth century | 24 |
| Civil War and dictatorship | 25 |
| Democracy | 20 |
| Today | 22 |
| **Total** | **303 (5m 03s)** |

Opening more text, sources, a photograph or settings pauses playback, as does
seeking on the timeline. Camera movement, camera mode changes, presets and
history-card place links keep the current playback state. They do not pause a
playing timeline or start a paused timeline.

Place buttons retain the selected date and use existing scene coordinates. Links
for Acinipo and La Pileta are not provided because these sites are outside the 3D
map. Early chapters instead link to the local plateau as geographical context.
Two new camera presets frame Puente Viejo and Plaza del Socorro. The model remains
an approximate reconstruction; visiting a site does not establish its exact
historical appearance.

Light, detail, labels and language now live in a closed-by-default settings panel
beside the information icon. Escape and outside clicks close it. Hiding the
interface closes and hides this panel too.

## Validation

`npm run build` checks TypeScript and production bundling.
`node tools/check-history.mjs` checks exact chapter boundaries, durations,
monotonicity and inverse mapping across 10,001 positions, valid camera targets,
local gallery assets, settings and language controls, pause behaviour, mobile
panel bounds and hiding/restoring the interface. Screenshots go to `/tmp`, not to
tracked documentation assets.
