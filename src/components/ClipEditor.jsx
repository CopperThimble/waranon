import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { decodeBlob, detectSpeech, encodeOgg, newEdit, peaks, play, renderClip, startRecording, stopPlayback } from "../lib/audio";
import { filterLabel } from "../lib/voices";
import { Button, Modal } from "./ui";

const fmt = (s) => `${s.toFixed(2)}s`;
const MAX_SECONDS = 12;

/**
 * Record or upload a voice line, trim it, add effects and preview it through the in-game radio.
 * props: start ("record" | "upload" | { sourceBlob, edit, name }), prompt, filter, title, onSave, onClose.
 * onSave({ sourceBlob, edit, oggBlob, duration, name }) receives the encoded .ogg ready for export.
 */
export default function ClipEditor({ start, prompt, filter, title, onSave, onClose }) {
  const [sourceBlob, setSourceBlob] = useState(typeof start === "object" ? start.sourceBlob : null);
  const [name, setName] = useState(typeof start === "object" ? start.name : "");
  const [buffer, setBuffer] = useState(null);
  const [edit, setEdit] = useState(typeof start === "object" ? start.edit : null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);
  const fileInput = useRef(null);

  useEffect(() => {
    if (!sourceBlob) return undefined;
    let alive = true;
    decodeBlob(sourceBlob).then(
      (b) => {
        if (!alive) return;
        setBuffer(b);
        setEdit((e) => e || { ...newEdit(b.duration), ...detectSpeech(b) });
      },
      () => alive && setError("This file couldn't be decoded as audio. Try WAV, MP3, OGG or M4A."),
    );
    return () => {
      alive = false;
    };
  }, [sourceBlob]);

  useEffect(() => () => stopPlayback(), []);

  useEffect(() => {
    if (start === "upload") fileInput.current?.click();
  }, [start]);

  const set = (patch) => setEdit((e) => ({ ...e, ...patch }));

  async function preview(radio) {
    if (!buffer || !edit) return;
    const rendered = await renderClip(buffer, edit);
    play(rendered, radio ? filter : null);
  }

  async function save() {
    setBusy("Encoding…");
    try {
      const rendered = await renderClip(buffer, edit);
      const oggBlob = await encodeOgg(rendered);
      onSave({ sourceBlob, edit, oggBlob, duration: rendered.duration, name: name.trim() || prompt || "Voice line" });
    } catch (err) {
      setError(`Couldn't encode the clip: ${err.message}`);
      setBusy(null);
    }
  }

  return (
    <Modal
      title={title}
      size="lg"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save} disabled={!buffer || !!busy}>
            {busy || "Save clip"}
          </Button>
        </>
      }
    >
      <div className="clip-editor">
        {prompt && (
          <div className="teleprompter">
            <span className="muted small">Say something like</span>
            <strong>“{prompt}”</strong>
          </div>
        )}
        {error && <p className="err-text">{error}</p>}
        {!sourceBlob && (
          <Recorder
            onDone={(blob) => {
              setSourceBlob(blob);
              setEdit(null);
            }}
            onUpload={() => fileInput.current?.click()}
          />
        )}
        <input
          ref={fileInput}
          type="file"
          accept="audio/*,.ogg,.wav,.mp3,.m4a,.webm"
          hidden
          onChange={(e) => {
            const f = e.target.files[0];
            e.target.value = "";
            if (f) {
              setError(null);
              setSourceBlob(f);
              setEdit(null);
              setName((n) => n || f.name.replace(/\.[^.]+$/, ""));
            }
          }}
        />
        {buffer && edit && (
          <>
            <Waveform buffer={buffer} edit={edit} onChange={set} />
            <div className="clip-times muted small">
              <span>
                Keep {fmt(edit.start)} → {fmt(edit.end)} ({fmt((edit.end - edit.start) / (edit.rate || 1))})
              </span>
              <span>Drag the handles to trim. Source {fmt(buffer.duration)}.</span>
            </div>
            <div className="row gap-sm clip-play">
              <Button size="sm" onClick={() => preview(false)}>
                ▶ Play
              </Button>
              <Button size="sm" variant="primary" onClick={() => preview(true)} title="Approximation of the game's radio filter; the game applies it to the exported clip">
                ▶ Play as in game ({filterLabel(filter)})
              </Button>
              <Button size="sm" onClick={stopPlayback}>
                ■ Stop
              </Button>
              <Button size="sm" onClick={() => set(detectSpeech(buffer))} title="Trim silence at both ends">
                Cut silence
              </Button>
              <Button size="sm" onClick={() => set({ start: 0, end: buffer.duration })}>
                Reset trim
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  setSourceBlob(null);
                  setBuffer(null);
                  setEdit(null);
                }}
              >
                Record again
              </Button>
            </div>

            <div className="clip-controls">
              <label>
                <span>Volume {edit.gainDb > 0 ? "+" : ""}{edit.gainDb} dB</span>
                <input type="range" min={-12} max={12} step={1} value={edit.gainDb} onChange={(e) => set({ gainDb: Number(e.target.value) })} />
              </label>
              <label>
                <span>Speed / pitch ×{edit.rate.toFixed(2)}</span>
                <input type="range" min={0.8} max={1.25} step={0.01} value={edit.rate} onChange={(e) => set({ rate: Number(e.target.value) })} />
              </label>
              <label>
                <span>Fade in {Math.round(edit.fadeIn * 1000)} ms</span>
                <input type="range" min={0} max={0.3} step={0.01} value={edit.fadeIn} onChange={(e) => set({ fadeIn: Number(e.target.value) })} />
              </label>
              <label>
                <span>Fade out {Math.round(edit.fadeOut * 1000)} ms</span>
                <input type="range" min={0} max={0.5} step={0.01} value={edit.fadeOut} onChange={(e) => set({ fadeOut: Number(e.target.value) })} />
              </label>
              <label>
                <span>Radio static {Math.round(edit.staticAmount * 100)}%</span>
                <input type="range" min={0} max={1} step={0.05} value={edit.staticAmount} onChange={(e) => set({ staticAmount: Number(e.target.value) })} />
              </label>
              <label>
                <span>Grit / distortion {Math.round(edit.distortion * 100)}%</span>
                <input type="range" min={0} max={1} step={0.05} value={edit.distortion} onChange={(e) => set({ distortion: Number(e.target.value) })} />
              </label>
              <label className="check">
                <input type="checkbox" checked={edit.normalize} onChange={(e) => set({ normalize: e.target.checked })} />
                Normalize loudness (match other lines)
              </label>
              <label className="check">
                <input type="checkbox" checked={edit.lowCut} onChange={(e) => set({ lowCut: e.target.checked })} />
                Cut low rumble (below 90 Hz)
              </label>
              <label className="check">
                <input type="checkbox" checked={edit.muffle} onChange={(e) => set({ muffle: e.target.checked })} />
                Muffled (far away / inside a vehicle)
              </label>
            </div>
            <label className="clip-name">
              <span className="muted small">Name (for your reference)</span>
              <input className="input" value={name} placeholder={prompt || "Voice line"} onChange={(e) => setName(e.target.value)} />
            </label>
            <p className="muted small">
              Static, grit and muffling are baked into the file. The radio sound from &quot;Play as in game&quot; is only a preview: the game adds
              its own radio filter, so record clean. Saved as mono 44.1 kHz Ogg Vorbis, like the game&apos;s own lines.
              {(edit.end - edit.start) / edit.rate > 6 && " Long lines can overlap the next order; vanilla lines are mostly 1–3 seconds."}
            </p>
          </>
        )}
      </div>
    </Modal>
  );
}

function Recorder({ onDone, onUpload }) {
  const [rec, setRec] = useState(null);
  const [level, setLevel] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState(null);
  const raf = useRef(0);

  const active = useRef(null); // the live recorder, for cleanup if the dialog closes mid-recording

  const stop = useCallback(async () => {
    cancelAnimationFrame(raf.current);
    const r = active.current;
    if (!r) return;
    active.current = null;
    const blob = await r.stop();
    setRec(null);
    onDone(blob);
  }, [onDone]);

  useEffect(() => {
    if (!rec) return undefined;
    const t0 = performance.now();
    const tick = () => {
      setLevel(rec.level());
      const s = (performance.now() - t0) / 1000;
      setElapsed(s);
      if (s >= MAX_SECONDS) stop();
      else raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [rec, stop]);

  useEffect(() => () => active.current?.cancel(), []);

  async function begin() {
    setError(null);
    try {
      const r = await startRecording();
      active.current = r;
      setRec(r);
    } catch (err) {
      setError(err.name === "NotAllowedError" ? "Microphone access was blocked. Allow it in the address bar, or upload a file instead." : `Couldn't start recording: ${err.message}`);
    }
  }

  return (
    <div className="recorder">
      {rec ? (
        <>
          <div className="rec-meter" aria-label="Input level">
            <span style={{ width: `${Math.min(100, level * 140)}%` }} className={level > 0.95 ? "clip" : ""} />
          </div>
          <div className="row gap-sm">
            <Button variant="primary" onClick={stop}>
              ■ Stop ({elapsed.toFixed(1)}s)
            </Button>
            {level > 0.95 && <span className="err-text small">Too loud: move back from the mic</span>}
          </div>
        </>
      ) : (
        <div className="row gap-sm">
          <Button variant="primary" onClick={begin}>
            ● Record
          </Button>
          <Button onClick={onUpload}>Upload a file…</Button>
          <span className="muted small">Up to {MAX_SECONDS} s. Speak, then press Stop; you can trim afterwards.</span>
        </div>
      )}
      {error && <p className="err-text small">{error}</p>}
    </div>
  );
}

/** Waveform with draggable start/end handles. */
function Waveform({ buffer, edit, onChange }) {
  const canvas = useRef(null);
  const drag = useRef(null);
  const wave = useMemo(() => peaks(buffer, 800), [buffer]);

  useEffect(() => {
    const c = canvas.current;
    const ctx = c.getContext("2d");
    const { width: w, height: h } = c;
    const p = wave;
    ctx.clearRect(0, 0, w, h);
    const x = (t) => (t / buffer.duration) * w;
    const css = getComputedStyle(c);
    const color = (name) => css.getPropertyValue(name).trim();
    ctx.fillStyle = color("--panel-2");
    ctx.fillRect(x(edit.start), 0, x(edit.end) - x(edit.start), h);
    for (let i = 0; i < p.length; i++) {
      const t = (i / p.length) * buffer.duration;
      ctx.fillStyle = t >= edit.start && t <= edit.end ? color("--accent") : color("--line-2");
      const bh = Math.max(1, p[i] * h * 0.95);
      ctx.fillRect((i / p.length) * w, (h - bh) / 2, Math.max(1, w / p.length - 0.5), bh);
    }
    ctx.fillStyle = color("--warn");
    for (const t of [edit.start, edit.end]) ctx.fillRect(x(t) - 1.5, 0, 3, h);
  }, [buffer, wave, edit.start, edit.end]);

  const timeAt = (e) => {
    const r = canvas.current.getBoundingClientRect();
    return Math.min(buffer.duration, Math.max(0, ((e.clientX - r.left) / r.width) * buffer.duration));
  };
  return (
    <canvas
      ref={canvas}
      className="waveform"
      width={1600}
      height={180}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        const t = timeAt(e);
        drag.current = Math.abs(t - edit.start) < Math.abs(t - edit.end) ? "start" : "end";
        onChange(drag.current === "start" ? { start: Math.min(t, edit.end - 0.05) } : { end: Math.max(t, edit.start + 0.05) });
      }}
      onPointerMove={(e) => {
        if (!drag.current) return;
        const t = timeAt(e);
        onChange(drag.current === "start" ? { start: Math.min(t, edit.end - 0.05) } : { end: Math.max(t, edit.start + 0.05) });
      }}
      onPointerUp={() => {
        drag.current = null;
      }}
      aria-label="Waveform: drag to set where the clip starts and ends"
    />
  );
}
