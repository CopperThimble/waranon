import { useMemo, useState } from "react";
import AbilitiesEditor from "../components/AbilitiesEditor";
import UnitPicker from "../components/UnitPicker";
import WeaponsEditor from "../components/WeaponsEditor";
import { SquadFigures } from "../components/Diagrams";
import { cleanGameText } from "../lib/labels";
import { Button, Empty, Field, ImageUpload, PageHeader, StatControl } from "../components/ui";
import { NationFlag, UnitThumb } from "../components/visuals";
import { IMAGE_SPECS, vanillaUnitUrl } from "../lib/images";
import { CATEGORIES, STATS, allNations, customRef, newId, newToken, newUnit, resolveUnitRef, titleCase } from "../lib/model";
import { useProject } from "../state/useProject";

export default function UnitsPage() {
  const { game, project, addItem } = useProject();
  const [selectedId, setSelectedId] = useState(project.units[0]?.id || null);
  const [picking, setPicking] = useState(false);
  const selected = project.units.find((u) => u.id === selectedId) || project.units[0];

  function create(baseRef) {
    const base = game.unitsById.get(baseRef);
    const unit = newUnit(base, project.nations.find((n) => n.tag)?.tag);
    addItem("units", unit);
    setSelectedId(unit.id);
    setPicking(false);
  }

  return (
    <div className="page">
      <PageHeader
        title="Units"
        subtitle="Start from any vanilla unit (it keeps the 3D model and weapons), then rename it, move it to your nation and rebalance it."
        actions={<Button variant="primary" onClick={() => setPicking(true)}>+ New unit</Button>}
      />
      {!project.units.length ? (
        <Empty icon="▣" title="No units yet" action={<Button variant="primary" onClick={() => setPicking(true)}>Pick a unit to start from</Button>}>
          Every custom unit is a copy of a vanilla one: same model and animations, your name and numbers.
        </Empty>
      ) : (
        <div className="md-layout">
          <aside className="md-list">
            {CATEGORIES.map((cat) => {
              const items = project.units
                .map((u) => resolveUnitRef(game, project, customRef(u.id)))
                .filter((i) => i && i.factory === cat.id);
              if (!items.length) return null;
              return (
                <div key={cat.id} className="md-group">
                  <div className="md-group-title">{cat.label}</div>
                  {items.map((info) => (
                    <button
                      type="button"
                      key={info.unit.id}
                      className={`md-item ${info.unit.id === selected?.id ? "active" : ""}`}
                      onClick={() => setSelectedId(info.unit.id)}
                    >
                      <UnitThumb info={info} className="unit-thumb-sm" />
                      <span className="md-item-text">
                        <span className="md-item-title">{info.name || "Unnamed"}</span>
                        <span className="md-item-sub">
                          <NationFlag tag={info.country} size={14} /> {info.country} · {info.stats.cp} pts
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              );
            })}
          </aside>
          {selected && <UnitEditor key={selected.id} unit={selected} onSelect={setSelectedId} />}
        </div>
      )}
      {picking && (
        <UnitPicker title="Start from which unit?" onClose={() => setPicking(false)} onPick={create} options={{ clonableOnly: true }} />
      )}
    </div>
  );
}

const TABS = [
  { id: "stats", label: "Stats" },
  { id: "mobility", label: "Mobility" },
  { id: "weapons", label: "Weapons" },
  { id: "abilities", label: "Abilities" },
];

function UnitEditor({ unit, onSelect }) {
  const { game, project, patchItem, removeItem, addItem, addAsset, removeAsset } = useProject();
  const [changingBase, setChangingBase] = useState(false);
  const [tab, setTab] = useState("stats");
  const info = resolveUnitRef(game, project, customRef(unit.id));
  const base = game.unitsById.get(unit.baseUnitId);
  const set = (patch) => patchItem("units", unit.id, patch);
  const nations = allNations(game, project);
  const inDivisions = project.divisions.filter((d) => d.roster.some((r) => r.unit === customRef(unit.id)));

  if (!base || !info) {
    return (
      <section className="md-detail card">
        <p>Base unit {unit.baseUnitId} isn't in the current game data.</p>
        <Button variant="danger" onClick={() => removeItem("units", unit.id)}>Delete unit</Button>
      </section>
    );
  }

  const changedCount = (t) => {
    if (t === "weapons") {
      const w = unit.weapons || {};
      return Object.keys(w.salves || {}).length + Object.keys(w.turrets || {}).length + Object.keys(w.mounted || {}).length + (w.extraBoxes?.length || 0);
    }
    if (t === "abilities") return Object.keys(unit.abilities?.presets || {}).length + (unit.abilities?.custom?.length || 0);
    return STATS.filter((s) => s.tab === t && s.key in unit.stats).length;
  };

  return (
    <section className="md-detail card">
      <div className="detail-head">
        <UnitThumb info={info} className="unit-thumb-lg" />
        <div className="grow">
          <input className="input title-input" value={unit.name} onChange={(e) => set({ name: e.target.value })} aria-label="Unit name" />
          <div className="muted small">
            Based on <strong>{titleCase(base.name)}</strong> ({base.country}, {CATEGORIES.find((c) => c.id === base.factory)?.label}) ·{" "}
            <button type="button" className="link" onClick={() => setChangingBase(true)}>change base</button>
          </div>
        </div>
      </div>

      <div className="unit-top">
        <div className="form-grid">
          <Field label="Nation">
            {(id) => (
              <select id={id} className="input" value={unit.nationTag} onChange={(e) => set({ nationTag: e.target.value })}>
                {nations.map((n) => (
                  <option key={n.tag} value={n.tag}>
                    {n.name} ({n.tag}){n.custom ? " ★" : ""}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label="In divisions">
            <div className="muted small field-static">
              {inDivisions.length ? inDivisions.map((d) => d.name).join(", ") : "Not in any division yet: add it from the Divisions page."}
            </div>
          </Field>
        </div>
        <div className="unit-icon">
          <ImageUpload
            spec={IMAGE_SPECS.unitIcon}
            blob={project.assets[unit.iconAssetId]?.blob}
            fallbackUrl={vanillaUnitUrl(base)}
            onChange={(blob, name) => {
              removeAsset(unit.iconAssetId);
              set({ iconAssetId: addAsset(blob, name) });
            }}
            onClear={() => {
              removeAsset(unit.iconAssetId);
              set({ iconAssetId: null });
            }}
          />
        </div>
      </div>

      <div className="tabs" role="tablist">
        {TABS.map((t) => {
          const n = changedCount(t.id);
          return (
            <button type="button" role="tab" aria-selected={tab === t.id} key={t.id} className={tab === t.id ? "on" : ""} onClick={() => setTab(t.id)}>
              {t.label}
              {n > 0 && <span className="tab-badge" title="changed from base">{n}</span>}
            </button>
          );
        })}
      </div>

      {(tab === "stats" || tab === "mobility") && <StatsTab unit={unit} base={base} tab={tab} set={set} />}
      {tab === "weapons" && <WeaponsEditor unit={unit} base={base} set={set} />}
      {tab === "abilities" && <AbilitiesEditor unit={unit} base={base} set={set} />}

      <div className="detail-footer">
        <Button
          onClick={() => {
            const copy = { ...structuredClone(unit), id: newId(), name: `${unit.name} (copy)`, nameToken: newToken(), guid: newId() };
            addItem("units", copy);
            onSelect(copy.id);
          }}
        >
          Duplicate
        </Button>
        <Button
          variant="ghost-danger"
          onClick={() => {
            if (window.confirm(`Delete ${unit.name}?${inDivisions.length ? " It will be removed from its divisions." : ""}`)) {
              removeAsset(unit.iconAssetId);
              removeItem("units", unit.id);
            }
          }}
        >
          Delete unit
        </Button>
      </div>

      {changingBase && (
        <UnitPicker
          title="Change base unit (resets stats, weapons and abilities)"
          onClose={() => setChangingBase(false)}
          options={{ clonableOnly: true }}
          onPick={(ref) => {
            set({ baseUnitId: ref, stats: {}, weapons: undefined, abilities: undefined });
            setChangingBase(false);
          }}
        />
      )}
    </section>
  );
}

function StatsTab({ unit, base, tab, set }) {
  const { game } = useProject();
  const ranges = game.ranges[base.factory] || {};
  const groups = useMemo(() => {
    const out = {};
    for (const s of STATS) {
      if (s.tab !== tab || base.stats[s.key] == null) continue;
      (out[s.group] ||= []).push(s);
    }
    return out;
  }, [base, tab]);

  const setStat = (key, value) => {
    const stats = { ...unit.stats, [key]: value };
    if (value === base.stats[key]) delete stats[key];
    set({ stats });
  };

  if (!Object.keys(groups).length) return <p className="muted tab-empty">This unit type has no {tab} settings.</p>;

  return (
    <div className="tab-body">
      {groups.Squad && <SquadControl unit={unit} base={base} set={set} />}
      {Object.entries(groups).filter(([group]) => group !== "Squad").map(([group, stats]) => (
        <div key={group}>
          <h3 className="section-title">
            {group}
            {group === "Armor" && <span className="muted small"> · {base.armorFamily?.replace("ResistanceFamily_", "")} armor type</span>}
          </h3>
          <div className="stat-grid">
            {stats.map((s) => (
              <StatControl
                key={s.key}
                stat={s}
                value={unit.stats[s.key] ?? base.stats[s.key]}
                baseValue={base.stats[s.key]}
                range={ranges[s.key]}
                hardMin={s.armor ? 1 : s.hardMin ?? 0}
                hardMax={s.armor ? game.hardLimits[base.armorFamily] : s.hardMax}
                onChange={(v) => setStat(s.key, v)}
                onReset={() => setStat(s.key, base.stats[s.key])}
              />
            ))}
          </div>
        </div>
      ))}
      <p className="muted small">
        The green band is the vanilla range for {CATEGORIES.find((c) => c.id === base.factory)?.label.toLowerCase()}; the white tick is the base unit.
        Values outside the band are allowed but untested. GRU = game range units.
      </p>
    </div>
  );
}

/** Squad size, kept in step with health (1 HP per soldier in vanilla) and optionally the main weapon count. */
function SquadControl({ unit, base, set }) {
  const { game } = useProject();
  const [healthFollows, setHealthFollows] = useState(true);
  const [scaleWeapon, setScaleWeapon] = useState(true);
  const baseSoldiers = base.stats.soldiers;
  const value = unit.stats.soldiers ?? baseSoldiers;
  const ranges = game.ranges[base.factory] || {};

  // the weapon carried by the most soldiers (usually the rifle)
  const loadout = base.weapon && game.weapons[base.weapon];
  const main = useMemo(() => {
    let best = null;
    loadout?.turrets.forEach((t, ti) =>
      t.mounted.forEach((m, mi) => {
        if (!best || m.count > best.count) best = { slot: `${ti}.${mi}`, count: m.count, ammo: m.ammo };
      }),
    );
    return best;
  }, [loadout]);

  function change(v) {
    const n = Math.max(1, Math.round(v));
    const stats = { ...unit.stats, soldiers: n };
    if (n === baseSoldiers) delete stats.soldiers;
    if (healthFollows) {
      const health = base.stats.health + (n - baseSoldiers);
      if (health === base.stats.health) delete stats.health;
      else stats.health = Math.max(1, health);
    }
    const patch = { stats };
    if (scaleWeapon && main) {
      const count = Math.max(1, main.count + (n - baseSoldiers));
      const w = structuredClone(unit.weapons || {});
      w.mounted = { ...w.mounted, [main.slot]: { ...w.mounted?.[main.slot], count: count === main.count ? undefined : count } };
      if (w.mounted[main.slot].count === undefined) delete w.mounted[main.slot].count;
      if (!Object.keys(w.mounted[main.slot]).length) delete w.mounted[main.slot];
      if (!Object.keys(w.mounted).length) delete w.mounted;
      patch.weapons = Object.keys(w).length ? w : undefined;
    }
    set(patch);
  }

  return (
    <div className="squad">
      <h3 className="section-title">Squad</h3>
      <SquadFigures count={value} baseCount={baseSoldiers} />
      <div className="squad-row">
        <StatControl
          stat={STATS.find((s) => s.key === "soldiers")}
          value={value}
          baseValue={baseSoldiers}
          range={ranges.soldiers}
          hardMin={1}
          hardMax={30}
          onChange={change}
          onReset={() => change(baseSoldiers)}
        />
        <div className="squad-options">
          <label className="check">
            <input type="checkbox" checked={healthFollows} onChange={(e) => setHealthFollows(e.target.checked)} />
            Health follows squad size (vanilla: 1 health per soldier)
          </label>
          {main && (
            <label className="check">
              <input type="checkbox" checked={scaleWeapon} onChange={(e) => setScaleWeapon(e.target.checked)} />
              Scale main weapon count ({cleanGameText(game.ammo[main.ammo]?.name || main.ammo)}, ×{main.count} on the base unit)
            </label>
          )}
          <p className="muted small">Extra soldiers reuse the squad's existing 3D models. Vanilla squads run from 2 to 16.</p>
        </div>
      </div>
    </div>
  );
}
