import { VERDICT_LABELS } from "../lib/costModel";
import { titleCase } from "../lib/model";
import { UnitHover } from "./UnitCard";
import { DlcBadge, NationFlag, SpecIcon } from "./visuals";

const signed = (n) => `${n > 0 ? "+" : ""}${n}%`;
const diffPct = (a) => Math.round((a.ratio - 1) * 100);

/** "Underpriced (a bargain) · −30%" in the verdict's colour. */
export function VerdictText({ assessment: a, short = false }) {
  if (!a) return null;
  const d = diffPct(a);
  return (
    <span className={`verdict verdict-${a.verdict}`}>
      {short ? { underpriced: "Bargain", overpriced: "Overpriced", fair: "Fair" }[a.verdict] : VERDICT_LABELS[a.verdict]}
      {d !== 0 && ` · ${signed(d)}`}
    </span>
  );
}

/** Bars for what pushes the price up or down. */
export function DriverList({ drivers, limit = 8 }) {
  return (
    <ul className="driver-list">
      {drivers.slice(0, limit).map((d) => (
        <li key={d.label}>
          <span className="driver-bar" aria-hidden="true">
            <span className={d.pct > 0 ? "up" : "down"} style={{ width: `${Math.min(100, Math.abs(d.pct) * 1.5)}%` }} />
          </span>
          <span className={d.pct > 0 ? "driver-up" : "driver-down"}>{signed(d.pct)}</span> {d.label}
        </li>
      ))}
      {!drivers.length && <li className="muted">Very close to an average unit of this type.</li>}
    </ul>
  );
}

const expm1 = (x) => Math.round(Math.expm1(x || 0));
// rows for the comparison table: [label, value(unit, assessment)], hidden when every column is empty
const COMPARE_ROWS = [
  ["Health", (u) => u.stats.health],
  ["Armor F / S / R / T", (u, a) => (a.features.heavyArmor ? `${u.stats.armorFront} / ${u.stats.armorSides} / ${u.stats.armorRear} / ${u.stats.armorTop}` : null)],
  ["Squad size", (u) => u.stats.soldiers],
  ["Speed", (u) => u.stats.speed && `${u.stats.speed} km/h`],
  ["Optics", (u) => u.stats.optics],
  ["Stealth", (u) => u.stats.stealth],
  ["ECM", (u) => (u.stats.ecm ? `${Math.round(-u.stats.ecm * 100)}%` : null)],
  ["Anti-tank power", (u, a) => a.features.atPower || null],
  ["Direct-fire range", (u, a) => expm1(a.features.directRange) || null],
  ["HE damage", (u, a) => a.features.heDamage || null],
  ["Range vs air", (u, a) => expm1(a.features.aaRange) || null],
  ["Artillery range", (u, a) => expm1(a.features.indirectRange) || null],
  ["Supply", (u) => u.stats.supply],
];

/**
 * Side-by-side stats of a unit and its closest vanilla matches.
 * columns: [{ unit (vanilla base), assessment, name, highlight?, onOpen? }]
 */
export function CompareTable({ columns }) {
  const rows = COMPARE_ROWS.map(([label, get]) => [label, columns.map((c) => get(c.unit, c.assessment) ?? null)]).filter(([, vals]) =>
    vals.some((v) => v != null && v !== 0 && v !== ""),
  );
  return (
    <div className="compare-wrap">
      <table className="compare-table">
        <thead>
          <tr>
            <th />
            {columns.map((c) => (
              <th key={c.key || c.unit.id} className={c.highlight ? "compare-this" : ""}>
                <UnitHover base={c.base || c.unit} unit={c.custom || null} name={c.name}>
                  {c.onOpen ? (
                    <button type="button" className="link" onClick={c.onOpen}>
                      {c.name}
                    </button>
                  ) : (
                    c.name
                  )}
                </UnitHover>
                <div className="muted small">
                  <NationFlag tag={c.country || c.unit.country} size={12} /> {c.country || c.unit.country} <DlcBadge packs={c.unit.dlc} />
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr className="compare-cost">
            <td>Cost</td>
            {columns.map((c) => (
              <td key={c.key || c.unit.id} className={c.highlight ? "compare-this" : ""}>
                <strong>{c.assessment.actual}</strong> <span className="muted">/ ~{c.assessment.suggested}</span>
                <div>
                  <VerdictText assessment={c.assessment} short />
                </div>
              </td>
            ))}
          </tr>
          {rows.map(([label, vals]) => (
            <tr key={label}>
              <td>{label}</td>
              {vals.map((v, i) => (
                <td key={columns[i].key || columns[i].unit.id} className={columns[i].highlight ? "compare-this" : ""}>
                  {v ?? "–"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Name line with role icon, used in lists. */
export function UnitLine({ unit, name }) {
  return (
    <>
      <NationFlag tag={unit.country} size={13} /> <SpecIcon spec={unit.role} size={13} /> {name || titleCase(unit.name)} <DlcBadge packs={unit.dlc} />
    </>
  );
}
