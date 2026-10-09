# Background music

The accompaniment is original, generated with Web Audio in `src/music.ts`.
It uses damped plucked-string synthesis, a low-pass filter, a short room reverb
and a compressor. It downloads no recordings or samples.

Four slow chord patterns suit broad sections of the timeline: sparse early
landscapes, a medieval pattern, later guitar-style arpeggios, and a sparse,
reflective Civil War chapter. These are interpretive music, not reconstructions
of historically documented Ronda performances. Changes of arrangement fade
existing notes before the new pattern begins.

Music is enabled by default, as requested. Browsers that block autoplay unlock
the audio on the first pointer or keyboard interaction. The gear menu contains
a Music toggle and a volume slider (35% initially). Muting fades the output and
suspends the audio context. Hidden tabs suspend it too. Camera exploration and
timeline pauses leave the background music playing.

Audio scheduling uses a small look-ahead timer, independent of the 3D render
loop. String buffers are cached; a stopped scheduler adds no frame work.

Validation: `node tools/check-music.mjs` checks the default state, browser gesture
unlock, nonzero unclipped output, sample decay, volume, period changes, hidden-tab
suspension, mute, translation and mobile bounds. The history/UI checks also pass
with the music controls present. Production validation: `npm run build`.
