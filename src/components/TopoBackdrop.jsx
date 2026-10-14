import { useEffect, useRef, useState } from "react";
import { coords } from "../lib/topo";

// Field interface: a real topographic sheet behind the app (see lib/topo.js). The region's height grid
// is traced once into contour paths (marching squares at the map's own interval; every fifth is an
// index contour carrying elevation labels) and a northwest-lit relief shade. Changing page pans the
// sheet to another part of the same terrain over ~700 ms. Reduced motion: it jumps instead.

const DURATION = 700;
const OVERSCAN = 1.3; // the sheet is drawn larger than the window so there is room to pan
const MAX_ZOOM = 6;
const CACHE_PX = 8e6; // largest cached sheet (~32 MB); zoomed further in, moving frames draw directly
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
  // Pick the labels once, spaced out in map units, so they travel with the terrain instead of being
  // re-chosen every frame (re-choosing per frame made them pop on and off while the map moved).
  const kept = [];
  for (const l of labels) {
    if (!kept.some((k) => Math.abs(k.x - l.x) < 26 && Math.abs(k.y - l.y) < 14)) kept.push(l);
  }
  return { minor, index, labels: kept };
}

const PLACE_RANK = { city: 0, town: 1, village: 2 };
const SPREAD = [6, 3, 1.4]; // grid cells of approximate town around a place with no mapped built-up area

/**
 * OpenStreetMap layers in grid units: one Path2D per kind, plus places. A place with no built-up
 * polygon under it gets an approximate block texture around its point, so towns read as towns
 * even where nobody has mapped the streets.
 */
function traceFeatures(features) {
  const paths = {};
  if (!features) return { paths, places: [] };
  const k = 1 / (features.scale || 10);
  const boxes = [];
  for (const kind of ["water", "built", "rivers", "streams", "rail", "minor", "major"]) {
    const path = new Path2D();
    for (const line of features[kind] || []) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (let i = 0; i < line.length; i += 2) {
        const x = line[i] * k;
        const y = line[i + 1] * k;
        if (i === 0) path.moveTo(x, y);
        else path.lineTo(x, y);
        if (kind === "built") (x0 = Math.min(x0, x)), (y0 = Math.min(y0, y)), (x1 = Math.max(x1, x)), (y1 = Math.max(y1, y));
      }
      if (kind === "water" || kind === "built") path.closePath();
      if (kind === "built") boxes.push([x0, y0, x1, y1]);
    }
    paths[kind] = path;
  }
  const places = (features.places || []).map((p) => ({ ...p, rank: PLACE_RANK[p.t] ?? 2 }));
  const blocks = new Path2D();
  for (const p of places) {
    if (boxes.some(([x0, y0, x1, y1]) => p.x >= x0 - 0.5 && p.x <= x1 + 0.5 && p.y >= y0 - 0.5 && p.y <= y1 + 0.5)) continue;
    // a seeded scatter of small blocks, denser in the middle, like a town plan seen from far away
    let seed = 2166136261;
    for (const ch of p.n) seed = Math.imul(seed ^ ch.charCodeAt(0), 16777619) >>> 0;
    const rand = () => ((seed = Math.imul(seed ^ (seed >>> 15), 2246822507) >>> 0), seed / 4294967296);
    const r = SPREAD[p.rank];
    for (let n = Math.round(r * r * 5); n > 0; n--) {
      const d = r * Math.sqrt(rand()) * (0.4 + 0.6 * rand());
      const a = rand() * Math.PI * 2;
      const s = 0.25 + rand() * 0.35;
      blocks.rect(p.x + Math.cos(a) * d - s / 2, p.y + Math.sin(a) * d - s / 2, s, s * (0.7 + rand() * 0.6));
    }
  }
  paths.blocks = blocks;
  return { paths, places };
}

/** Which places get a name at this scale: biggest first, none overlapping. Depends only on the scale,
 *  so panning never changes the choice (no labels popping in and out while the map moves). */
function choosePlaces(places, scale, ctx) {
  const kept = [];
  const sparse = places.filter((p) => p.rank < 2).length < 4; // remote valleys: the villages are all there is
  for (const p of places) {
    if (p.rank === 2 && scale < 9 && !sparse) continue; // otherwise villages only when zoomed in
    ctx.font = PLACE_FONT[p.rank];
    const w = (ctx.measureText(p.rank === 0 ? p.n.toUpperCase() : p.n).width + 14) / scale;
    const h = 18 / scale;
    const box = [p.x - w / 2, p.y - h - 4 / scale, p.x + w / 2, p.y + 4 / scale];
    if (kept.some(({ box: b }) => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1])) continue;
    kept.push({ ...p, box });
  }
  return kept;
}
const PLACE_FONT = ['600 12px "Cascadia Code", Consolas, monospace', '500 11px "Cascadia Code", Consolas, monospace', '10px "Cascadia Code", Consolas, monospace'];

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
  const look = useRef({ strength, explore });
  const [probe, setProbe] = useState(null); // { x, y, h, lat, lon } under the pointer while exploring

  // trace a newly loaded region and set up the painter
  useEffect(() => {
    if (!region) return undefined;
    const css = getComputedStyle(document.documentElement);
    const v = (name, fallback) => css.getPropertyValue(name).trim() || fallback;
    const ink = {
      minor: v("--topo-minor", "#7f8455"),
      index: v("--topo-index", "#a6a476"),
      label: v("--topo-label", "#9c9a70"),
      paper: v("--bg", "#181816"),
      water: v("--topo-water", "#6f9488"),
      road: v("--topo-road", "#d2c494"),
      built: v("--topo-built", "#c4bd8c"),
      place: v("--topo-place", "#e4dfba"),
    };
    sheet.current = { ...trace(region), ...traceFeatures(region.features), shade: hillshade(region, rgb(v("--topo-light", "#d8d3a8")), rgb(v("--topo-dark", "#05060a"))) };
    const c = canvas.current;
    const ctx = c.getContext("2d");
    // built-up areas: a fine diagonal hatch, the printed-map shorthand for "town"
    const tile = document.createElement("canvas");
    tile.width = tile.height = 4;
    const t = tile.getContext("2d");
    t.strokeStyle = ink.built;
    t.lineWidth = 1;
    t.beginPath();
    t.moveTo(-1, 5);
    t.lineTo(5, -1);
    t.stroke();
    const hatch = ctx.createPattern(tile, "repeat");
    let placeCache = { scale: 0, list: [] };

    // Everything on the sheet, at offset (ox, oy) in px. g is the screen canvas, or the cached sheet
    // image (drawn once, then slid while the map moves: redrawing thousands of lines every frame
    // ran at ~5 fps on machines without graphics acceleration).
    const draw = (g, dpr, ox, oy, w, h, scale) => {
      const { cols, rows } = region;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    // relief
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = "high";
    g.drawImage(sheet.current.shade, ox, oy, cols * scale, rows * scale);
    // contours (paths are in grid units; keep hairlines at 1px)
    g.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * ox, dpr * oy);
    g.lineJoin = "round";
    g.strokeStyle = ink.minor;
    g.globalAlpha = 0.22;
    g.lineWidth = 0.8 / scale;
    g.stroke(sheet.current.minor);
    g.strokeStyle = ink.index;
    g.globalAlpha = 0.34;
    g.lineWidth = 1.3 / scale;
    g.stroke(sheet.current.index);
    // elevation labels, spaced out, with the line broken under them like a printed map
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.font = '600 10px "Cascadia Code", Consolas, monospace';
    g.textAlign = "center";
    g.textBaseline = "middle";
    for (const l of sheet.current.labels) {
      const x = ox + l.x * scale;
      const y = oy + l.y * scale;
      if (x < -40 || y < -20 || x > w + 40 || y > h + 20) continue;
      g.save();
      g.translate(x, y);
      g.rotate(l.angle);
      const tw = g.measureText(l.text).width + 6;
      g.globalAlpha = 1;
      g.globalCompositeOperation = "destination-out";
      g.fillRect(-tw / 2, -6, tw, 12);
      g.globalCompositeOperation = "source-over";
      g.globalAlpha = 0.5;
      g.fillStyle = ink.label;
      g.fillText(l.text, 0, 0.5);
      g.restore();
    }
    // the real map: water, towns, rivers, railways, roads (paths in grid units; widths in px,
    // thickening a little as you zoom in so the roads read like a closer map sheet)
    const f = sheet.current.paths;
    if (f.water) {
      const z = Math.sqrt(view.current.zoom);
      const px = (n) => (n * z) / scale;
      g.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * ox, dpr * oy);
      g.lineCap = "round";
      g.fillStyle = ink.water;
      g.globalAlpha = 0.22;
      g.fill(f.water, "evenodd");
      g.globalAlpha = 0.45;
      g.strokeStyle = ink.water;
      g.lineWidth = px(0.8);
      g.stroke(f.water);
      hatch.setTransform(new DOMMatrix([1 / scale, 0, 0, 1 / scale, 0, 0]));
      g.fillStyle = hatch;
      g.globalAlpha = 0.32;
      g.fill(f.built, "evenodd");
      g.fill(f.blocks);
      g.fillStyle = ink.built;
      g.globalAlpha = 0.07;
      g.fill(f.built, "evenodd");
      g.globalAlpha = 0.28;
      g.fill(f.blocks);
      g.strokeStyle = ink.built;
      g.globalAlpha = 0.3;
      g.lineWidth = px(0.6);
      g.stroke(f.built);
      g.strokeStyle = ink.water;
      g.globalAlpha = 0.28;
      g.lineWidth = px(0.6);
      g.stroke(f.streams);
      g.globalAlpha = 0.55;
      g.lineWidth = px(1.5);
      g.stroke(f.rivers);
      g.strokeStyle = ink.road;
      g.globalAlpha = 0.4;
      g.lineWidth = px(0.9);
      g.setLineDash([px(5), px(3)]);
      g.stroke(f.rail);
      g.setLineDash([]);
      g.globalAlpha = 0.32;
      g.lineWidth = px(0.8);
      g.stroke(f.minor);
      g.globalAlpha = 0.55;
      g.lineWidth = px(1.5);
      g.stroke(f.major);
      // place names with a paper halo, chosen once per scale
      if (placeCache.scale !== scale) placeCache = { scale, list: choosePlaces(sheet.current.places, scale, g) };
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.textAlign = "center";
      g.textBaseline = "alphabetic";
      g.lineJoin = "round";
      for (const p of placeCache.list) {
        const x = Math.round(ox + p.x * scale);
        const y = Math.round(oy + p.y * scale);
        if (x < -120 || y < -30 || x > w + 120 || y > h + 30) continue;
        const text = p.rank === 0 ? p.n.toUpperCase() : p.n;
        g.font = PLACE_FONT[p.rank];
        g.letterSpacing = p.rank === 0 ? "1.5px" : "0px";
        g.globalAlpha = 0.85;
        g.fillStyle = ink.place;
        if (p.rank === 0) g.fillRect(x - 2.5, y - 2.5, 5, 5);
        else {
          g.beginPath();
          g.arc(x, y, p.rank === 1 ? 2.2 : 1.6, 0, Math.PI * 2);
          g.fill();
        }
        g.strokeStyle = ink.paper;
        g.lineWidth = 3;
        g.globalAlpha = 0.8;
        g.strokeText(text, x, y - 7);
        g.globalAlpha = p.rank === 2 ? 0.6 : 0.8;
        g.fillText(text, x, y - 7);
      }
      g.letterSpacing = "0px";
    }
    };
    let cache = null; // { scale, canvas }: the whole sheet at 1 px per CSS px

    paint.current = (moving = false) => {
      const { cols, rows } = region;
      const w = c.clientWidth;
      const h = c.clientHeight;
      const scale = Math.max(w / cols, h / rows) * OVERSCAN * view.current.zoom; // px per grid cell
      const [px, py] = view.current.pan;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      // snap to whole device pixels: sub-pixel offsets make the hairlines shimmer while panning
      const ox = Math.round(-(cols * scale - w) * px * dpr) / dpr;
      const oy = Math.round(-(rows * scale - h) * py * dpr) / dpr;
      view.current.geo = { scale, ox, oy, w, h, cols, rows };
      if (moving && cols * scale * rows * scale <= CACHE_PX) {
        if (cache?.scale !== scale) {
          const off = cache?.canvas || document.createElement("canvas");
          off.width = Math.ceil(cols * scale);
          off.height = Math.ceil(rows * scale);
          draw(off.getContext("2d"), 1, 0, 0, off.width, off.height, scale);
          cache = { scale, canvas: off };
        }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, w, h);
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(cache.canvas, ox, oy);
      } else draw(ctx, dpr, ox, oy, w, h, scale);
      // visibility, and (behind the interface) the fade under the page header: painted in rather than
      // a CSS mask/opacity, which can flash unmasked for a frame while the canvas redraws
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const { strength: alpha, explore: open } = look.current;
      if (!open) {
        const fade = ctx.createLinearGradient(0, 90, 0, 220);
        fade.addColorStop(0, "rgba(0,0,0,0)");
        fade.addColorStop(1, `rgba(0,0,0,${alpha})`);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "destination-in";
        ctx.fillStyle = fade;
        ctx.fillRect(0, 0, w, h);
        ctx.globalCompositeOperation = "source-over";
      }
      ctx.globalAlpha = 1;
    };

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      c.width = Math.round(c.clientWidth * dpr);
      c.height = Math.round(c.clientHeight * dpr);
      paint.current();
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [region]);

  // visibility setting or explore toggled: same view, repainted
  useEffect(() => {
    look.current = { strength, explore };
    paint.current();
  }, [strength, explore]);

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
      paint.current(p < 1);
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
      if (!frame) frame = requestAnimationFrame(() => ((frame = 0), paint.current(!!drag)));
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
      if (drag) paint.current(); // full quality once the drag ends
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
      <canvas ref={canvas} className={`topo-backdrop ${explore ? "exploring" : ""}`} aria-hidden={!explore} />
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
