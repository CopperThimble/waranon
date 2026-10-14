import { useDeferredValue, useMemo, useState } from "react";
import { ROLE_LABELS, facetLabel, unitFacets } from "../lib/labels";
import { CATEGORIES, allAlliances, allNations, customRef, resolveUnitRef } from "../lib/model";
import { useProject } from "../state/useProject";
import { Modal } from "./ui";
import { UnitHover } from "./UnitCard";
import { DlcBadge, NationFlag, SpecIcon, UnitThumb } from "./visuals";

const LIMIT = 120;
const TAG_CHIPS_COLLAPSED = 18;

/**
 * Modal unit browser.
 * options: factory (lock to a category), transportsOnly, includeCustom, clonableOnly,
 *          exclude (Set of refs), side (initial alliance filter: 'NATO' | 'PACT')
 */
export default function UnitPicker({ title = "Choose a unit", onPick, onClose, options = {} }) {
  const { game, project } = useProject();
  const [query, setQuery] = useState("");
  const searched = useDeferredValue(query); // the box keeps up while the result cards catch up
  const [factory, setFactory] = useState(options.factory || "");
  const [allianceId, setAllianceId] = useState(options.side || "");
  const [country, setCountry] = useState("");
  const [role, setRole] = useState("");
  const [tags, setTags] = useState(() => new Set());
  const [showAllTags, setShowAllTags] = useState(false);

  const nations = useMemo(() => allNations(game, project), [game, project]);
  const nationByTag = useMemo(() => new Map(nations.map((n) => [n.tag, n])), [nations]);
  const alliances = allAlliances(project);

  // Every candidate unit, with the fields the filters need precomputed.
  const all = useMemo(() => {
    const custom = options.includeCustom
      ? project.units.map((u) => resolveUnitRef(game, project, customRef(u.id))).filter(Boolean)
      : [];
    const vanilla = game.units
      .filter((u) => !(options.clonableOnly && u.building))
      .map((u) => resolveUnitRef(game, project, u.id));
    return [...custom, ...vanilla].map((u) => {
      const nation = nationByTag.get(u.country);
      return {
        ...u,
        side: nation?.side || u.base.coalition,
        allianceId: nation?.custom ? nation.nation.allianceId : nation?.side || u.base.coalition,
        facets: unitFacets(u.base),
        haystack: `${u.name} ${u.base.id} ${u.country} ${nation?.name || ""} ${u.base.role}`.toLowerCase(),
      };
    });
  }, [game, project, nationByTag, options.includeCustom, options.clonableOnly]);

  // Units passing every filter except tags; tag chips are counted from this set.
  const preTag = useMemo(() => {
    const words = searched.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const builtin = allianceId === "NATO" || allianceId === "PACT";
    return all.filter((u) => {
      if (options.exclude?.has(u.ref)) return false;
      if (options.transportsOnly && !u.isTransport) return false;
      if (factory && u.factory !== factory) return false;
      if (allianceId && (builtin ? u.side !== allianceId : u.allianceId !== allianceId)) return false;
      if (country && u.country !== country) return false;
      if (role && u.base.role !== role) return false;
      return words.every((w) => u.haystack.includes(w));
    });
  }, [all, searched, factory, allianceId, country, role, options.exclude, options.transportsOnly]);

  const results = useMemo(
    () => (tags.size ? preTag.filter((u) => [...tags].every((t) => u.facets.includes(t))) : preTag),
    [preTag, tags],
  );

  const tagCounts = useMemo(() => {
    const counts = new Map();
    for (const u of results) for (const f of u.facets) counts.set(f, (counts.get(f) || 0) + 1);
    // keep selected tags visible even when they'd sort low
    for (const t of tags) if (!counts.has(t)) counts.set(t, 0);
    return [...counts.entries()]
      .filter(([key, n]) => tags.has(key) || (n > 0 && n < results.length))
      .sort((a, b) => Number(tags.has(b[0])) - Number(tags.has(a[0])) || b[1] - a[1]);
  }, [results, tags]);

  const countryOptions = useMemo(() => {
    const present = new Set(all.map((u) => u.country));
    const builtin = allianceId === "NATO" || allianceId === "PACT";
    return nations.filter(
      (n) =>
        present.has(n.tag) &&
        (!allianceId || (builtin ? n.side === allianceId : n.custom && n.nation.allianceId === allianceId)),
    );
  }, [all, nations, allianceId]);

  const roleOptions = useMemo(() => {
    const counts = new Map();
    for (const u of preTag) counts.set(u.base.role, (counts.get(u.base.role) || 0) + 1);
    if (role && !counts.has(role)) counts.set(role, 0);
    return [...counts.entries()].filter(([r]) => r).sort((a, b) => b[1] - a[1]);
  }, [preTag, role]);

  const toggleTag = (key) =>
    setTags((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const anyFilter = query || (!options.factory && factory) || allianceId || country || role || tags.size;
  function clearFilters() {
    setQuery("");
    if (!options.factory) setFactory("");
    setAllianceId("");
    setCountry("");
    setRole("");
    setTags(new Set());
  }

  const visibleTags = showAllTags ? tagCounts : tagCounts.slice(0, TAG_CHIPS_COLLAPSED);

  return (
    <Modal title={title} onClose={onClose} size="lg">
      <input
        className="input picker-search"
        autoFocus
        placeholder="Search by name, e.g. abrams, t-80, rifles…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="picker-filters">
        <label className="picker-filter">
          <span>Alliance</span>
          <select
            className="input"
            value={allianceId}
            onChange={(e) => {
              setAllianceId(e.target.value);
              setCountry("");
            }}
          >
            <option value="">All</option>
            {alliances.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
                {a.builtin ? "" : ` (${a.side})`}
              </option>
            ))}
          </select>
        </label>
        <label className="picker-filter">
          <span>Country</span>
          <select className="input" value={country} onChange={(e) => setCountry(e.target.value)}>
            <option value="">All countries</option>
            {countryOptions.map((n) => (
              <option key={n.tag} value={n.tag}>
                {n.name} ({n.tag}){n.custom ? " ★" : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="picker-filter">
          <span>Role</span>
          <select className="input" value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="">All roles</option>
            {roleOptions.map(([r, n]) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r] || r} ({n})
              </option>
            ))}
          </select>
        </label>
      </div>

      {!options.factory && (
        <div className="chips">
          <button type="button" className={`chip ${!factory ? "chip-on" : ""}`} onClick={() => setFactory("")}>
            All types
          </button>
          {CATEGORIES.map((c) => (
            <button
              type="button"
              key={c.id}
              className={`chip ${factory === c.id ? "chip-on" : ""}`}
              onClick={() => setFactory(c.id)}
            >
              {c.label}
            </button>
          ))}
        </div>
      )}

      {tagCounts.length > 0 && (
        <div className="chips tag-chips">
          <span className="chips-label">Tags</span>
          {visibleTags.map(([key, n]) => (
            <button
              type="button"
              key={key}
              className={`chip chip-sm ${tags.has(key) ? "chip-on" : ""}`}
              onClick={() => toggleTag(key)}
              title={key.split(":")[1]}
            >
              {key.startsWith("spec:") && <SpecIcon spec={key.slice(5)} size={13} />} {facetLabel(key)}
              {!tags.has(key) && <span className="chip-count">{n}</span>}
            </button>
          ))}
          {tagCounts.length > TAG_CHIPS_COLLAPSED && (
            <button type="button" className="link small" onClick={() => setShowAllTags((v) => !v)}>
              {showAllTags ? "fewer" : `+${tagCounts.length - TAG_CHIPS_COLLAPSED} more`}
            </button>
          )}
        </div>
      )}

      <div className="picker-count">
        <span>
          {results.length} unit{results.length === 1 ? "" : "s"}
          {results.length > LIMIT && ` (showing the first ${LIMIT}; narrow it down with the filters)`}
        </span>
        {anyFilter ? (
          <button type="button" className="link small" onClick={clearFilters}>
            clear filters
          </button>
        ) : null}
      </div>
      <div className="picker-grid">
        {results.slice(0, LIMIT).map((u) => (
          <button type="button" key={u.ref} className="picker-item" onClick={() => onPick(u.ref)}>
            <UnitHover base={u.base} unit={u.custom ? u.unit : null} name={u.name}>
              <UnitThumb info={u} />
            </UnitHover>
            <div className="picker-item-body">
              <div className="picker-item-name">
                {u.custom && <span className="tag-custom">custom</span>}
                {u.name} {!u.custom && <DlcBadge packs={u.base.dlc} />}
              </div>
              <div className="picker-item-meta">
                <NationFlag tag={u.country} size={16} />
                <span>{u.country}</span>
                <SpecIcon spec={u.base.role} size={14} />
                <span>{ROLE_LABELS[u.base.role] || CATEGORIES.find((c) => c.id === u.factory)?.short || u.factory}</span>
                {u.stats.cp != null && <span>· {u.stats.cp} pts</span>}
              </div>
            </div>
          </button>
        ))}
        {!results.length && <p className="muted">No units match these filters.</p>}
      </div>
    </Modal>
  );
}
