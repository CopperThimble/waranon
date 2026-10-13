// Voice studio audio math: silence trimming, fade envelope and loudness normalisation.
//   npm run test:audio
import { detectSpeech, gainEnvelope, normalizePeak } from "../src/lib/audio.js";

let failed = 0;
const check = (ok, msg) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${msg}`);
  if (!ok) failed++;
};
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

// a 2 s "recording" at 1 kHz sample rate: silence, a tone from 0.5 s to 1.5 s, silence
const rate = 1000;
const samples = new Float32Array(2 * rate).map((_, i) => (i >= 500 && i < 1500 ? 0.5 * Math.sin(i / 3) : 0.001));
const fake = { sampleRate: rate, duration: 2, getChannelData: () => samples };
const speech = detectSpeech(fake, 0.02, 0.06);
check(speech.start > 0.4 && speech.start < 0.5 && speech.end > 1.5 && speech.end < 1.6, `silence trimmed to the tone (${speech.start.toFixed(2)}–${speech.end.toFixed(2)} s)`);
check(JSON.stringify(detectSpeech({ sampleRate: rate, duration: 1, getChannelData: () => new Float32Array(rate) })) === JSON.stringify({ start: 0, end: 1 }), "all-silent clip keeps its full length");

// fades: normal clip
const env = gainEnvelope(2, { gainDb: 0, fadeIn: 0.1, fadeOut: 0.2 });
check(env[0][1] === 0 && env.at(-1)[0] === 2 && env.at(-1)[1] === 0, "clip starts and ends at silence");
check(near(env[1][0], 0.1) && env[1][1] === 1 && env[1][2], "fade-in ramps to full volume at 0.1 s");
check(near(env[2][0], 1.8), "fade-out starts 0.2 s before the end");
// fades longer than a short clip are capped at half the clip each
const short = gainEnvelope(0.2, { gainDb: 6, fadeIn: 0.3, fadeOut: 0.5 });
check(short.every(([t]) => t >= 0 && t <= 0.2) && near(short[1][0], 0.1) && near(short[2][0], 0.1), "short clip: fades capped at half its length");
check(near(short[1][1], 10 ** (6 / 20)), "+6 dB volume applied (×2.0)");
check(gainEnvelope(1, { gainDb: 0, fadeIn: 0, fadeOut: 0 }).every(([, v]) => v === 1), "no fades: constant volume");

// normalisation
const loud = normalizePeak(new Float32Array([0.1, -0.25, 0.2]));
check(near(Math.max(...loud.map(Math.abs)), 0.89, 1e-5) && near(loud[0], 0.1 * (0.89 / 0.25), 1e-5), "loudest sample scaled to 0.89, others in proportion");
check(normalizePeak(new Float32Array([0, 0.00001])).every((v) => v <= 0.00001), "near-silence is not blown up");

console.log(failed ? `${failed} check(s) failed` : "all checks passed");
process.exit(failed ? 1 : 0);
