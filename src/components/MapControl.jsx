import { useEffect, useId, useRef, useState } from "react";
import { coords } from "../lib/topo";

/** Field interface: top-right chip naming the map backdrop, with its source and settings. */
export default function MapControl({ topo, onExplore }) {
  const [open, setOpen] = useState(false);
  const root = useRef(null);
  const id = useId();
  const { current, regions, settings, update } = topo;

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => !root.current?.contains(e.target) && setOpen(false);
    const esc = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  if (!regions.length) return null;
  return (
    <div className="map-control" ref={root}>
      <button type="button" className="map-chip" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M9 4 3.5 6v14L9 18l6 2 5.5-2V4L15 6 9 4Zm0 0v14m6-12v14" />
        </svg>
        {settings.show && current ? (
          <>
            <span className="map-chip-name">{current.name}</span>
            <span className="map-chip-place">{current.place}</span>
          </>
        ) : (
          <span className="map-chip-name">Map off</span>
        )}
      </button>
      {open && (
        <div className="map-panel" id={id} role="dialog" aria-label="Map backdrop">
          {current && (
            <div className="map-source">
              <strong>
                {current.name}, {current.place}
              </strong>
              <span className="mono">{coords(current)}</span>
              <span className="mono">
                Contours every {current.interval} m · {current.min}–{current.max} m
              </span>
              <span>
                Elevation data from the{" "}
                <a href="https://registry.opendata.aws/terrain-tiles/" target="_blank" rel="noreferrer">
                  AWS Terrain Tiles
                </a>{" "}
                open dataset (mostly NASA SRTM), drawn as contours here. Roads, rivers, towns and built-up areas ©{" "}
                <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
                  OpenStreetMap contributors
                </a>
                , ODbL.
              </span>
            </div>
          )}
          <label className="check map-row">
            <input type="checkbox" checked={settings.show} onChange={(e) => update({ show: e.target.checked })} />
            Show map backdrop
          </label>
          <label className="map-row map-field">
            <span>Map</span>
            <select className="input input-sm" value={settings.pinned || ""} disabled={!settings.show} onChange={(e) => update({ pinned: e.target.value || null })}>
              <option value="">A different one each visit</option>
              {regions.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} ({r.place})
                </option>
              ))}
            </select>
          </label>
          <label className="map-row map-field">
            <span>
              Visibility <span className="muted">{Math.round(settings.strength * 100)}%</span>
            </span>
            <input
              type="range"
              min={0.15}
              max={1}
              step={0.05}
              value={settings.strength}
              disabled={!settings.show}
              onChange={(e) => update({ strength: Number(e.target.value) })}
              aria-label="Map visibility"
            />
          </label>
          <button
            type="button"
            className="btn btn-sm map-explore"
            disabled={!settings.show}
            onClick={() => {
              setOpen(false);
              onExplore();
            }}
          >
            Explore the map
          </button>
        </div>
      )}
    </div>
  );
}
