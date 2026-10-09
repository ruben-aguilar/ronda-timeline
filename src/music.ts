/** Original, quiet plucked-string accompaniment. No recording downloads; browser gesture restrictions are respected. */
export interface Music {
  setEnabled(on: boolean): Promise<boolean>;
  setVolume(value: number): void;
  setEra(id: string): void;
}

type Score = { chords: number[][]; beat: number; sparse?: boolean };
const SCORES: Record<string, Score> = {
  landscape: { chords: [[50, 57, 62, 64], [48, 55, 60, 62], [46, 53, 58, 65], [50, 57, 62, 69]], beat: 1.15, sparse: true },
  medieval: { chords: [[50, 57, 62, 65], [51, 58, 63, 67], [48, 55, 60, 64], [50, 57, 62, 65]], beat: 1.02 },
  guitar: { chords: [[45, 52, 57, 60], [41, 48, 53, 57], [48, 55, 60, 64], [43, 50, 55, 59]], beat: .92 },
  reflective: { chords: [[50, 57, 62, 65], [46, 53, 58, 62], [43, 50, 57, 62], [50, 57, 60, 65]], beat: 1.3, sparse: true },
};
const chapterScore = (id: string) => {
  if (["prehistory", "iberian", "roman", "visigoth"].includes(id)) return SCORES.landscape;
  if (["andalus", "taifa", "frontier"].includes(id)) return SCORES.medieval;
  if (id === "war") return SCORES.reflective;
  return SCORES.guitar;
};

/** Karplus–Strong string: a short excitation circulates through a damped delay line. */
export function stringSamples(midi: number, sampleRate: number): Float32Array<ArrayBuffer> {
  const frequency = 440 * 2 ** ((midi - 69) / 12);
  const period = Math.max(2, Math.round(sampleRate / frequency - .5));
  const line = new Float32Array(period);
  let seed = midi * 7919 + 1;
  const noise = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2147483648 - 1; };
  let mean = 0;
  for (let i = 0; i < period; i++) { line[i] = noise(); mean += line[i]; }
  for (let i = 0; i < period; i++) line[i] -= mean / period;
  const data = new Float32Array(sampleRate * 3);
  let last = 0;
  for (let i = 0; i < data.length; i++) {
    const at = i % period;
    const value = line[at];
    line[at] = .996 * .5 * (value + line[(at + 1) % period]);
    // Soften the attack and remove bright pick noise.
    last += .32 * (value - last);
    const envelope = Math.min(i / (sampleRate * .006), 1, (data.length - i) / (sampleRate * .15));
    data[i] = last * envelope;
  }
  return data;
}

export function createMusic(onChange: (enabled: boolean) => void): Music {
  let context: AudioContext | undefined;
  let master: GainNode;
  let dry: GainNode;
  let reverb: ConvolverNode;
  let volume = .35;
  let enabled = false;
  let request = 0;
  let score = SCORES.landscape;
  let step = 0;
  let next = 0;
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  let interval: ReturnType<typeof setInterval> | undefined;
  const buffers = new Map<number, AudioBuffer>();
  const voices = new Set<{ source: AudioBufferSourceNode; gain: GainNode }>();

  const init = () => {
    context = new AudioContext();
    master = context.createGain();
    master.gain.value = 0;
    const lowpass = context.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.value = 3000;
    const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -18;
    compressor.ratio.value = 3;
    dry = context.createGain();
    dry.gain.value = .8;
    dry.connect(lowpass);
    reverb = context.createConvolver();
    const impulse = context.createBuffer(2, context.sampleRate * 1.6, context.sampleRate);
    for (let c = 0; c < 2; c++) {
      const samples = impulse.getChannelData(c);
      for (let i = 0; i < samples.length; i++) samples[i] = (Math.random() * 2 - 1) * (1 - i / samples.length) ** 3;
    }
    reverb.buffer = impulse;
    const wet = context.createGain();
    wet.gain.value = .16;
    reverb.connect(wet).connect(lowpass);
    lowpass.connect(compressor).connect(master).connect(context.destination);
    context.addEventListener("statechange", () => {
      if (context?.state === "closed") { enabled = false; stopScheduler(); onChange(false); }
    });
  };
  const rampVolume = (target: number, duration = .35) => {
    if (!context) return;
    master.gain.cancelAndHoldAtTime(context.currentTime);
    master.gain.linearRampToValueAtTime(target, context.currentTime + duration);
  };
  const stopScheduler = () => { clearInterval(interval); interval = undefined; };
  const fadeVoices = () => {
    if (!context) return;
    for (const voice of voices) {
      voice.gain.gain.cancelAndHoldAtTime(context.currentTime);
      voice.gain.gain.linearRampToValueAtTime(0, context.currentTime + .7);
      voice.source.stop(context.currentTime + .75);
    }
  };
  const pluck = (note: number, time: number, level: number) => {
    if (!context) return;
    let buffer = buffers.get(note);
    if (!buffer) {
      buffer = context.createBuffer(1, context.sampleRate * 3, context.sampleRate);
      buffer.copyToChannel(stringSamples(note, context.sampleRate), 0);
      buffers.set(note, buffer);
    }
    const source = context.createBufferSource();
    source.buffer = buffer;
    const gain = context.createGain();
    gain.gain.value = level;
    const pan = context.createStereoPanner();
    pan.pan.value = note < 55 ? -.12 : .12;
    source.connect(gain).connect(pan);
    pan.connect(dry);
    pan.connect(reverb);
    const voice = { source, gain };
    voices.add(voice);
    source.onended = () => { voices.delete(voice); source.disconnect(); gain.disconnect(); pan.disconnect(); };
    source.start(time);
  };
  const schedule = () => {
    if (!context || !enabled || context.state !== "running" || document.hidden) return;
    const pattern = [0, 2, 1, 3, 2, 1, 3, 2];
    while (next < context.currentTime + .2) {
      const chord = score.chords[Math.floor(step / 8) % score.chords.length];
      if (!score.sparse || step % 2 === 0) pluck(chord[pattern[step % 8]], next, step % 8 === 0 ? .65 : .42);
      // A small upper answer every other phrase, with no drums or abrupt accents.
      if (!score.sparse && step % 16 === 14) pluck(chord[3] + 12, next + .06, .17);
      next += score.beat / 2;
      step++;
    }
  };
  const startScheduler = () => {
    if (!context) return;
    stopScheduler();
    next = context.currentTime + .08;
    interval = setInterval(schedule, 100);
    schedule();
  };
  const music: Music = {
    async setEnabled(on) {
      enabled = on;
      const currentRequest = ++request;
      onChange(on);
      clearTimeout(idleTimer);
      if (!on) {
        stopScheduler();
        rampVolume(0);
        fadeVoices();
        idleTimer = setTimeout(() => { if (!enabled) void context?.suspend(); }, 450);
        onChange(false);
        return false;
      }
      try {
        if (!context) init();
        await context!.resume();
        if (!enabled || request !== currentRequest) return enabled;
        if (context!.state !== "running") throw new Error("Audio is not available");
        rampVolume(volume, .8);
        startScheduler();
        onChange(true);
        return true;
      } catch {
        if (request !== currentRequest) return enabled;
        enabled = false;
        stopScheduler();
        onChange(false);
        return false;
      }
    },
    setVolume(value) { volume = Math.max(0, Math.min(1, value)); if (enabled) rampVolume(volume); },
    setEra(id) {
      const nextScore = chapterScore(id);
      if (nextScore === score) return;
      score = nextScore;
      step = 0;
      fadeVoices();
      if (context) next = context.currentTime + .8;
    },
  };
  // Autoplay may stay suspended until a trusted user gesture. Retry from that gesture.
  const unlock = () => {
    if (!enabled || !context || context.state === "running" || document.hidden) return;
    void context.resume().then(() => {
      if (!enabled || document.hidden) return;
      rampVolume(volume, .8);
      if (!interval) startScheduler();
    }).catch(() => { /* The music button can retry if the browser still blocks audio. */ });
  };
  document.addEventListener("pointerdown", unlock, { passive: true });
  document.addEventListener("keydown", unlock);
  document.addEventListener("visibilitychange", async () => {
    if (!context || !enabled) return;
    if (document.hidden) {
      stopScheduler();
      await context.suspend();
    } else {
      await music.setEnabled(true);
    }
  });
  window.addEventListener("pagehide", () => { stopScheduler(); void context?.suspend(); });
  return music;
}
