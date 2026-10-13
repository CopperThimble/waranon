import { useMemo, useState } from "react";
import { UnitHover } from "../components/UnitCard";
import { Empty, PageHeader } from "../components/ui";
import { DlcBadge, NationFlag, SpecIcon } from "../components/visuals";
import { VERDICT_LABELS, assessUnit, categoryDrivers } from "../lib/costModel";
import { ROLE_LABELS } from "../lib/labels";
import { CATEGORIES, customRef, resolveUnitRef, titleCase } from "../lib/model";
import { useCostModel } from "../state/useCostModel";
import { useProject } from "../state/useProject";

const PAGE = 150;
const categoryLabel = (id) => CATEGORIES.find((c) => c.id === id)?.label || id;
const pct = (x) => `±${(x * 100).toFixed(0)}%`;

/** Every unit's price next to what its stats suggest, plus what drives price in each category. */
export default function BalancePage({ navigate }) {
  const { game, project } = useProject();
  const model = useCostModel();
  const [query, setQuery] = useState("");
  const [factory, setFactory] = useState("");
  const [role, setRole] = useState("");
  const [side, setSide] = useState("");
  const [verdict, setVerdict] = useState("");
  const [content, setContent] = useState("");
  const [sort, setSort] = useState({ key: "diff", dir: 1 });
  const [limit, setLimit] = useState(PAGE);

  const vanillaRows = useMemo(() => {
    if (!model) return [];
    return game.units
      .filter((u) => !u.building && u.stats.cp > 0)
      .map((u) => ({ id: u.id, name: titleCase(u.name), country: u.country, side: u.coalition, base: u, a: assessUnit(model, game, u) }))
      .filter((r) => r.a);
  }, [model, game]);

  const customRows = useMemo(() => {
    if (!model) return [];
    return project.units
      .map((u) => {
        const base = game.unitsById.get(u.baseUnitId);
        const info = resolveUnitRef(game, project, customRef(u.id));
        if (!base || !info) return null;
        return { id: u.id, custom: true, name: u.name, country: info.country, side: info.coalition || base.coalition, base, a: assessUnit(model, game, base, u) };
      })
      .filter((r) => r?.a);
  }, [model, game, project]);

  const rows = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    const keep = (r) =>
      (!factory || r.base.factory === factory) &&
      (!role || r.base.role === role) &&
      (!side || r.side === side) &&
      (!verdict || r.a.verdict === verdict) &&
      (!content || (content === "dlc" ? !!r.base.dlc && !r.custom : !r.base.dlc)) &&
      words.every((w) => `${r.name} ${r.country}`.toLowerCase().includes(w));
    const value = {
      name: (r) => r.name,
      cost: (r) => r.a.actual,
      suggested: (r) => r.a.predicted,
      diff: (r) => Math.log(r.a.ratio),
    }[sort.key];
    const cmp = (x, y) => {
      const a = value(x);
      const b = value(y);
      return (typeof a === "string" ? a.localeCompare(b) : a - b) * sort.dir;
    };
    // your own units always come first
    return [...customRows.filter(keep).sort(cmp), ...vanillaRows.filter(keep).sort(cmp)];
  }, [vanillaRows, customRows, query, factory, role, side, verdict, content, sort]);

  const roles = useMemo(
    () => [...new Set(vanillaRows.filter((r) => !factory || r.base.factory === factory).map((r) => r.base.role))].sort(),
    [vanillaRows, factory],
  );

  if (!model) {
    return (
      <div className="page">
        <PageHeader title="Balance" />
        <Empty icon="⚖" title="Loading the points model…">
          If this doesn&apos;t go away, build it with <code>npm run model</code>.
        </Empty>
      </div>
    );
  }

  const header = (key, label, cls = "") => (
    <th className={cls}>
      <button type="button" onClick={() => setSort((s) => ({ key, dir: s.key === key ? -s.dir : key === "name" ? 1 : -1 }))}>
        {label}
        {sort.key === key ? (sort.dir > 0 ? " ▲" : " ▼") : ""}
      </button>
    </th>
  );
  const shownCategory = factory && model.categories[factory];

  return (
    <div className="page">
      <PageHeader
        title="Balance"
        subtitle={`What each unit "should" cost given its stats, learned from ${model.trainedOn.toLocaleString()} vanilla prices. Underpriced = cheaper than its stats suggest (a bargain).`}
      />

      <div className="balance-models">
        {Object.entries(model.categories)
          .filter(([cat]) => !factory || cat === factory)
          .sort((a, b) => b[1].n - a[1].n)
          .map(([cat, m]) => {
            const typeRole = factory === cat && role && m.types[role] ? role : null;
            return (
              <div className="card" key={cat}>
                <h3>
                  {categoryLabel(cat)}
                  {typeRole && ` · ${ROLE_LABELS[typeRole]}`}
                </h3>
                <div className="muted small">
                  {typeRole ? m.types[typeRole].n : m.n} units · typical miss {pct(typeRole ? m.types[typeRole].cv.medianPctError : m.combinedCv.medianPctError)}
                  {!typeRole && Object.keys(m.types).length > 0 && ` · own models for ${Object.keys(m.types).map((r) => ROLE_LABELS[r] || r).join(", ")}`}
                </div>
                <ul>
                  {categoryDrivers(model, cat, shownCategory ? 8 : 4, typeRole).map((d) => (
                    <li key={d.name}>
                      <span className={d.pct > 0 ? "driver-up" : "driver-down"}>
                        {d.pct > 0 ? "+" : ""}
                        {d.pct}%
                      </span>{" "}
                      {d.label}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
      </div>
      <p className="muted small">
        Each line is how much the price moves for a unit one &quot;typical step&quot; above average on that stat (e.g. +15% front armor), with everything else equal.
        Types with enough units (commands, ATGM teams, howitzers…) get their own model, because the game prices them on different terms.
      </p>

      <div className="balance-filters">
        <input
          className="input"
          placeholder="Search unit or country…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setLimit(PAGE);
          }}
        />
        <select
          className="input"
          value={factory}
          onChange={(e) => {
            setFactory(e.target.value);
            setRole("");
          }}
        >
          <option value="">All categories</option>
          {Object.keys(model.categories).map((c) => (
            <option key={c} value={c}>
              {categoryLabel(c)}
            </option>
          ))}
        </select>
        <select className="input" value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="">All types</option>
          {roles.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r] || r}
            </option>
          ))}
        </select>
        <select className="input" value={side} onChange={(e) => setSide(e.target.value)}>
          <option value="">NATO + PACT</option>
          <option value="NATO">NATO</option>
          <option value="PACT">PACT</option>
        </select>
        <select className="input" value={verdict} onChange={(e) => setVerdict(e.target.value)}>
          <option value="">Any verdict</option>
          {Object.entries(VERDICT_LABELS).map(([v, label]) => (
            <option key={v} value={v}>
              {label}
            </option>
          ))}
        </select>
        <select className="input" value={content} onChange={(e) => setContent(e.target.value)} aria-label="Content">
          <option value="">Base game + DLC</option>
          <option value="base">Base game</option>
          <option value="dlc">DLC only</option>
        </select>
      </div>
      <div className="picker-count">
        <span>
          {rows.length.toLocaleString()} unit{rows.length === 1 ? "" : "s"}
          {rows.length > limit && ` (showing ${limit})`}
          {customRows.length > 0 && ` · your units are listed first`}
        </span>
      </div>

      <table className="balance-table">
        <thead>
          <tr>
            {header("name", "Unit")}
            <th>Type</th>
            {header("cost", "Cost", "num")}
            {header("suggested", "Suggested", "num")}
            {header("diff", "Difference", "num")}
            <th>Verdict</th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, limit).map((r) => {
            const diff = Math.round((r.a.ratio - 1) * 100);
            return (
              <tr key={r.id} className={r.custom ? "custom" : ""}>
                <td>
                  <UnitHover base={r.base} unit={r.custom ? project.units.find((u) => u.id === r.id) : null} name={r.name}>
                    <NationFlag tag={r.country} size={13} />{" "}
                    {r.custom ? (
                      <button type="button" className="link" onClick={() => navigate("units", { id: r.id })}>
                        {r.name} ★
                      </button>
                    ) : (
                      r.name
                    )}
                  </UnitHover>{" "}
                  {!r.custom && <DlcBadge packs={r.base.dlc} />}{" "}
                  <span className="muted small">{r.country}</span>
                </td>
                <td className="muted small">
                  <SpecIcon spec={r.base.role} size={14} /> {categoryLabel(r.base.factory)} · {ROLE_LABELS[r.base.role] || r.base.role}
                </td>
                <td className="num">{r.a.actual}</td>
                <td className="num">{r.a.suggested}</td>
                <td className={`num diff-${r.a.verdict === "underpriced" ? "under" : r.a.verdict === "overpriced" ? "over" : "fair"}`}>
                  {diff > 0 ? "+" : ""}
                  {diff}%
                </td>
                <td className="small">{VERDICT_LABELS[r.a.verdict]}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {rows.length > limit && (
        <div className="load-more">
          <button type="button" className="btn btn-default" onClick={() => setLimit((l) => l + PAGE)}>
            Show more
          </button>
        </div>
      )}
    </div>
  );
}
