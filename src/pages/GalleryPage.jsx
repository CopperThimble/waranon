import { useMemo, useState } from "react";
import { Empty, Modal, PageHeader } from "../components/ui";
import { NationFlag } from "../components/visuals";
import { allPortraits, gameArtEnabled } from "../lib/images";
import { CATEGORIES, titleCase } from "../lib/model";
import { useProject } from "../state/useProject";

const PAGE = 240;

/** Browse every unit portrait extracted from the game (images/unit-icons). */
export default function GalleryPage() {
  const { game } = useProject();
  const [query, setQuery] = useState("");
  const [side, setSide] = useState("");
  const [usage, setUsage] = useState("");
  const [factory, setFactory] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const [open, setOpen] = useState(null);

  // portrait path -> vanilla units using it (several variants often share one picture)
  const usersByPortrait = useMemo(() => {
    const map = new Map();
    for (const u of game.units) {
      if (!u.portrait) continue;
      const key = u.portrait.toLowerCase();
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(u);
    }
    return map;
  }, [game]);

  const items = useMemo(
    () => allPortraits.map((p) => ({ ...p, users: usersByPortrait.get(p.path.toLowerCase()) || [] })),
    [usersByPortrait],
  );

  const results = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    // portraits whose own file name matches come before ones matched only through unit names
    const nameHit = (p) => words.length > 0 && words.every((w) => p.name.toLowerCase().includes(w));
    return items.filter((p) => {
      if (side && p.side !== side) return false;
      if (usage === "used" && !p.users.length) return false;
      if (usage === "unused" && p.users.length) return false;
      if (factory && !p.users.some((u) => u.factory === factory)) return false;
      if (!words.length) return true;
      const hay = `${p.name} ${p.users.map((u) => `${u.name} ${u.country}`).join(" ")}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    }).sort((a, b) => Number(nameHit(b)) - Number(nameHit(a)));
  }, [items, query, side, usage, factory]);

  const unused = items.filter((p) => !p.users.length).length;

  if (!allPortraits.length) {
    return (
      <div className="page">
        <PageHeader title="Gallery" />
        {gameArtEnabled ? (
          <Empty icon="▦" title="No extracted portraits found">
            Put the extracted unit icons in <code>images/unit-icons/NATO</code> and <code>images/unit-icons/PACT</code> and restart the dev server.
          </Empty>
        ) : (
          <Empty icon="▦" title="Game art is switched off">
            Set <code>"gameArt": true</code> in <code>waranon.config.json</code> (or run <code>npm run art -- on</code>) and restart the dev server.
          </Empty>
        )}
      </div>
    );
  }

  return (
    <div className="page">
      <PageHeader
        title="Gallery"
        subtitle={`${items.length.toLocaleString()} unit portraits extracted from the game (${(items.length - unused).toLocaleString()} used by current units, ${unused} unused). Local only: this folder isn't uploaded.`}
      />
      <div className="gallery-filters">
        <input
          className="input"
          placeholder="Search file or unit name, e.g. abrams, t-80, SOV…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setLimit(PAGE);
          }}
        />
        <select className="input" value={side} onChange={(e) => setSide(e.target.value)}>
          <option value="">NATO + PACT</option>
          <option value="NATO">NATO</option>
          <option value="PACT">PACT</option>
        </select>
        <select className="input" value={factory} onChange={(e) => setFactory(e.target.value)}>
          <option value="">All types</option>
          {CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
        <select className="input" value={usage} onChange={(e) => setUsage(e.target.value)}>
          <option value="">Used + unused</option>
          <option value="used">Used by a unit</option>
          <option value="unused">Unused art</option>
        </select>
      </div>
      <div className="picker-count">
        <span>
          {results.length.toLocaleString()} portrait{results.length === 1 ? "" : "s"}
          {results.length > limit && ` (showing ${limit})`}
        </span>
      </div>
      <div className="gallery-grid">
        {results.slice(0, limit).map((p) => (
          <button type="button" key={p.path} className="gallery-item" onClick={() => setOpen(p)} title={p.path}>
            <img src={p.url} alt="" loading="lazy" />
            <span className="gallery-caption">
              <span className="gallery-name">{p.users[0] ? titleCase(p.users[0].name) : p.name.replace(/_/g, " ")}</span>
              <span className="muted small">
                {p.users.length ? `${p.users.length} unit${p.users.length > 1 ? "s" : ""}` : "unused"} · {p.side}
              </span>
            </span>
          </button>
        ))}
      </div>
      {results.length > limit && (
        <div className="gallery-more">
          <button type="button" className="btn btn-default" onClick={() => setLimit((n) => n + PAGE * 2)}>
            Show more
          </button>
        </div>
      )}

      {open && (
        <Modal title={open.name.replace(/_/g, " ")} onClose={() => setOpen(null)}>
          <div className="gallery-detail">
            <img src={open.url} alt="" />
            <p className="muted small mono">GameData/Assets/2D/Interface/Common/UnitsIcons/{open.path}.png</p>
            {open.users.length ? (
              <>
                <h3 className="section-title">Used by</h3>
                <ul className="gallery-users">
                  {open.users.map((u) => (
                    <li key={u.id}>
                      <NationFlag tag={u.country} size={18} /> {titleCase(u.name)}
                      <span className="muted small"> · {CATEGORIES.find((c) => c.id === u.factory)?.label || u.factory} · {u.id}</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="muted">No current unit uses this picture (older or unused art).</p>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
