import { useEffect, useRef, useState } from "react";
import { coords } from "../lib/topo";

// Field interface: a real topographic sheet behind the app (see lib/topo.js). The region's height grid
// is traced once into contour paths (marching squares at the map's own interval; every fifth is an
// index contour carrying elevation labels) and a northwest-lit relief shade. Changing page pans the
// sheet to another part of the same terrain over ~700 ms. Reduced motion: it jumps instead.

const DURATION = 700;
const OVERSCAN = 1.3; // the sheet is drawn larger than the window so there is room to pan
const MAX_ZOOM = 6;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const SEGMENTS = [[], [[3, 2]], [[2, 1]], [[3, 1]], [[0, 1]], [[0, 3], [1, 2]], [[0, 2]], [[0, 3]], [[0, 3]], [[0, 2]], [[0, 1], [2, 3]], [[0, 1]], [[3, 1]], [[2, 1]], [[3, 2]], []];

/** Contours in grid units: { minor: Path2D, index: Path2D, labels: [{ x, y, angle, text }] } */
function trace(region) {
  const { cols, rows, grid, interval } = region;
  const minor = new Path2D();
  const index = new Path2D();
  const labels = [];
  const first = Math.ceil(region.min / interval) * interval;
  for (let level = first; level <= region.max; level += interval) {
    const isIndex = (level / interval) % 5 === 0;
    const path = isIndex ? index : minor;
    let n = 0;
    for (let j = 0; j < rows - 1; j++) {
      for (let i = 0; i < cols - 1; i++) {
        const a = grid[j * cols + i];
        const b = grid[j * cols + i + 1];
        const c = grid[(j + 1) * cols + i + 1];
        const d = grid[(j + 1) * cols + i];
        const k = (a > level ? 8 : 0) | (b > level ? 4 : 0) | (c > level ? 2 : 0) | (d > level ? 1 : 0);
        if (k === 0 || k === 15) continue;
        const f = (p, q) => (level - p) / (q - p || 1e-6);
        const pt = (e) => (e === 0 ? [i + f(a, b), j] : e === 1 ? [i + 1, j + f(b, c)] : e === 2 ? [i + f(d, c), j + 1] : [i, j + f(a, d)]);
        for (const [e1, e2] of SEGMENTS[k]) {
          const [x1, y1] = pt(e1);
          const [x2, y2] = pt(e2);
          path.moveTo(x1, y1);
          path.lineTo(x2, y2);
          // label candidates along index contours, spread out
          if (isIndex && n++ % 37 === 0) {
            let angle = Math.atan2(y2 - y1, x2 - x1);
            if (angle > Math.PI / 2) angle -= Math.PI;
            if (angle < -Math.PI / 2) angle += Math.PI;
            labels.push({ x: (x1 + x2) / 2, y: (y1 + y2) / 2, angle, text: String(level) });
          }
        }
      }
    }
  }
  return { minor, index, labels };
}

/** Relief shading as a cols x rows image: light on NW-facing slopes, shadow on SE, olive-tinted. */
function hillshade(region, light, dark) {
  const { cols, rows, grid } = region;
  const cell = (region.widthKm * 1000) / cols; // metres between samples
  const img = new ImageData(cols, rows);
  const sun = [-0.5, -0.5, 0.707]; // from the northwest, 45° up
  const exaggerate = 1.6;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const h = (x, y) => grid[Math.min(rows - 1, Math.max(0, y)) * cols + Math.min(cols - 1, Math.max(0, x))];
      const dx = ((h(i + 1, j) - h(i - 1, j)) / (2 * cell)) * exaggerate;
      const dy = ((h(i, j + 1) - h(i, j - 1)) / (2 * cell)) * exaggerate;
      const len = Math.hypot(dx, dy, 1);
      const shade = (-dx * sun[0] - dy * sun[1] + sun[2]) / len; // ~0.3 (shadow) .. 1 (lit)
      const t = Math.max(-1, Math.min(1, (shade - 0.72) * 3.2));
      const c = t >= 0 ? light : dark;
      const p = (j * cols + i) * 4;
      img.data[p] = c[0];
      img.data[p + 1] = c[1];
      img.data[p + 2] = c[2];
      img.data[p + 3] = Math.round(Math.abs(t) * 34);
    }
  }
  const off = document.createElement("canvas");
  off.width = cols;
  off.height = rows;
  off.getContext("2d").putImageData(img, 0, 0);
  return off;
}

const rgb = (css) => {
  const m = /#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(css.trim());
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [160, 160, 110];
};

/** Deterministic pan target for a page: a point in [0,1]² of the slack around the window. */
function panFor(key) {
  let h = 2166136261;
  for (const ch of String(key)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return [((h & 0xffff) / 0xffff) * 0.8 + 0.1, ((h >>> 16) / 0xffff) * 0.8 + 0.1];
}

/** Height (m) at fractional grid coords, bilinear. */
function heightAt(region, gx, gy) {
  const { cols, rows, grid } = region;
  const x = clamp(gx, 0, cols - 1.001);
  const y = clamp(gy, 0, rows - 1.001);
  const i = Math.floor(x);
  const j = Math.floor(y);
  const fx = x - i;
  const fy = y - j;
  const g = (a, b) => grid[b * cols + a];
  return g(i, j) * (1 - fx) * (1 - fy) + g(i + 1, j) * fx * (1 - fy) + g(i, j + 1) * (1 - fx) * fy + g(i + 1, j + 1) * fx * fy;
}

/** Lat/lon at fractional grid coords (sheet centre +- half its size). */
function latLonAt(region, gx, gy) {
  const lat = region.lat + (0.5 - gy / (region.rows - 1)) * (region.heightKm / 110.57);
  const lon = region.lon + (gx / (region.cols - 1) - 0.5) * (region.widthKm / (111.32 * Math.cos((region.lat * Math.PI) / 180)));
  return { lat, lon };
}

/**
 * explore: the interface is hidden and the sheet becomes a map you can drag, zoom (wheel, +/-) and
 * move with the arrow keys, with the real elevation under the pointer. onExit / onNext / onPrev
 * are wired to the explore controls.
 */
export default function TopoBackdrop({ region, shift, strength = 1, explore = false, onExit, onNext, onPrev }) {
  const canvas = useRef(null);
  const sheet = useRef(null); // traced region
  const view = useRef({ pan: [0.5, 0.5], from: [0.5, 0.5], to: [0.5, 0.5], start: 0, raf: 0, zoom: 1, geo: null });
  const paint = useRef(() => {});
  const [probe, setProbe] = useState(null); // { x, y, h, lat, lon } under the pointer while exploring

  // trace a newly loaded region and set up the painter
  useEffect(() => {
    if (!region) return undefined;
    const css = getComputedStyle(document.documentElement);
    const v = (name, fallback) => css.getPropertyValue(name).trim() || fallback;
    const ink = { minor: v("--topo-minor", "#7f8455"), index: v("--topo-index", "#a6a476"), label: v("--topo-label", "#9c9a70"), paper: v("--bg", "#1a1c13") };
    sheet.current = { ...trace(region), shade: hillshade(region, rgb(v("--topo-light", "#d8d3a8")), rgb(v("--topo-dark", "#05060a"))) };
    const c = canvas.current;
    const ctx = c.getContext("2d");

    paint.current = () => {
      const { cols, rows } = region;
      const w = window.innerWidth;
      const h = window.innerHeight;
      const scale = Math.max(w / cols, h / rows) * OVERSCAN * view.current.zoom; // px per grid cell
      const [px, py] = view.current.pan;
      const ox = -(cols * scale - w) * px;
      const oy = -(rows * scale - h) * py;
      view.current.geo = { scale, ox, oy, w, h, cols, rows };
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      // relief
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(sheet.current.shade, ox, oy, cols * scale, rows * scale);
      // contours (paths are in grid units; keep hairlines at 1px)
      ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * ox, dpr * oy);
      ctx.lineJoin = "round";
      ctx.strokeStyle = ink.minor;
      ctx.globalAlpha = 0.22;
      ctx.lineWidth = 0.8 / scale;
      ctx.stroke(sheet.current.minor);
      ctx.strokeStyle = ink.index;
      ctx.globalAlpha = 0.34;
      ctx.lineWidth = 1.3 / scale;
      ctx.stroke(sheet.current.index);
      // elevation labels, spaced out, with the line broken under them like a printed map
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.font = '600 10px "Cascadia Code", Consolas, monospace';
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const placed = [];
      for (const l of sheet.current.labels) {
        const x = ox + l.x * scale;
        const y = oy + l.y * scale;
        if (x < 30 || y < 20 || x > w - 30 || y > h - 20) continue;
        if (placed.some(([px2, py2]) => Math.abs(px2 - x) < 170 && Math.abs(py2 - y) < 90)) continue;
        placed.push([x, y]);
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(l.angle);
        const tw = ctx.measureText(l.text).width + 6;
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "destination-out";
        ctx.fillRect(-tw / 2, -6, tw, 12);
        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = ink.label;
        ctx.fillText(l.text, 0, 0.5);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    };

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      c.width = Math.round(window.innerWidth * dpr);
      c.height = Math.round(window.innerHeight * dpr);
      paint.current();
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [region]);

  // a new page: pan to its part of the sheet
  useEffect(() => {
    const s = view.current;
    const target = panFor(shift);
    cancelAnimationFrame(s.raf);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      s.pan = target;
      paint.current();
      return undefined;
    }
    s.from = [...s.pan];
    s.to = target;
    s.start = performance.now();
    const tick = (now) => {
      const p = Math.min(1, (now - s.start) / DURATION);
      const e = 1 - Math.pow(1 - p, 4); // decelerate into place
      s.pan = [s.from[0] + (s.to[0] - s.from[0]) * e, s.from[1] + (s.to[1] - s.from[1]) * e];
      paint.current();
      if (p < 1) s.raf = requestAnimationFrame(tick);
    };
    s.raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(s.raf);
  }, [shift]);

  // explore: drag / wheel / keys move the sheet; leaving resets the zoom
  useEffect(() => {
    const c = canvas.current;
    const s = view.current;
    if (!explore) {
      if (s.zoom !== 1) {
        s.zoom = 1;
        paint.current();
      }
      return undefined;
    }
    let frame = 0;
    const repaint = () => {
      if (!frame) frame = requestAnimationFrame(() => ((frame = 0), paint.current()));
    };
    // move the sheet so its top-left lands at (ox, oy) in px, within its bounds
    const placeAt = (ox, oy, scale) => {
      const g = s.geo;
      const sw = g.cols * scale - g.w;
      const sh = g.rows * scale - g.h;
      s.pan = [sw > 0 ? clamp(-ox / sw, 0, 1) : 0.5, sh > 0 ? clamp(-oy / sh, 0, 1) : 0.5];
    };
    const zoomAt = (mx, my, factor) => {
      const g = s.geo;
      if (!g) return;
      const z = clamp(s.zoom * factor, 1, MAX_ZOOM);
      const scale = (g.scale / s.zoom) * z;
      const gx = (mx - g.ox) / g.scale;
      const gy = (my - g.oy) / g.scale;
      s.zoom = z;
      placeAt(mx - gx * scale, my - gy * scale, scale);
      repaint();
    };
    let drag = null;
    const down = (e) => {
      c.setPointerCapture(e.pointerId);
      drag = { x: e.clientX, y: e.clientY, ox: s.geo.ox, oy: s.geo.oy };
      c.classList.add("dragging");
    };
    const move = (e) => {
      const g = s.geo;
      if (drag && g) {
        placeAt(drag.ox + e.clientX - drag.x, drag.oy + e.clientY - drag.y, g.scale);
        repaint();
      }
      if (g && region) {
        const gx = (e.clientX - g.ox) / g.scale;
        const gy = (e.clientY - g.oy) / g.scale;
        if (gx >= 0 && gy >= 0 && gx <= g.cols - 1 && gy <= g.rows - 1) {
          setProbe({ x: e.clientX, y: e.clientY, h: Math.round(heightAt(region, gx, gy)), ...latLonAt(region, gx, gy) });
        } else setProbe(null);
      }
    };
    const up = () => {
      drag = null;
      c.classList.remove("dragging");
    };
    const wheel = (e) => {
      e.preventDefault();
      zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0015));
    };
    const key = (e) => {
      const g = s.geo;
      if (!g) return;
      const step = e.shiftKey ? 240 : 80;
      const moves = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
      if (e.key === "Escape") onExit?.();
      else if (moves[e.key]) {
        e.preventDefault();
        placeAt(g.ox + moves[e.key][0], g.oy + moves[e.key][1], g.scale);
        repaint();
      } else if (e.key === "+" || e.key === "=") zoomAt(g.w / 2, g.h / 2, 1.25);
      else if (e.key === "-" || e.key === "_") zoomAt(g.w / 2, g.h / 2, 0.8);
    };
    c.addEventListener("pointerdown", down);
    c.addEventListener("pointermove", move);
    c.addEventListener("pointerup", up);
    c.addEventListener("pointercancel", up);
    c.addEventListener("pointerleave", () => setProbe(null));
    c.addEventListener("wheel", wheel, { passive: false });
    window.addEventListener("keydown", key);
    return () => {
      cancelAnimationFrame(frame);
      c.removeEventListener("pointerdown", down);
      c.removeEventListener("pointermove", move);
      c.removeEventListener("pointerup", up);
      c.removeEventListener("pointercancel", up);
      c.removeEventListener("wheel", wheel);
      window.removeEventListener("keydown", key);
      setProbe(null);
    };
  }, [explore, region, onExit]);

  return (
    <>
      <canvas ref={canvas} className={`topo-backdrop ${explore ? "exploring" : ""}`} style={{ opacity: explore ? 1 : strength }} aria-hidden={!explore} />
      {explore && region && (
        <div className="explore-ui">
          <div className="explore-title">
            <strong>{region.name}</strong>
            <span>
              {region.place} · {coords(region)} · contours every {region.interval} m
            </span>
          </div>
          <div className="explore-actions">
            <button type="button" className="btn btn-sm" onClick={onPrev} aria-label="Previous map">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="m14.5 6-6 6 6 6" />
              </svg>
            </button>
            <button type="button" className="btn btn-sm" onClick={onNext} aria-label="Next map">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="m9.5 6 6 6-6 6" />
              </svg>
            </button>
            <button type="button" className="btn btn-sm btn-primary" onClick={onExit}>
              Back to Waranon
            </button>
          </div>
          <div className="explore-hint">Drag to move · scroll or +/− to zoom · arrow keys · Esc to return</div>
          {probe && (
            <div className="explore-probe" style={{ left: probe.x + 16, top: probe.y + 16 }}>
              <strong>{probe.h.toLocaleString()} m</strong>
              <span>{coords(probe)}</span>
            </div>
          )}
        </div>
      )}
    </>
  );
}
