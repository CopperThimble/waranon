// Browser audio for the voice studio: decode, edit (trim / gain / fades / baked effects), radio preview,
// waveform peaks, microphone recording and Ogg Vorbis encoding (what the game's .ogg voice lines use).

export const SAMPLE_RATE = 44100; // vanilla voice lines are 44.1 kHz Ogg Vorbis

/** Default edit for a new clip. */
export const newEdit = (duration) => ({
  start: 0,
  end: duration,
  gainDb: 0,
  normalize: true,
  fadeIn: 0.01,
  fadeOut: 0.05,
  rate: 1, // playback speed (also shifts pitch)
  lowCut: true, // remove mic rumble below 90 Hz
  staticAmount: 0, // 0..1 baked radio hiss
  distortion: 0, // 0..1 baked grit
  muffle: false, // baked "far away / through a wall"
});

let sharedCtx = null;
export function audioContext() {
  sharedCtx ||= new (window.AudioContext || window.webkitAudioContext)();
  if (sharedCtx.state === "suspended") sharedCtx.resume();
  return sharedCtx;
}

/** Any browser-playable audio Blob -> AudioBuffer. */
export async function decodeBlob(blob) {
  const data = await blob.arrayBuffer();
  return audioContext().decodeAudioData(data);
}

/** Max |sample| per bin, for drawing the waveform. */
export function peaks(buffer, bins = 600) {
  const ch = buffer.getChannelData(0);
  const other = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : null;
  const step = Math.max(1, Math.floor(ch.length / bins));
  const out = new Float32Array(bins);
  for (let b = 0; b < bins; b++) {
    let m = 0;
    for (let i = b * step, end = Math.min(ch.length, i + step); i < end; i++) {
      const v = Math.abs(other ? (ch[i] + other[i]) / 2 : ch[i]);
      if (v > m) m = v;
    }
    out[b] = m;
  }
  return out;
}

/** Start/end (seconds) of the audible part: trims leading/trailing silence below `threshold`. */
export function detectSpeech(buffer, threshold = 0.02, pad = 0.06) {
  const ch = buffer.getChannelData(0);
  let a = 0;
  let b = ch.length - 1;
  while (a < ch.length && Math.abs(ch[a]) < threshold) a++;
  while (b > a && Math.abs(ch[b]) < threshold) b--;
  if (a >= b) return { start: 0, end: buffer.duration };
  return { start: Math.max(0, a / buffer.sampleRate - pad), end: Math.min(buffer.duration, b / buffer.sampleRate + pad) };
}

function distortionCurve(amount) {
  const k = amount * 60;
  const n = 1024;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
  }
  return curve;
}

function noiseBuffer(ctx, seconds) {
  const len = Math.max(1, Math.ceil(seconds * ctx.sampleRate));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

/**
 * Builds the baked-effect chain from `input` and returns its output node.
 * Used both for rendering (OfflineAudioContext) and live preview.
 */
function bakedChain(ctx, input, edit, duration) {
  let node = input;
  const connect = (n) => {
    node.connect(n);
    node = n;
    return n;
  };
  if (edit.lowCut) {
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 90;
    connect(hp);
  }
  if (edit.muffle) {
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 1800;
    connect(lp);
  }
  if (edit.distortion > 0) {
    const ws = ctx.createWaveShaper();
    ws.curve = distortionCurve(edit.distortion);
    ws.oversample = "4x";
    connect(ws);
  }
  if (edit.staticAmount > 0) {
    const mix = ctx.createGain();
    node.connect(mix);
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer(ctx, duration);
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = 2500;
    band.Q.value = 0.7;
    const ng = ctx.createGain();
    ng.gain.value = edit.staticAmount * 0.08;
    noise.connect(band).connect(ng).connect(mix);
    noise.start(0);
    node = mix;
  }
  return node;
}

/**
 * Render the edited clip: mono, 44.1 kHz, trimmed, effects baked, normalized, faded.
 * Returns an AudioBuffer.
 */
export async function renderClip(source, edit) {
  const rate = edit.rate || 1;
  const span = Math.max(0.05, edit.end - edit.start);
  const duration = span / rate;
  const ctx = new OfflineAudioContext(1, Math.ceil(duration * SAMPLE_RATE), SAMPLE_RATE);
  const src = ctx.createBufferSource();
  src.buffer = source;
  src.playbackRate.value = rate;
  const out = bakedChain(ctx, src, edit, duration);
  const gain = ctx.createGain();
  out.connect(gain).connect(ctx.destination);
  for (const [t, v, ramp] of gainEnvelope(duration, edit)) {
    if (ramp) gain.gain.linearRampToValueAtTime(v, t);
    else gain.gain.setValueAtTime(v, t);
  }
  src.start(0, edit.start, span);
  const rendered = await ctx.startRendering();
  if (edit.normalize) normalizePeak(rendered.getChannelData(0));
  return rendered;
}

/**
 * Volume over time for a clip of `duration` seconds: [time, gain, ramp?] points (ramp = slide to it).
 * Fades are capped at half the clip each, so a short clip still fades in and out fully.
 */
export function gainEnvelope(duration, edit) {
  const g = 10 ** ((edit.gainDb || 0) / 20);
  const fi = Math.min(edit.fadeIn || 0, duration / 2);
  const fo = Math.min(edit.fadeOut || 0, duration / 2);
  const points = [[0, fi > 0 ? 0 : g, false]];
  if (fi > 0) points.push([fi, g, true]);
  points.push([Math.max(fi, duration - fo), g, false]);
  if (fo > 0) points.push([duration, 0, true]);
  return points;
}

/** Scale samples in place so the loudest is about -1 dBFS (0.89). Silence is left alone. */
export function normalizePeak(data, target = 0.89) {
  let peak = 0;
  for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]));
  if (peak <= 0.0001) return data;
  const k = target / peak;
  for (let i = 0; i < data.length; i++) data[i] *= k;
  return data;
}

/** Approximation of the in-game radio filters, for previewing only (the game applies its own). */
const RADIO_PRESETS = {
  RadioOutside: { low: 300, high: 3400, mid: 1700, boost: 4, drive: 0.15, hiss: 0.012 },
  RadioVehicule: { low: 400, high: 3000, mid: 1500, boost: 6, drive: 0.25, hiss: 0.02 },
  RadioAirplane: { low: 500, high: 2800, mid: 1800, boost: 7, drive: 0.35, hiss: 0.03 },
};

let playing = null;
export function stopPlayback() {
  try {
    playing?.stop();
  } catch {
    /* already stopped */
  }
  playing = null;
}

/** Play an AudioBuffer, optionally through a radio preview. Resolves when done. */
export function play(buffer, radio = null) {
  stopPlayback();
  const ctx = audioContext();
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  let node = src;
  const p = radio && RADIO_PRESETS[radio];
  if (p) {
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = p.low;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = p.high;
    const pk = ctx.createBiquadFilter();
    pk.type = "peaking";
    pk.frequency.value = p.mid;
    pk.gain.value = p.boost;
    const ws = ctx.createWaveShaper();
    ws.curve = distortionCurve(p.drive);
    const comp = ctx.createDynamicsCompressor();
    node = src.connect(hp).connect(pk).connect(ws).connect(lp).connect(comp);
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer(ctx, buffer.duration + 0.3);
    const ng = ctx.createGain();
    ng.gain.value = p.hiss;
    noise.connect(ng).connect(ctx.destination);
    noise.start();
    src.addEventListener("ended", () => noise.stop());
  }
  node.connect(ctx.destination);
  src.start();
  playing = src;
  return new Promise((resolve) => src.addEventListener("ended", () => resolve()));
}

// ── Recording ────────────────────────────────────────────────────────────────

/**
 * Start recording from the microphone. Returns { stop(): Promise<Blob>, level(): 0..1, cancel() }.
 * Browser noise suppression stays on; auto gain is off so levels are predictable.
 */
export async function startRecording() {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: false, noiseSuppression: true, autoGainControl: false, channelCount: 1 },
  });
  const ctx = audioContext();
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  const srcNode = ctx.createMediaStreamSource(stream);
  srcNode.connect(analyser);
  const data = new Float32Array(analyser.fftSize);
  const chunks = [];
  const rec = new MediaRecorder(stream);
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  rec.start();
  const cleanup = () => {
    srcNode.disconnect();
    stream.getTracks().forEach((t) => t.stop());
  };
  return {
    level() {
      analyser.getFloatTimeDomainData(data);
      let m = 0;
      for (const v of data) m = Math.max(m, Math.abs(v));
      return m;
    },
    stop() {
      return new Promise((resolve) => {
        rec.onstop = () => {
          cleanup();
          resolve(new Blob(chunks, { type: rec.mimeType || "audio/webm" }));
        };
        rec.stop();
      });
    },
    cancel() {
      rec.onstop = cleanup;
      if (rec.state !== "inactive") rec.stop();
      else cleanup();
    },
  };
}

// ── Ogg Vorbis ───────────────────────────────────────────────────────────────

let encoderPending = null;

/** AudioBuffer -> Ogg Vorbis Blob. The encoder (WASM, ~440 KB) is loaded on first use. */
export async function encodeOgg(buffer, quality = 5) {
  encoderPending ||= Promise.all([import("wasm-media-encoders"), import("wasm-media-encoders/wasm/ogg?url")]).then(
    ([m, wasm]) => m.createEncoder("audio/ogg", wasm.default),
  );
  const encoder = await encoderPending;
  const channels = buffer.numberOfChannels > 1 ? [buffer.getChannelData(0), buffer.getChannelData(1)] : [buffer.getChannelData(0)];
  encoder.configure({ channels: channels.length, sampleRate: buffer.sampleRate, vbrQuality: quality });
  const parts = [];
  const CHUNK = 16384;
  for (let i = 0; i < channels[0].length; i += CHUNK) {
    parts.push(encoder.encode(channels.map((c) => c.subarray(i, i + CHUNK))).slice());
  }
  parts.push(encoder.finalize().slice());
  return new Blob(parts, { type: "audio/ogg" });
}
