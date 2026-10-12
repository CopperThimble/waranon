import { useMemo, useState } from "react";
import { silhouetteType, turretColor } from "../lib/diagrams";
import { vanillaWeaponUrl } from "../lib/images";
import { ammoCategoryLabel, cleanGameText, damageFamilyLabel } from "../lib/labels";
import { AMMO_STATS, newId } from "../lib/model";
import {
  BOX_MATCH_FIELDS,
  MAX_BOXES,
  boxConflicts,
  boxRequirements,
  boxSalvos,
  effectiveMounted,
  emptyBoxes,
  fitsBox,
  mountProblem,
  normalizeWeapons,
  turretLabel,
  MAX_TURRETS,
  MAX_WEAPONS,
  defaultFiringEffect,
  turretAnchors,
  weaponTotals,
} from "../lib/weapons";
import { useProject } from "../state/useProject";
import { TrajectoryChart, TurretArcs } from "./Diagrams";
import { Button, Modal, StatControl } from "./ui";

const RAD = 180 / Math.PI;
const deg = (rad) => Math.round(rad * RAD);
const isEmptyObj = (x) => x && typeof x === "object" && !Array.isArray(x) && !Object.keys(x).length;

/** Drop empty/undefined override entries so "changed" badges and the export stay clean. */
function prune(w) {
  const out = {};
  for (const key of ["salves", "turrets", "mounted"]) {
    const entries = Object.entries(w[key] || {})
      .map(([k, v]) => {
        if (!v || typeof v !== "object") return [k, v];
        const inner = Object.fromEntries(
          Object.entries(v)
            .map(([ik, iv]) => [ik, iv && typeof iv === "object" ? Object.fromEntries(Object.entries(iv).filter(([, x]) => x != null)) : iv])
            .filter(([, iv]) => iv != null && iv !== false && !isEmptyObj(iv)),
        );
        return [k, inner];
      })
      .filter(([, v]) => v != null && !isEmptyObj(v));
    if (entries.length) out[key] = Object.fromEntries(entries);
  }
  if (w.extraBoxes?.length) out.extraBoxes = w.extraBoxes;
  if (w.added?.length) out.added = w.added;
  return Object.keys(out).length ? out : undefined;
}

function ammoVariant(w) {
  const id = w.ammoId.toUpperCase();
  for (const [token, label] of [["SMOKE", "smoke"], ["HEAT", "HEAT"], ["_AP_", "AP"], ["_HE_", "HE"], ["CLUSTER", "cluster"], ["NAPALM", "napalm"]]) {
    if (id.includes(token)) return label;
  }
  return damageFamilyLabel(w.ammo?.family).toLowerCase() || `weapon ${w.ti + 1}.${w.mi + 1}`;
}

export default function WeaponsEditor({ unit, base, set }) {
  const { game } = useProject();
  const loadout = base.weapon && game.weapons[base.weapon];
  const [openSlot, setOpenSlot] = useState(null);
  const [swapSlot, setSwapSlot] = useState(null);
  const [adding, setAdding] = useState(null); // { turret, coax } while picking ammo for a new weapon

  if (!loadout || !loadout.turrets.length) return <p className="muted tab-empty">This unit is unarmed.</p>;

  const ov = normalizeWeapons(loadout, unit.weapons || {});
  const update = (fn) => set({ weapons: prune(fn(structuredClone(ov))) });
  const patchMounted = (slot, patch) =>
    update((w) => {
      w.mounted = { ...w.mounted, [slot]: { ...w.mounted?.[slot], ...patch } };
      return w;
    });

  const mounted = effectiveMounted(game, loadout, ov);
  const salvos = boxSalvos(loadout, ov);
  const vanillaBoxes = loadout.salves.length;
  const canAddBox = salvos.length < MAX_BOXES;
  const conflicts = boxConflicts(game, loadout, ov);
  const empties = emptyBoxes(game, loadout, ov);
  const conflictSlots = new Set(conflicts.flatMap((c) => c.weapons.map((w) => w.slot)));

  // Vanilla often gives several rounds of one gun the same name (M252 HE and M252 smoke): disambiguate.
  const baseName = (w) => cleanGameText(w.ammo?.name || w.ammoId);
  const nameOf = (w) =>
    mounted.filter((x) => baseName(x) === baseName(w)).length > 1 ? `${baseName(w)} (${ammoVariant(w)})` : baseName(w);
  const usersOf = (box) => mounted.filter((w) => w.box === box);
  const originalOf = (slot) => {
    const [ti, mi] = slot.split(".").map(Number);
    return loadout.turrets[ti].mounted[mi];
  };

  /** Move a weapon to a box index; "new" appends a box first. */
  function moveTo(slot, target) {
    update((w) => {
      const original = originalOf(slot);
      let box = target;
      if (target === "new") {
        w.extraBoxes = [...(w.extraBoxes || []), salvos[original.box] ?? 1];
        box = vanillaBoxes + w.extraBoxes.length - 1;
      }
      w.mounted = { ...w.mounted, [slot]: { ...w.mounted?.[slot], box: box === original.box ? undefined : box } };
      return w;
    });
  }

  const totals = weaponTotals(loadout, ov);
  const canAddWeapons = Boolean(base.blackHoleKey);

  /** Pick a box for new ammo: an existing box it can share, else a new box, else box 1. */
  function boxFor(ammo, boxes) {
    for (let box = 0; box < boxes.length; box++) {
      const req = boxRequirements(game, loadout, ov, "__new__", box);
      if (req && fitsBox(ammo, req)) return { box };
    }
    return canAddBox ? { box: "new" } : { box: 0 };
  }

  function addWeapon(turret, coax, ammoId) {
    const choice = boxFor(game.ammo[ammoId], salvos);
    update((w) => {
      let box = choice.box;
      if (box === "new") {
        w.extraBoxes = [...(w.extraBoxes || []), 10];
        box = vanillaBoxes + w.extraBoxes.length - 1;
      }
      w.added = [...(w.added || []), { id: newId(), turret, coax, ammo: ammoId, count: 1, box, fx: null }];
      return w;
    });
  }

  function patchAdded(id, patch) {
    update((w) => {
      w.added = (w.added || []).map((a) => (a.id === id ? { ...a, ...patch } : a));
      return w;
    });
  }

  function moveAdded(id, target) {
    update((w) => {
      let box = target;
      if (target === "new") {
        w.extraBoxes = [...(w.extraBoxes || []), 10];
        box = vanillaBoxes + w.extraBoxes.length - 1;
      }
      w.added = (w.added || []).map((a) => (a.id === id ? { ...a, box } : a));
      return w;
    });
  }

  /** Remove an added weapon; drop its box too if it was an added box nothing else uses. */
  function removeAdded(id) {
    const victim = (ov.added || []).find((a) => a.id === id);
    const othersOnBox = mounted.filter((w) => w.box === victim?.box && w.slot !== `add:${id}`).length;
    update((w) => {
      w.added = (w.added || []).filter((a) => a.id !== id);
      if (victim && victim.box >= vanillaBoxes && !othersOnBox) {
        w.extraBoxes = (w.extraBoxes || []).filter((_, i) => i !== victim.box - vanillaBoxes);
        for (const mo of Object.values(w.mounted || {})) if (mo.box > victim.box) mo.box -= 1;
        for (const a of w.added) if (a.box > victim.box) a.box -= 1;
      }
      return w;
    });
  }

  function addBox() {
    update((w) => {
      w.extraBoxes = [...(w.extraBoxes || []), 10];
      return w;
    });
  }

  /** Remove an added box: its weapons go back to their original box, later boxes shift down. */
  function removeBox(box) {
    update((w) => {
      w.extraBoxes = (w.extraBoxes || []).filter((_, i) => i !== box - vanillaBoxes);
      for (const [slot, mo] of Object.entries(w.mounted || {})) {
        if (mo.box === box) delete mo.box;
        else if (mo.box > box) mo.box -= 1;
        w.mounted[slot] = mo;
      }
      for (const a of w.added || []) {
        if (a.box === box) a.box = 0;
        else if (a.box > box) a.box -= 1;
      }
      return w;
    });
  }

  return (
    <div className="tab-body">
      {(conflicts.length > 0 || empties.length > 0) && (
        <div className="issues issues-error">
          <div className="issues-title">This loadout won't load in WARNO</div>
          <ul>
            {conflicts.map((c, i) => {
              const movable = c.weapons.filter((w) => w.override.ammo || w.override.stats);
              return (
                <li key={`c${i}`}>
                  Box {c.box + 1} is shared by weapons with different {c.field.label} (
                  {c.weapons.map((w) => `${nameOf(w)}: ${c.field.get(w.ammo, w.stats)}`).join(", ")}). Every weapon on one box must match.{" "}
                  {canAddBox &&
                    movable.map((w) => (
                      <button key={w.slot} type="button" className="link" onClick={() => moveTo(w.slot, "new")}>
                        Move {nameOf(w)} to a new box
                      </button>
                    ))}
                </li>
              );
            })}
            {empties.map((box) => (
              <li key={`e${box}`}>
                Box {box + 1} has no weapons.{" "}
                {box >= vanillaBoxes ? (
                  <button type="button" className="link" onClick={() => removeBox(box)}>
                    Remove it
                  </button>
                ) : (
                  "Move a weapon back into it."
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <h3 className="section-title">
        Ammo boxes <span className="muted small">({salvos.length} of max {MAX_BOXES})</span>
      </h3>
      <p className="muted small">
        Each box holds salvos for the weapons assigned to it. Weapons sharing a box share its ammo and must agree on{" "}
        {BOX_MATCH_FIELDS.map((f) => f.label).join(", ")}. Vanilla loadouts use 1–{MAX_BOXES} boxes.
      </p>
      <div className="stat-grid">
        {salvos.map((n, box) => {
          const extra = box >= vanillaBoxes;
          const users = usersOf(box);
          return (
            <div key={box} className={`box-card ${extra ? "box-card-extra" : ""}`}>
              <StatControl
                stat={{ key: `box${box}`, label: `Box ${box + 1}${extra ? " (added)" : ""}`, step: 1 }}
                value={n}
                baseValue={extra ? n : loadout.salves[box]}
                hardMin={0}
                onChange={(v) =>
                  update((w) => {
                    if (extra) {
                      w.extraBoxes = [...w.extraBoxes];
                      w.extraBoxes[box - vanillaBoxes] = Math.round(v);
                    } else {
                      w.salves = { ...w.salves, [box]: v === loadout.salves[box] ? undefined : Math.round(v) };
                    }
                    return w;
                  })
                }
                onReset={() =>
                  update((w) => {
                    if (w.salves) delete w.salves[box];
                    return w;
                  })
                }
              />
              <div className="box-users small">
                {users.length ? users.map((w) => <span key={w.slot}>{nameOf(w)}</span>) : <em className="muted">no weapons</em>}
                {extra && (
                  <button type="button" className="link danger" onClick={() => removeBox(box)}>
                    remove box
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <Button size="sm" onClick={addBox} disabled={!canAddBox} title={canAddBox ? "" : `Vanilla never uses more than ${MAX_BOXES} boxes`}>
        + Add ammo box
      </Button>

      <h3 className="section-title">Firing arcs</h3>
      <TurretArcs
        type={silhouetteType(base)}
        turrets={loadout.turrets.map((t, ti) => {
          const to = ov.turrets?.[ti] || {};
          return {
            facing: to.facing ?? (t.facing != null ? deg(t.facing) : 0),
            traverse: to.traverse ?? (t.traverse != null ? deg(t.traverse) : null),
            elevation: to.elevation ?? (t.elevation != null ? deg(t.elevation) : null),
            depression: to.depression ?? (t.depression != null ? -deg(t.depression) : 0),
          };
        })}
      />
      <p className="muted small">
        Turret positions come from the 3D model, so the dots are placed for illustration; the arcs use the real angles. Dashed rings rotate a full 360°;
        filled wedges are limited arcs. Positive facing turns left.
      </p>

      {loadout.turrets.map((t, ti) => {
        const to = ov.turrets?.[ti] || {};
        const setTurret = (key, value, baseValue) =>
          update((w) => {
            w.turrets = { ...w.turrets, [ti]: { ...w.turrets?.[ti], [key]: value === baseValue ? undefined : value } };
            return w;
          });
        const angle = (key, label, raw, opts) =>
          raw != null && (
            <StatControl
              stat={{ key, label, unit: opts.unit || "°", step: opts.step || 1, hint: opts.hint }}
              value={to[key] ?? opts.toUi(raw)}
              baseValue={opts.toUi(raw)}
              range={opts.range}
              hardMin={opts.min}
              hardMax={opts.max}
              onChange={(v) => setTurret(key, v, opts.toUi(raw))}
              onReset={() => setTurret(key, undefined)}
            />
          );
        return (
          <div key={ti} className="turret">
            <div className="turret-head">
              <h3>
                <span className="turret-dot" style={{ background: turretColor(ti) }} />
                Turret {ti + 1} <span className="muted small">{turretLabel(t.type)}</span>
              </h3>
            </div>
            {(t.rotationSpeed != null || t.traverse != null || t.elevation != null) && (
              <div className="stat-grid turret-stats">
                {angle("rotationSpeed", "Rotation speed", t.rotationSpeed, { unit: "°/s", toUi: deg, range: { min: 1, max: 120 }, min: 1 })}
                {angle("facing", "Facing", t.facing, { toUi: deg, step: 5, hint: "0 = forward, 180 = rear", range: { min: -90, max: 180 }, min: -180, max: 180 })}
                {angle("elevation", "Max elevation", t.elevation, { toUi: deg, range: { min: 0, max: 90 }, min: 0, max: 90 })}
                {angle("depression", "Max depression", t.depression, { toUi: (r) => -deg(r), hint: "How far below horizontal it can aim", range: { min: -39, max: 90 }, min: -90, max: 90 })}
                {angle("traverse", "Traverse (each side)", t.traverse, { toUi: deg, step: 5, range: { min: 1, max: 360 }, min: 1, max: 360 })}
              </div>
            )}
            <div className="mounted-list">
              {mounted
                .filter((w) => w.ti === ti && !w.added)
                .map((w) => (
                  <MountedWeapon
                    key={w.slot}
                    weapon={w}
                    name={nameOf(w)}
                    boxes={boxOptions(w)}
                    canAddBox={canAddBox}
                    inConflict={conflictSlots.has(w.slot)}
                    open={openSlot === w.slot}
                    onToggle={() => setOpenSlot(openSlot === w.slot ? null : w.slot)}
                    onSwap={() => setSwapSlot(w.slot)}
                    onMove={(box) => moveTo(w.slot, box)}
                    onChange={(patch) => patchMounted(w.slot, patch)}
                    onReset={() =>
                      update((x) => {
                        if (x.mounted) delete x.mounted[w.slot];
                        return x;
                      })
                    }
                  />
                ))}
              {mounted
                .filter((w) => w.added && w.ti === ti)
                .map((w) => (
                  <AddedWeapon
                    key={w.slot}
                    weapon={w}
                    name={nameOf(w)}
                    base={base}
                    boxes={boxOptions(w)}
                    canAddBox={canAddBox}
                    inConflict={conflictSlots.has(w.slot)}
                    onSwap={() => setSwapSlot(w.slot)}
                    onMove={(box) => moveAdded(w.added.id, box)}
                    onChange={(patch) => patchAdded(w.added.id, patch)}
                    onRemove={() => removeAdded(w.added.id)}
                  />
                ))}
            </div>
            {canAddWeapons && (
              <div className="add-weapon-row">
                {(() => {
                  const noMuzzle = !turretAnchors(game, base, ti).length;
                  const full = totals.weapons >= MAX_WEAPONS;
                  const why = noMuzzle ? "This turret has no muzzle point (missile launchers aren't supported yet)" : full ? `Vanilla never uses more than ${MAX_WEAPONS} weapons` : "";
                  const coaxWhy = why || (t.type !== "TwoAxis" ? "Coaxial guns need a rotating turret" : t.master != null ? "This turret is itself coaxial" : totals.turrets >= MAX_TURRETS ? `Vanilla never uses more than ${MAX_TURRETS} turrets` : "");
                  return (
                    <>
                      <Button size="sm" onClick={() => setAdding({ turret: ti, coax: false })} disabled={!!why} title={why}>
                        + Add weapon to this turret
                      </Button>
                      <Button size="sm" onClick={() => setAdding({ turret: ti, coax: true })} disabled={!!coaxWhy} title={coaxWhy}>
                        + Add coaxial gun
                      </Button>
                      {(why || coaxWhy) && <span className="muted small">{why || coaxWhy}</span>}
                    </>
                  );
                })()}
              </div>
            )}
          </div>
        );
      })}
      {!canAddWeapons && (
        <p className="muted small">Adding weapons works for ground vehicles so far; infantry and aircraft use different 3D depictions.</p>
      )}
      {canAddWeapons && (
        <p className="muted small">
          {totals.weapons}/{MAX_WEAPONS} weapons, {totals.turrets}/{MAX_TURRETS} turrets (vanilla maximums). New weapons fire from the turret's existing
          muzzle point; a coaxial gun follows the turret's aim. The unit gets its own copy of the 3D depiction on export.
        </p>
      )}

      {swapSlot && (
        <AmmoPicker
          weapon={mounted.find((w) => w.slot === swapSlot)}
          requirements={boxRequirements(game, loadout, ov, swapSlot)}
          canAddBox={canAddBox}
          onClose={() => setSwapSlot(null)}
          onPick={(ammoId, needsNewBox) => {
            const w = mounted.find((x) => x.slot === swapSlot);
            if (w.added) {
              patchAdded(w.added.id, { ammo: ammoId, fx: null });
              if (needsNewBox) moveAdded(w.added.id, "new");
              setSwapSlot(null);
              return;
            }
            update((x) => {
              // a different ammo has different base stats, so stat edits don't carry over
              const mo = { ...x.mounted?.[swapSlot], ammo: ammoId === w.original.ammo ? undefined : ammoId, stats: undefined };
              if (needsNewBox) {
                x.extraBoxes = [...(x.extraBoxes || []), salvos[w.box] ?? 1];
                mo.box = vanillaBoxes + x.extraBoxes.length - 1;
              }
              x.mounted = { ...x.mounted, [swapSlot]: mo };
              return x;
            });
            setSwapSlot(null);
          }}
        />
      )}
      {adding && (
        <AmmoPicker
          weapon={{ turretType: adding.coax ? "TwoAxis" : loadout.turrets[adding.turret].type, ammoId: null, ammo: null, override: {} }}
          requirements={null}
          canAddBox={canAddBox}
          title={adding.coax ? `Add a coaxial gun to turret ${adding.turret + 1}` : `Add a weapon to turret ${adding.turret + 1}`}
          onClose={() => setAdding(null)}
          onPick={(ammoId) => {
            addWeapon(adding.turret, adding.coax, ammoId);
            setAdding(null);
          }}
        />
      )}
    </div>
  );

  function boxOptions(w) {
    return salvos.map((_, box) => {
      const req = boxRequirements(game, loadout, ov, w.slot, box);
      return {
        box,
        users: usersOf(box).filter((x) => x.slot !== w.slot).map(nameOf),
        fits: !w.ammo || fitsBox(w.ammo, req, w.stats),
        requirement: req ? `${req.values.shotsPerSalvo} shot${req.values.shotsPerSalvo === 1 ? "" : "s"}/salvo` : null,
      };
    });
  }
}

/** A weapon added in the builder (existing turret or coaxial). */
function AddedWeapon({ weapon: w, name, base, boxes, canAddBox, inConflict, onSwap, onMove, onChange, onRemove }) {
  const { game } = useProject();
  const a = w.added;
  const fx = a.fx || defaultFiringEffect(game, base, a.turret, a.ammo);
  const iconUrl = vanillaWeaponUrl(game.weaponIcons[w.ammo?.icon]);
  const maxRange = Math.max(w.stats.range || 0, w.stats.rangeHeli || 0, w.stats.rangeAir || 0);
  return (
    <div className={`mounted mounted-added ${inConflict ? "mounted-conflict" : ""}`}>
      <div className="mounted-row">
        {iconUrl && <img className="weapon-icon" src={iconUrl} alt="" />}
        <div className="mounted-name">
          <strong>{name}</strong>
          <span className="tag-custom">{a.coax ? "coaxial" : "added"}</span>
          <div className="muted small">
            {ammoCategoryLabel(w.ammo?.category)} · {damageFamilyLabel(w.ammo?.family)} {w.stats.power} · {maxRange} GRU · {w.stats.shotsPerSalvo} shot
            {w.stats.shotsPerSalvo === 1 ? "" : "s"}/salvo
          </div>
          <div className="mounted-box small">
            <select className="box-select" value={a.box} onChange={(e) => onMove(e.target.value === "new" ? "new" : Number(e.target.value))} aria-label="Ammo box">
              {boxes.map((b) => (
                <option key={b.box} value={b.box} disabled={!b.fits && b.box !== a.box}>
                  Box {b.box + 1}
                  {b.users.length ? ` with ${[...new Set(b.users)].join(", ")}` : b.box === a.box ? " (only this weapon)" : " (empty)"}
                  {!b.fits && b.box !== a.box ? ` (needs ${b.requirement})` : ""}
                </option>
              ))}
              {canAddBox && <option value="new">+ New box</option>}
            </select>
            <select className="box-select" value={fx || ""} onChange={(e) => onChange({ fx: e.target.value })} aria-label="Firing effect">
              {!fx && <option value="">Choose a firing effect…</option>}
              {game.firingEffects.map((f) => (
                <option key={f} value={f}>
                  Fires like: {f.replace(/^Weapon_/, "").replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </div>
        </div>
        <label className="mounted-count" title="Number of these weapons (NbWeapons)">
          ×
          <input type="number" min={1} value={a.count} onChange={(e) => onChange({ count: Math.max(1, Math.round(Number(e.target.value))) })} />
        </label>
        <Button size="sm" onClick={onSwap}>Swap ammo</Button>
        <button type="button" className="link small danger" onClick={onRemove}>
          remove
        </button>
      </div>
    </div>
  );
}

function MountedWeapon({ weapon: w, name, boxes, canAddBox, inConflict, open, onToggle, onSwap, onMove, onChange, onReset }) {
  const { game } = useProject();
  const { ammo, original, override, stats } = w;
  const ranges = (ammo && game.ammoRanges[ammo.category]) || {};
  const changed = Object.keys(override).length > 0;
  const maxRange = Math.max(stats.range || 0, stats.rangeHeli || 0, stats.rangeAir || 0);
  const sharing = boxes.find((b) => b.box === w.box)?.users || [];
  const look = override.look || {};

  const setStat = (key, value) => {
    const next = { ...override.stats, [key]: value };
    if (value === ammo.stats[key]) delete next[key];
    onChange({ stats: next });
  };
  const setLook = (key, value) => onChange({ look: { ...look, [key]: value === ammo[key] ? undefined : value } });

  const groups = useMemo(() => {
    const out = {};
    for (const s of AMMO_STATS) if (ammo?.stats[s.key] != null) (out[s.group] ||= []).push(s);
    return out;
  }, [ammo]);

  const icon = look.icon || ammo?.icon;
  const iconUrl = vanillaWeaponUrl(game.weaponIcons[icon]);

  return (
    <div className={`mounted ${changed ? "mounted-changed" : ""} ${inConflict ? "mounted-conflict" : ""}`}>
      <div className="mounted-row">
        {iconUrl && <img className="weapon-icon" src={iconUrl} alt="" />}
        <div className="mounted-name">
          <strong>{name}</strong>
          {override.ammo && <span className="tag-custom">swapped</span>}
          {original.hidden && <span className="muted small"> (hidden in UI)</span>}
          <div className="muted small">
            {ammoCategoryLabel(ammo?.category)} · {damageFamilyLabel(ammo?.family)} {stats.power} · {maxRange} GRU
            {stats.accuracy != null && ` · ${stats.accuracy}% acc`} · {stats.shotsPerSalvo} shot{stats.shotsPerSalvo === 1 ? "" : "s"}/salvo
          </div>
          <div className="mounted-box small">
            <select
              className="box-select"
              value={w.box}
              onChange={(e) => onMove(e.target.value === "new" ? "new" : Number(e.target.value))}
              aria-label="Ammo box"
            >
              {boxes.map((b) => (
                <option key={b.box} value={b.box} disabled={!b.fits && b.box !== w.box}>
                  Box {b.box + 1}
                  {b.users.length ? ` with ${[...new Set(b.users)].join(", ")}` : b.box === w.box ? " (only this weapon)" : " (empty)"}
                  {!b.fits && b.box !== w.box ? ` (needs ${b.requirement})` : ""}
                </option>
              ))}
              {canAddBox && <option value="new">+ New box</option>}
            </select>
            {sharing.length > 0 && <span className="muted">shares ammo</span>}
          </div>
        </div>
        <label className="mounted-count" title="Number of these weapons (NbWeapons)">
          ×
          <input
            type="number"
            min={1}
            value={override.count ?? original.count}
            onChange={(e) => {
              const v = Math.max(1, Math.round(Number(e.target.value)));
              onChange({ count: v === original.count ? undefined : v });
            }}
          />
        </label>
        <Button size="sm" onClick={onSwap}>Swap ammo</Button>
        <Button size="sm" variant={open ? "primary" : "default"} onClick={onToggle}>
          {open ? "Close" : "Edit"}
        </Button>
        {changed && (
          <button type="button" className="link small" onClick={onReset}>
            reset
          </button>
        )}
      </div>
      {open && ammo && (
        <div className="mounted-stats">
          {Object.entries(groups).map(([group, list]) => (
            <div key={group}>
              <h4 className="mini-title">{group}</h4>
              {group === "Trajectory" && ammo.stats.arcAngle != null && (
                <TrajectoryChart
                  angle={stats.arcAngle}
                  baseAngle={ammo.stats.arcAngle}
                  rangeMax={stats.range}
                  rangeMin={stats.rangeMin}
                  speed={stats.projectileSpeed}
                  baseSpeed={ammo.stats.projectileSpeed}
                />
              )}
              <div className="stat-grid">
                {list.map((s) => (
                  <StatControl
                    key={s.key}
                    stat={s.key === "shotsPerSalvo" && sharing.length ? { ...s, label: `${s.label} (must match box)` } : s}
                    value={stats[s.key]}
                    baseValue={ammo.stats[s.key]}
                    range={s.power ? game.powerRanges[ammo.family] : ranges[s.key]}
                    hardMin={s.power ? 1 : s.hardMin ?? 0}
                    hardMax={s.power ? game.hardLimits[ammo.family] : s.hardMax}
                    onChange={(v) => setStat(s.key, v)}
                    onReset={() => setStat(s.key, ammo.stats[s.key])}
                  />
                ))}
              </div>
            </div>
          ))}

          <h4 className="mini-title">Look &amp; sound</h4>
          <div className="look-grid">
            <label className="field">
              <span className="field-label">Impact effect &amp; sound</span>
              <select className="input" value={look.impact || ammo.impact || ""} onChange={(e) => setLook("impact", e.target.value)}>
                {game.impactPresets.map((k) => (
                  <option key={k} value={k}>
                    {impactLabel(k)}
                    {k === ammo.impact ? " (original)" : ""}
                  </option>
                ))}
              </select>
              <span className="field-hint">Explosion/hit effects and impact sounds on ground, water, buildings, vehicles and aircraft.</span>
            </label>
            <label className="field">
              <span className="field-label">Weapon icon</span>
              <span className="icon-select">
                <span className="icon-preview">{iconUrl ? <img src={iconUrl} alt="" /> : <em className="muted small">no preview</em>}</span>
                <select className="input" value={icon || ""} onChange={(e) => setLook("icon", e.target.value)}>
                  {Object.entries(game.weaponIcons)
                    .sort((a, b) => a[1].localeCompare(b[1]))
                    .map(([tex, file]) => (
                      <option key={tex} value={tex}>
                        {file.replace(/_/g, " ")}
                        {tex === ammo.icon ? " (original)" : ""}
                      </option>
                    ))}
                </select>
              </span>
              <span className="field-hint">The picture shown in the unit's weapon panel.</span>
            </label>
          </div>
          <p className="muted small">
            Firing flash and firing sound belong to the unit's 3D depiction rather than the ammo, so they don't change here yet. Edits only affect
            this unit: the ammo is copied under a new name on export.
          </p>
        </div>
      )}
    </div>
  );
}

/** "CanonGrosAPFDSM1Abrams" -> "Canon Gros APFDS M1 Abrams" */
function impactLabel(key) {
  return key.replace(/([a-z])([A-Z0-9])/g, "$1 $2").replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2");
}

function AmmoPicker({ weapon, requirements, canAddBox, onPick, onClose, title }) {
  const { game } = useProject();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState(weapon.ammo?.category || "");
  const [onlyFits, setOnlyFits] = useState(false);
  const categories = useMemo(() => [...new Set(Object.values(game.ammo).map((a) => a.category))].sort(), [game]);

  const { rows, hiddenMount } = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    let hidden = 0;
    const list = [];
    for (const [id, a] of Object.entries(game.ammo)) {
      if (category && a.category !== category) continue;
      if (!words.every((w) => `${id} ${a.name}`.toLowerCase().includes(w))) continue;
      if (mountProblem(weapon.turretType, a.projectile)) {
        hidden++;
        continue;
      }
      const fits = fitsBox(a, requirements);
      if (!fits && (onlyFits || !canAddBox)) continue;
      list.push({ id, a, fits });
    }
    // ammo whose display name matches the search beats ones matched only by internal id ("M240" vs a 240 mm howitzer)
    const nameHit = (a) => words.length > 0 && words.every((w) => cleanGameText(a.name).toLowerCase().includes(w));
    list.sort(
      (x, y) =>
        Number(y.fits) - Number(x.fits) || Number(nameHit(y.a)) - Number(nameHit(x.a)) || (y.a.stats.power || 0) - (x.a.stats.power || 0),
    );
    return { rows: list, hiddenMount: hidden };
  }, [game, query, category, onlyFits, weapon, requirements, canAddBox]);

  const req = requirements?.values;
  return (
    <Modal title={title || `Swap ammunition: ${turretLabel(weapon.turretType)}`} onClose={onClose} size="lg">
      <div className="picker-filters">
        <input className="input" autoFocus placeholder="Search, e.g. 120mm, tow, m2hb…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">All weapon classes</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {ammoCategoryLabel(c)}
            </option>
          ))}
        </select>
        {req && canAddBox && (
          <label className="check">
            <input type="checkbox" checked={onlyFits} onChange={(e) => setOnlyFits(e.target.checked)} />
            only ammo that fits the current box
          </label>
        )}
      </div>
      <p className="muted small">
        {req
          ? `This weapon shares box ${requirements.box + 1}, so its ammo must match: ${BOX_MATCH_FIELDS.map((f) => `${f.label} ${req[f.key]}`).join(", ")}. ${
              canAddBox
                ? 'Ammo marked "new box" is moved to a new ammo box automatically. '
                : `The loadout already has ${MAX_BOXES} boxes, so only matching ammo is shown. `
            }`
          : ""}
        {hiddenMount > 0 && `${hiddenMount} ammo types hidden: they can't be fired from a ${turretLabel(weapon.turretType)}. `}
        Swapping keeps the original gun's firing animation and sound.
      </p>
      <div className="picker-count">
        <span>{rows.length} ammunition types{rows.length > 150 ? " (showing 150)" : ""}</span>
      </div>
      <table className="ammo-table">
        <thead>
          <tr>
            <th />
            <th>Name</th>
            <th>Class</th>
            <th>Type</th>
            <th>Power</th>
            <th>Range</th>
            <th>Acc.</th>
            <th>Shots</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 150).map(({ id, a, fits }) => {
            const url = vanillaWeaponUrl(game.weaponIcons[a.icon]);
            return (
              <tr key={id} className={id === weapon.ammoId ? "current" : ""} onClick={() => onPick(id, !fits)} title={id}>
                <td className="ammo-icon-cell">{url && <img src={url} alt="" loading="lazy" />}</td>
                <td>{cleanGameText(a.name)}</td>
                <td>{ammoCategoryLabel(a.category)}</td>
                <td>{damageFamilyLabel(a.family)}</td>
                <td>{a.stats.power}</td>
                <td>{Math.max(a.stats.range || 0, a.stats.rangeHeli || 0, a.stats.rangeAir || 0)}</td>
                <td>{a.stats.accuracy ?? "–"}</td>
                <td>{a.stats.shotsPerSalvo}</td>
                <td>{!fits && <span className="box-chip box-own">new box</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Modal>
  );
}
