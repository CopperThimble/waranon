import { useMemo, useState } from "react";
import { CompareTable, DriverList, VerdictText } from "../components/UnitValue";
import { UnitHover } from "../components/UnitCard";
import { Empty, Modal, PageHeader } from "../components/ui";
import { DlcBadge, NationFlag, UnitSpecIcons } from "../components/visuals";
import { VERDICT_LABELS, similarUnits } from "../lib/costModel";
import { allPortraits, gameArtEnabled } from "../lib/images";
import { CATEGORIES, titleCase } from "../lib/model";
import { useCostModel, useVanillaAssessments } from "../state/useCostModel";
import { useProject } from "../state/useProject";

const PAGE = 240;
const categoryLabel = (id) => CATEGORIES.find((c) => c.id === id)?.label || id;

/**
 * Browse every unit portrait extracted from the game (images/portraits), with each unit's price
 * against what its stats suggest, and how it compares to its closest matches.
 */
export default function GalleryPage() {
  const { game } = useProject();
  const assessments = useVanillaAssessments(game);
  const [query, setQuery] = useState("");
  const [side, setSide] = useState("");
  const [usage, setUsage] = useState("");
  const [factory, setFactory] = useState("");
  const [value, setValue] = useState("");
  const [content, setContent] = useState("");
  const [sort, setSort] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const [open, setOpen] = useState(null); // { item, unitId }

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
  const itemByUnit = useMemo(() => new Map(items.flatMap((p) => p.users.map((u) => [u.id, p]))), [items]);

  const results = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    const ratios = (p) => p.users.map((u) => assessments?.get(u.id)?.ratio).filter(Boolean);
    // portraits whose own file name matches come before ones matched only through unit names
    const nameHit = (p) => words.length > 0 && words.every((w) => p.name.toLowerCase().includes(w));
    const list = items.filter((p) => {
      if (side && p.side !== side) return false;
      if (usage === "used" && !p.users.length) return false;
      if (usage === "unused" && p.users.length) return false;
      if (factory && !p.users.some((u) => u.factory === factory)) return false;
      if (content === "dlc" && !p.users.some((u) => u.dlc)) return false;
      if (content === "base" && !p.users.some((u) => u.divisions.length && !u.dlc)) return false;
      if (value && !p.users.some((u) => assessments?.get(u.id)?.verdict === value)) return false;
      if (!words.length) return true;
      const hay = `${p.name} ${p.users.map((u) => `${u.name} ${u.country}`).join(" ")}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    });
    if (sort === "under") return list.filter((p) => ratios(p).length).sort((a, b) => Math.min(...ratios(a)) - Math.min(...ratios(b)));
    if (sort === "over") return list.filter((p) => ratios(p).length).sort((a, b) => Math.max(...ratios(b)) - Math.max(...ratios(a)));
    if (sort === "cost") return list.sort((a, b) => Math.max(0, ...b.users.map((u) => u.stats.cp || 0)) - Math.max(0, ...a.users.map((u) => u.stats.cp || 0)));
    return list.sort((a, b) => Number(nameHit(b)) - Number(nameHit(a)));
  }, [items, query, side, usage, factory, content, value, sort, assessments]);

  const unused = items.filter((p) => !p.users.length).length;
  const reset = (fn) => (e) => {
    fn(e.target.value);
    setLimit(PAGE);
  };

  if (!allPortraits.length) {
    return (
      <div className="page">
        <PageHeader title="Gallery" />
        {gameArtEnabled ? (
          <Empty icon="▦" title="No portraits found">
            Put extracted unit icons in <code>images/unit-icons/NATO</code> and <code>images/unit-icons/PACT</code>, run{" "}
            <code>python scripts/convert_portraits.py</code>, and restart the dev server.
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
        subtitle={`${items.length.toLocaleString()} unit portraits from the game (${(items.length - unused).toLocaleString()} used by current units, ${unused} unused). Open one to see how its price compares to its stats and to similar units.`}
      />
      <div className="gallery-filters">
        <input className="input" placeholder="Search file or unit name, e.g. abrams, t-80, SOV…" value={query} onChange={reset(setQuery)} />
        <select className="input" value={side} onChange={reset(setSide)} aria-label="Side">
          <option value="">NATO + PACT</option>
          <option value="NATO">NATO</option>
          <option value="PACT">PACT</option>
        </select>
        <select className="input" value={factory} onChange={reset(setFactory)} aria-label="Category">
          <option value="">All types</option>
          {CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
        <select className="input" value={usage} onChange={reset(setUsage)} aria-label="Usage">
          <option value="">Used + unused</option>
          <option value="used">Used by a unit</option>
          <option value="unused">Unused art</option>
        </select>
        <select className="input" value={content} onChange={reset(setContent)} aria-label="Content">
          <option value="">Base game + DLC</option>
          <option value="base">Base game</option>
          <option value="dlc">DLC only</option>
        </select>
        <select className="input" value={value} onChange={reset(setValue)} aria-label="Value" disabled={!assessments}>
          <option value="">Any value</option>
          {Object.entries(VERDICT_LABELS).map(([v, label]) => (
            <option key={v} value={v}>
              {label}
            </option>
          ))}
        </select>
        <select className="input" value={sort} onChange={reset(setSort)} aria-label="Sort" disabled={!assessments}>
          <option value="">Sort: best match</option>
          <option value="under">Sort: biggest bargains</option>
          <option value="over">Sort: most overpriced</option>
          <option value="cost">Sort: most expensive</option>
        </select>
      </div>
      <div className="picker-count">
        <span>
          {results.length.toLocaleString()} portrait{results.length === 1 ? "" : "s"}
          {results.length > limit && ` (showing ${limit})`}
        </span>
      </div>
      <div className="gallery-grid">
        {results.slice(0, limit).map((p) => {
          const lead = pickLead(p.users, assessments, sort);
          const a = lead && assessments?.get(lead.id);
          return (
            <button type="button" key={p.path} className="gallery-item" onClick={() => setOpen({ item: p, unitId: lead?.id })} title={p.path}>
              <UnitHover base={lead} className="gallery-hover">
                <img src={p.url} alt="" loading="lazy" />
              </UnitHover>
              <span className="gallery-caption">
                <span className="gallery-name">
                  {lead ? titleCase(lead.name) : p.name.replace(/_/g, " ")} {lead && <DlcBadge packs={lead.dlc} />}
                </span>
                <span className="muted small">
                  {p.users.length ? (
                    <>
                      {lead.stats.cp ? `${lead.stats.cp} pts` : "no cost"}
                      {a && (
                        <>
                          {" "}
                          · <VerdictText assessment={a} short />
                        </>
                      )}
                      {p.users.length > 1 && ` · +${p.users.length - 1} more`}
                    </>
                  ) : (
                    "unused"
                  )}{" "}
                  · {p.side}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      {results.length > limit && (
        <div className="gallery-more">
          <button type="button" className="btn btn-default" onClick={() => setLimit((n) => n + PAGE * 2)}>
            Show more
          </button>
        </div>
      )}

      {open && (
        <PortraitModal
          item={open.item}
          unitId={open.unitId}
          assessments={assessments}
          onSelect={(unitId) => setOpen((o) => ({ ...o, unitId }))}
          onOpenUnit={(u) => setOpen({ item: itemByUnit.get(u.id) || { name: u.name, path: "", url: null, users: [u] }, unitId: u.id })}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}

/** The unit a tile is about: the most extreme one when sorting by value, else the first. */
function pickLead(users, assessments, sort) {
  if (!users.length) return null;
  if (!assessments || (sort !== "under" && sort !== "over")) return users[0];
  const r = (u) => assessments.get(u.id)?.ratio ?? 1;
  return [...users].sort((a, b) => (sort === "under" ? r(a) - r(b) : r(b) - r(a)))[0];
}

function PortraitModal({ item, unitId, assessments, onSelect, onOpenUnit, onClose }) {
  const { game } = useProject();
  const model = useCostModel();
  const unit = item.users.find((u) => u.id === unitId) || item.users[0];
  const a = unit && assessments?.get(unit.id);
  const similar = useMemo(() => (model && unit && a ? similarUnits(model, game, unit, null, 4) : []), [model, game, unit, a]);

  return (
    <Modal title={unit ? titleCase(unit.name) : item.name.replace(/_/g, " ")} onClose={onClose} size="lg">
      <div className="gallery-detail">
        <div className="gallery-detail-top">
          {item.url && <img src={item.url} alt="" />}
          <div>
            {unit ? (
              <>
                <div className="gallery-unit-meta">
                  <NationFlag tag={unit.country} size={18} /> {unit.country} · {categoryLabel(unit.factory)} <DlcBadge packs={unit.dlc} />
                </div>
                <UnitSpecIcons unit={unit} size={22} />
                {a ? (
                  <div className={`gallery-value points-${a.verdict}`}>
                    <div>
                      <span className="points-label">Cost</span> <strong className="points-value">{a.actual}</strong>{" "}
                      <span className="muted">vs ~{a.suggested} suggested</span>
                    </div>
                    <VerdictText assessment={a} />
                    <div className="muted small">compared with {a.scope.peers}</div>
                  </div>
                ) : (
                  <p className="muted small">{unit.stats.cp ? "Loading the points model…" : "This unit has no deployment cost."}</p>
                )}
                {unit.dlc && <p className="muted small">Needs {unit.dlc.map((p) => p.name).join(" or ")}.</p>}
              </>
            ) : (
              <p className="muted">No current unit uses this picture (older or unused art).</p>
            )}
            <p className="muted small mono">{item.path && `GameData/Assets/2D/Interface/Common/UnitsIcons/${item.path}.png`}</p>
          </div>
        </div>

        {item.users.length > 1 && (
          <div className="chips">
            {item.users.map((u) => (
              <button type="button" key={u.id} className={`chip chip-sm ${u.id === unit.id ? "chip-on" : ""}`} onClick={() => onSelect(u.id)}>
                {titleCase(u.name)} ({u.country})
              </button>
            ))}
          </div>
        )}

        {a && (
          <>
            <h3 className="section-title">What moves its price</h3>
            <DriverList drivers={a.drivers} />
            <h3 className="section-title">Against its closest matches</h3>
            <CompareTable
              columns={[
                { unit, assessment: a, name: titleCase(unit.name), highlight: true },
                ...similar
                  .filter((s) => assessments.get(s.unit.id))
                  .map((s) => ({ unit: s.unit, assessment: assessments.get(s.unit.id), name: titleCase(s.unit.name), onOpen: () => onOpenUnit(s.unit) })),
              ]}
            />
            <p className="muted small">
              Closest by the stats that matter most for this type&apos;s price. Click a name to open it.
            </p>
          </>
        )}

        {unit?.divisions.length > 0 && (
          <>
            <h3 className="section-title">In divisions</h3>
            <ul className="gallery-users">
              {unit.divisions.map((id) => {
                const d = game.divisionsById.get(id);
                return (
                  <li key={id}>
                    <NationFlag tag={d.country} size={16} /> {titleCase(d.name)} {d.dlc && <DlcBadge packs={d.dlc} />}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </Modal>
  );
}
