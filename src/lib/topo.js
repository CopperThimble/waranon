// Real terrain for the Field backdrop: height grids built by scripts/build_topo.py from open
// elevation data, plus real roads, rivers and towns from OpenStreetMap built by scripts/build_osm.py
// (public/data/topo/*.json, fetched once at build time).

import { useEffect, useState } from "react";

const BASE = `${import.meta.env.BASE_URL}data/topo/`;
const ROTATE_KEY = "waranon-topo"; // index of the next region when rotating per visit
const SETTINGS_KEY = "waranon-topo-settings";
const DEFAULTS = { show: true, strength: 1, pinned: null }; // pinned: region id, or null = new map each visit
const cache = new Map();

async function json(path) {
  if (!cache.has(path)) {
    cache.set(
      path,
      fetch(BASE + path).then((r) => {
        if (!r.ok) throw new Error(`terrain ${path}: ${r.status}`);
        return r.json();
      }),
    );
  }
  return cache.get(path);
}

/**
 * Decode a region file into { ...meta, grid: Uint16Array, features }. features: the region's roads,
 * rivers, built-up areas and places from OpenStreetMap (scripts/build_osm.py), or null if missing.
 */
async function loadRegion(id) {
  const [data, features] = await Promise.all([json(`${id}.json`), json(`${id}.features.json`).catch(() => null)]);
  data.features = features;
  if (!data.grid) {
    const bin = atob(data.heights);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    data.grid = new Uint16Array(bytes.buffer);
  }
  return data;
}

const read = (key, fallback) => {
  try {
    const v = localStorage.getItem(key);
    return v == null ? fallback : JSON.parse(v);
  } catch {
    return fallback;
  }
};
const write = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* not remembered */
  }
};

/**
 * The terrain sheet and its settings. Unless a map is pinned, each visit starts on the next region
 * in turn. Returns { region, regions, settings, update(patch) }.
 */
export function useTopo(enabled) {
  const [regions, setRegions] = useState(null);
  const [settings, setSettings] = useState(() => ({ ...DEFAULTS, ...read(SETTINGS_KEY, {}) }));
  const [rotation, setRotation] = useState(() => Number(read(ROTATE_KEY, 0)) || 0);
  const [region, setRegion] = useState(null);

  useEffect(() => {
    if (!enabled || regions) return;
    json("index.json").then(
      (list) => {
        setRegions(list);
        setRotation((i) => {
          const n = (i + 1) % list.length; // advance once per visit
          write(ROTATE_KEY, n);
          return n;
        });
      },
      () => setRegions([]),
    );
  }, [enabled, regions]);

  const wanted = regions?.length ? regions.find((r) => r.id === settings.pinned) || regions[rotation % regions.length] : null;
  const wantedId = settings.show ? wanted?.id : null;

  useEffect(() => {
    if (!enabled || !wantedId) return undefined;
    let alive = true;
    loadRegion(wantedId).then((r) => alive && setRegion(r), () => {});
    return () => {
      alive = false;
    };
  }, [enabled, wantedId]);

  const update = (patch) =>
    setSettings((s) => {
      const next = { ...s, ...patch };
      write(SETTINGS_KEY, next);
      return next;
    });

  return { region: settings.show && region?.id === wantedId ? region : null, current: wanted, regions: regions || [], settings, update };
}

const fmt = (v, pos, neg) => `${Math.abs(v).toFixed(2)}°${v >= 0 ? pos : neg}`;
/** "34.53°N 69.17°E" */
export const coords = (r) => `${fmt(r.lat, "N", "S")} ${fmt(r.lon, "E", "W")}`;
