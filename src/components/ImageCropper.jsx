import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Modal } from "./ui";

const MIN_ZOOM = 0.2;
const MAX_ZOOM = 8;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * Crop/zoom an uploaded picture into the exact size the game wants (spec.width × spec.height).
 * Drag to move, scroll or use the slider to zoom. The frame keeps the target aspect ratio and the
 * result is a PNG (anything outside the picture stays transparent).
 */
export default function ImageCropper({ source, spec, onApply, onCancel }) {
  const canvas = useRef(null);
  const [img, setImg] = useState(null);
  const [error, setError] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const W = spec.width;
  const H = spec.height;

  // decode through an <img> so SVG works too
  useEffect(() => {
    let alive = true;
    const url = URL.createObjectURL(source);
    const el = new Image();
    el.onload = () => alive && setImg(el);
    el.onerror = () => alive && setError("This file couldn't be read as an image.");
    el.src = url;
    return () => {
      alive = false;
      URL.revokeObjectURL(url);
    };
  }, [source]);

  const iw = img?.naturalWidth || img?.width || 1;
  const ih = img?.naturalHeight || img?.height || 1;
  const fitScale = Math.min(W / iw, H / ih); // whole picture visible
  const fillScale = Math.max(W / iw, H / ih); // frame fully covered
  const startScale = spec.fit === "cover" ? fillScale : fitScale;
  const scale = startScale * zoom;

  const draw = useCallback(
    (ctx) => {
      ctx.clearRect(0, 0, W, H);
      if (!img) return;
      const dw = iw * scale;
      const dh = ih * scale;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, W / 2 + offset.x - dw / 2, H / 2 + offset.y - dh / 2, dw, dh);
    },
    [img, iw, ih, scale, offset, W, H],
  );

  useEffect(() => {
    const c = canvas.current;
    if (c) draw(c.getContext("2d"));
  }, [draw]);

  // wheel zoom needs a non-passive listener to stop the page scrolling
  useEffect(() => {
    const c = canvas.current;
    if (!c) return undefined;
    const onWheel = (e) => {
      e.preventDefault();
      setZoom((z) => clamp(z * Math.exp(-e.deltaY * 0.0015), MIN_ZOOM, MAX_ZOOM));
    };
    c.addEventListener("wheel", onWheel, { passive: false });
    return () => c.removeEventListener("wheel", onWheel);
  }, [img]);

  const drag = useRef(null);
  const onPointerDown = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, start: offset, k: W / e.currentTarget.clientWidth };
  };
  const onPointerMove = (e) => {
    const d = drag.current;
    if (!d) return;
    setOffset({ x: d.start.x + (e.clientX - d.x) * d.k, y: d.start.y + (e.clientY - d.y) * d.k });
  };
  const onPointerUp = () => {
    drag.current = null;
  };
  const nudge = (e) => {
    const step = e.shiftKey ? 20 : 4;
    const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (moves[e.key]) {
      e.preventDefault();
      setOffset((o) => ({ x: o.x + moves[e.key][0], y: o.y + moves[e.key][1] }));
    } else if (e.key === "+" || e.key === "=") setZoom((z) => clamp(z * 1.1, MIN_ZOOM, MAX_ZOOM));
    else if (e.key === "-") setZoom((z) => clamp(z / 1.1, MIN_ZOOM, MAX_ZOOM));
  };

  const preset = (target) => {
    setZoom(clamp(target / startScale, MIN_ZOOM, MAX_ZOOM));
    setOffset({ x: 0, y: 0 });
  };

  async function apply() {
    setBusy(true);
    try {
      const out = document.createElement("canvas");
      out.width = W;
      out.height = H;
      draw(out.getContext("2d"));
      const blob = await new Promise((resolve, reject) =>
        out.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG encoding failed"))), "image/png"),
      );
      onApply(blob);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <Modal
      title={`Crop: ${spec.label}`}
      onClose={onCancel}
      size="lg"
      footer={
        <>
          <Button onClick={onCancel}>Cancel</Button>
          <Button variant="primary" onClick={apply} disabled={!img || busy}>
            Use this crop
          </Button>
        </>
      }
    >
      {error ? (
        <p className="error-text">{error}</p>
      ) : (
        <div className="cropper">
          <div className="cropper-stage" style={{ aspectRatio: `${W} / ${H}`, maxWidth: W >= H ? "100%" : `${Math.round((420 * W) / H)}px` }}>
            <canvas
              ref={canvas}
              width={W}
              height={H}
              className="cropper-canvas"
              tabIndex={0}
              aria-label="Crop area: drag to move, scroll to zoom, arrow keys to nudge"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              onKeyDown={nudge}
            />
          </div>
          <div className="cropper-controls">
            <label className="cropper-zoom">
              <span>Zoom</span>
              <input
                type="range"
                min={Math.log(MIN_ZOOM)}
                max={Math.log(MAX_ZOOM)}
                step={0.01}
                value={Math.log(zoom)}
                onChange={(e) => setZoom(Math.exp(Number(e.target.value)))}
              />
              <span className="muted small">{Math.round(scale * 100)}%</span>
            </label>
            <div className="row gap-sm">
              <Button size="sm" onClick={() => preset(fitScale)} title="Whole picture visible, transparent edges">
                Fit whole picture
              </Button>
              <Button size="sm" onClick={() => preset(fillScale)} title="Fill the frame, cropping the edges">
                Fill frame
              </Button>
              <Button size="sm" onClick={() => setOffset({ x: 0, y: 0 })}>
                Center
              </Button>
            </div>
          </div>
          <p className="muted small">
            Drag to move, scroll (or the slider) to zoom, arrow keys to nudge. Output: {W}×{H} PNG; the checkered area stays transparent.
            {img && ` Source: ${iw}×${ih}.`}
            {img && scale > 1.5 && " The picture is being enlarged, so it may look soft in game."}
          </p>
        </div>
      )}
    </Modal>
  );
}
