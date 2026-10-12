import { useMemo, useState } from "react";
import { VERDICT_LABELS, assessUnit, similarUnits } from "../lib/costModel";
import { titleCase } from "../lib/model";
import { useCostModel } from "../state/useCostModel";
import { useProject } from "../state/useProject";
import { Button } from "./ui";
import { CompareTable, DriverList, UnitLine } from "./UnitValue";

/** "Points" suggestion for a custom unit: what its stats are worth next to similar vanilla units. */
export default function PointsPanel({ unit, base, set }) {
  const { game } = useProject();
  const model = useCostModel();
  const [open, setOpen] = useState(false);
  const assessment = useMemo(() => model && assessUnit(model, game, base, unit), [model, game, base, unit]);
  const similar = useMemo(() => (open && model ? similarUnits(model, game, base, unit, 5) : []), [open, model, game, base, unit]);

  if (!model || !assessment) return null;
  const { suggested, actual, ratio, verdict, drivers, scope } = assessment;
  const typical = Math.max(5, Math.round((scope.cv.medianPctError * suggested) / 5) * 5);
  const diff = Math.round((ratio - 1) * 100);

  const setCost = (cp) => {
    const stats = { ...unit.stats, cp };
    if (cp === base.stats.cp) delete stats.cp;
    set({ stats });
  };

  return (
    <div className={`points-panel points-${verdict}`}>
      <div className="points-head">
        <div className="points-figures">
          <span className="points-label">Suggested cost</span>
          <strong className="points-value">{suggested}</strong>
          <span className="muted small">± {typical} pts</span>
        </div>
        <div className="points-verdict">
          <span className="points-badge">{VERDICT_LABELS[verdict]}</span>
          <span className="muted small">
            costs {actual} pts{diff ? ` · ${diff > 0 ? "+" : ""}${diff}% vs its stats` : ""} · compared with {scope.peers}
          </span>
        </div>
        <div className="points-actions">
          {actual !== suggested && (
            <Button size="sm" onClick={() => setCost(suggested)} title="Set this unit's cost to the suggestion">
              Use {suggested} pts
            </Button>
          )}
          <Button size="sm" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
            {open ? "Hide why" : "Why?"}
          </Button>
        </div>
      </div>

      {open && (
        <div className="points-body">
          <div>
            <h4 className="points-sub">What moves the price (vs the average of {scope.peers})</h4>
            <DriverList drivers={drivers} />
          </div>
          <div>
            <h4 className="points-sub">Most similar vanilla units</h4>
            <ul className="similar-list">
              {similar.map(({ unit: u }) => (
                <li key={u.id}>
                  <UnitLine unit={u} /> <span className="muted">· {u.stats.cp} pts</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="points-compare">
            <h4 className="points-sub">Side by side</h4>
            <CompareTable
              columns={[
                { key: "this", unit: { ...base, stats: { ...base.stats, ...unit.stats } }, base, custom: unit, assessment, name: unit.name, country: unit.nationTag, highlight: true },
                ...similar.map(({ unit: u }) => ({ unit: u, assessment: assessUnit(model, game, u), name: titleCase(u.name) })),
              ]}
            />
          </div>
          <p className="muted small points-note">
            Learned from {model.trainedOn.toLocaleString()} vanilla prices: typical miss on units it hadn&apos;t seen is ±
            {(scope.cv.medianPctError * 100).toFixed(0)}%. It reads stats, weapons and abilities, but not things like
            availability per card, veterancy or how strong a unit is in its division, so treat it as a sanity check.
          </p>
        </div>
      )}
    </div>
  );
}
