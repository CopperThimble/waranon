import { useEffect, useMemo, useState } from "react";
import { silhouetteType, turretColor } from "../lib/diagrams";
import { firingEffectInfo, impactGroup, impactName } from "../lib/effectNames";
import { vanillaWeaponUrl } from "../lib/images";
import SearchSelect from "./SearchSelect";
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
  addKind,
  turretFireSource,
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
  const [activeTurret, setActiveTurret] = useState(null); // turret whose controls are being used: highlighted in the arcs
  const arcs = useArcsWindow();

  if (!loadout || !loadout.turrets.length) return <p className="muted tab-empty">This unit is unarmed.</p>;

  const ov = normalizeWeapons(loadout, unit.weapons || {});
  const update = (fn) => set({ weapons: prune(fn(structuredClone(ov))) });
  // current angles (edited or vanilla) in degrees, for the arc diagrams
  const arcTurrets = loadout.turrets.map((t, ti) => {
    const to = ov.turrets?.[ti] || {};
    return {
      facing: to.facing ?? (t.facing != null ? deg(t.facing) : 0),
      traverse: to.traverse ?? (t.traverse != null ? deg(t.traverse) : null),
      elevation: to.elevation ?? (t.elevation != null ? deg(t.elevation) : null),
      depression: to.depression ?? (t.depression != null ? -deg(t.depression) : 0),
    };
  });
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
  const kind = addKind(game, base); // "vehicle" | "aerial" | "infantry" | null
  const canAddWeapons = Boolean(kind);
  const infantryAmmo = handheldAmmo(game);

  /** Pick a box for new ammo: an existing box it can share, else a new box, else box 1. */
  function boxFor(ammo, boxes) {
    for (let box = 0; box < boxes.length; box++) {
      const req = boxRequirements(game, loadout, ov, "__new__", box);
      if (req && fitsBox(ammo, req)) return { box };
    }
    return canAddBox ? { box: "new" } : { box: 0 };
  }

  function addWeapon(turret, coax, ammoId, role = false) {
    // a soldier role gets its own box: infantry weapons rarely share salvo shapes
    const choice = role ? { box: canAddBox ? "new" : 0 } : boxFor(game.ammo[ammoId], salvos);
    update((w) => {
      let box = choice.box;
      if (box === "new") {
        w.extraBoxes = [...(w.extraBoxes || []), 10];
        box = vanillaBoxes + w.extraBoxes.length - 1;
      }
      w.added = [...(w.added || []), role ? { id: newId(), role: true, turret: null, coax: false, ammo: ammoId, count: 1, box, fx: null } : { id: newId(), turret, coax, ammo: ammoId, count: 1, box, fx: null }];
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
      <div ref={arcs.inlineRef}>
        <TurretArcs type={silhouetteType(base)} turrets={arcTurrets} highlight={activeTurret} />
      </div>
      <p className="muted small">
        Turret positions come from the 3D model, so the dots are placed for illustration; the arcs use the real angles. Dashed rings rotate a full 360°;
        filled wedges are limited arcs. Positive facing turns left.
      </p>

      <div ref={arcs.controlsRef}>
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
          <div key={ti} className="turret" onPointerEnter={() => setActiveTurret(ti)} onFocus={() => setActiveTurret(ti)}>
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
            {canAddWeapons && kind !== "infantry" && (
              <div className="add-weapon-row">
                {(() => {
                  const source = turretFireSource(game, base, ti);
                  const full = totals.weapons >= MAX_WEAPONS;
                  const why = !source ? "This turret has nothing to fire from (no muzzle point or missile pylons)" : full ? `Vanilla never uses more than ${MAX_WEAPONS} weapons` : "";
                  const coaxWhy = why || (t.type !== "TwoAxis" ? "Coaxial guns need a rotating turret" : t.master != null ? "This turret is itself coaxial" : totals.turrets >= MAX_TURRETS ? `Vanilla never uses more than ${MAX_TURRETS} turrets` : "");
                  return (
                    <>
                      <Button size="sm" onClick={() => setAdding({ turret: ti, coax: false })} disabled={!!why} title={why}>
                        + Add weapon to this {kind === "aerial" ? "mount" : "turret"}
                      </Button>
                      {kind === "vehicle" && (
                        <Button size="sm" onClick={() => setAdding({ turret: ti, coax: true })} disabled={!!coaxWhy} title={coaxWhy}>
                          + Add coaxial gun
                        </Button>
                      )}
                      {source?.carriage && !why && <span className="muted small">fires from this mount&apos;s missile pylons</span>}
                      {(why || (kind === "vehicle" && coaxWhy)) && <span className="muted small">{why || coaxWhy}</span>}
                    </>
                  );
                })()}
              </div>
            )}
          </div>
        );
      })}
      </div>
      {arcs.floating && (
        <aside className="arcs-float" aria-label="Firing arcs">
          <div className="arcs-float-head">
            <span>
              Firing arcs{activeTurret != null && loadout.turrets.length > 1 ? ` · Turret ${activeTurret + 1}` : ""}
            </span>
            <button type="button" className="link" onClick={arcs.dismiss} aria-label="Hide the floating firing arcs">
              Hide
            </button>
          </div>
          <TurretArcs type={silhouetteType(base)} turrets={arcTurrets} highlight={activeTurret} />
        </aside>
      )}
      {kind === "infantry" && (
        <div className="turret">
          <h4 className="section-title">New soldier roles</h4>
          <div className="mounted-list">
            {mounted
              .filter((w) => w.added?.role)
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
          <div className="add-weapon-row">
            {(() => {
              const why = totals.weapons >= MAX_WEAPONS ? `Vanilla never uses more than ${MAX_WEAPONS} weapons` : totals.turrets >= MAX_TURRETS ? `Vanilla never uses more than ${MAX_TURRETS} weapon roles` : "";
              return (
                <>
                  <Button size="sm" onClick={() => setAdding({ role: true })} disabled={!!why} title={why}>
                    + Add a soldier carrying a new weapon
                  </Button>
                  {why && <span className="muted small">{why}</span>}
                </>
              );
            })()}
          </div>
          <p className="muted small">
            Each role is carried by &quot;×N&quot; soldiers, holding the weapon the way vanilla squads do (model, pose and muzzle flash are copied from a squad that
            carries it). Only weapons some vanilla soldier carries are offered. The squad gets its own copy of its 3D depiction on export.
          </p>
        </div>
      )}
      {!canAddWeapons && <p className="muted small">This unit has no 3D depiction the builder can copy, so it can&apos;t take new weapons.</p>}
      {canAddWeapons && (
        <p className="muted small">
          {totals.weapons}/{MAX_WEAPONS} weapons, {totals.turrets}/{MAX_TURRETS} turrets (vanilla maximums).{" "}
          {kind === "vehicle" && "New weapons fire from the turret's existing muzzle point; a coaxial gun follows the turret's aim. "}
          {kind === "aerial" && "New weapons fire from the mount's gun muzzle, or launch from the pylons of the missiles already on it. "}
          The unit gets its own copy of the 3D depiction on export.
        </p>
      )}

      {swapSlot && (
        <AmmoPicker
          weapon={mounted.find((w) => w.slot === swapSlot)}
          allowed={kind === "infantry" ? infantryAmmo : null}
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
          weapon={{ turretType: adding.role ? "Infanterie" : adding.coax ? "TwoAxis" : loadout.turrets[adding.turret].type, ammoId: null, ammo: null, override: {} }}
          requirements={null}
          canAddBox={canAddBox}
          allowed={adding.role ? infantryAmmo : null}
          title={adding.role ? "Add a soldier carrying a new weapon" : adding.coax ? `Add a coaxial gun to turret ${adding.turret + 1}` : `Add a weapon to turret ${adding.turret + 1}`}
          onClose={() => setAdding(null)}
          onPick={(ammoId) => {
            addWeapon(adding.turret ?? null, !!adding.coax, ammoId, !!adding.role);
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

const handheldCache = new WeakMap();
/** Ammo some vanilla soldier carries (the only ones a new soldier role can hold). */
function handheldAmmo(game) {
  if (!handheldCache.has(game)) handheldCache.set(game, new Set(Object.keys(game.infantryWeapons || {})));
  return handheldCache.get(game);
}

/** A weapon added in the builder (existing turret, coaxial, or a new soldier role). */
/** The weapon's picture is the ammo selector (like a loadout screen): click it to swap. */
function WeaponSwap({ url, name, onSwap }) {
  return (
    <button type="button" className="weapon-swap" onClick={onSwap} title={`Swap ammo for ${name}`}>
      {url ? <img className="weapon-icon" src={url} alt="" /> : <span className="weapon-icon weapon-icon-empty">No picture</span>}
      <span className="weapon-swap-label">Swap ammo</span>
    </button>
  );
}

function AddedWeapon({ weapon: w, name, base, boxes, canAddBox, inConflict, onSwap, onMove, onChange, onRemove }) {
  const { game } = useProject();
  const [open, setOpen] = useState(false);
  const a = w.added;
  const edited = Object.keys(a.stats || {}).length > 0 || Object.values(a.look || {}).some((v) => v !== undefined);
  const fx = a.role ? null : a.fx || defaultFiringEffect(game, base, a.turret, a.ammo);
  const iconUrl = vanillaWeaponUrl(game.weaponIcons[a.look?.icon || w.ammo?.icon]);
  const maxRange = Math.max(w.stats.range || 0, w.stats.rangeHeli || 0, w.stats.rangeAir || 0);
  const sharing = boxes.find((b) => b.box === w.box)?.users || [];
  return (
    <div className={`mounted mounted-added ${edited ? "mounted-changed" : ""} ${inConflict ? "mounted-conflict" : ""}`}>
      <div className="mounted-row">
        <WeaponSwap url={iconUrl} name={name} onSwap={onSwap} />
        <div className="mounted-name">
          <strong>{name}</strong>
          <span className="tag-custom">{a.role ? "new role" : a.coax ? "coaxial" : "added"}</span>
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
            {!a.role && (
              <span className="fires-like">
                <span className="muted">Fires like</span>
                <SearchSelect
                  ariaLabel="Firing flash and sound"
                  placeholder="Search, e.g. howitzer, 125, gatling…"
                  value={fx || ""}
                  options={firingOptions(game, defaultFiringEffect(game, base, a.turret, a.ammo))}
                  onChange={(v) => onChange({ fx: v })}
                />
              </span>
            )}
          </div>
        </div>
        <label className="mounted-count" title="Number of these weapons (NbWeapons)">
          ×
          <input type="number" min={1} value={a.count} onChange={(e) => onChange({ count: Math.max(1, Math.round(Number(e.target.value))) })} />
        </label>
        <Button size="sm" variant={open ? "primary" : "default"} onClick={() => setOpen(!open)} disabled={!w.ammo}>
          {open ? "Close" : "Edit"}
        </Button>
        <button type="button" className="link small danger" onClick={onRemove}>
          remove
        </button>
      </div>
      {open && w.ammo && <AmmoEdits weapon={w} sharing={sharing} onChange={onChange} />}
    </div>
  );
}

/** Stats and look of one weapon's ammo. Edits only affect this unit: the ammo is copied on export. */
function AmmoEdits({ weapon: w, sharing, onChange }) {
  const { game } = useProject();
  const { ammo, override, stats } = w;
  const ranges = game.ammoRanges[ammo.category] || {};
  const look = override.look || {};

  const setStat = (key, value) => {
    const next = { ...override.stats, [key]: value };
    if (value === ammo.stats[key]) delete next[key];
    onChange({ stats: next });
  };
  // "" = none (smoke): null would be dropped when the edits are tidied up
  const setLook = (key, value) => onChange({ look: { ...look, [key]: value === (ammo[key] ?? "") ? undefined : value } });

  const groups = useMemo(() => {
    const out = {};
    for (const s of AMMO_STATS) if (ammo.stats[s.key] != null) (out[s.group] ||= []).push(s);
    return out;
  }, [ammo]);

  const icon = look.icon || ammo.icon;
  const iconUrl = vanillaWeaponUrl(game.weaponIcons[icon]);

  return (
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
            <SearchSelect
              ariaLabel="Impact effect and sound"
              placeholder="Search, e.g. bomb, mk84, 152, napalm…"
              value={look.impact || ammo.impact || ""}
              options={impactOptions(game, ammo.impact)}
              onChange={(v) => setLook("impact", v)}
            />
            <span className="field-hint">
              What you see and hear where the round lands (on ground, water, buildings, vehicles and aircraft). Any ammo can use any of them; it&apos;s
              only the look and sound, damage and blast radius stay as set above.
            </span>
          </label>
          <label className="field">
            <span className="field-label">Weapon icon</span>
            <span className="icon-select">
              <span className="icon-preview">{iconUrl ? <img src={iconUrl} alt="" /> : <em className="muted small">no preview</em>}</span>
              <SearchSelect
                ariaLabel="Weapon icon"
                placeholder="Search, e.g. m2, rpg, 2a46…"
                value={icon || ""}
                options={iconOptions(game, ammo.icon)}
                onChange={(v) => setLook("icon", v)}
              />
            </span>
            <span className="field-hint">The picture shown in the unit's weapon panel.</span>
          </label>
          <label className="field">
            <span className="field-label">Smoke cloud</span>
            <select
              className="input"
              value={look.smoke ?? ammo.smoke ?? ""}
              onChange={(e) => setLook("smoke", e.target.value)}
            >
              <option value="">None</option>
              {Object.entries(game.smokeClouds || {}).map(([id, c]) => (
                <option key={id} value={id}>
                  {smokeLabel(id)} · {c.radius} GRU · {c.seconds} s
                </option>
              ))}
            </select>
            <span className="field-hint">
              Leaves a smoke screen where each round lands. Vanilla smoke rounds also do almost no damage: lower HE damage and suppression above if you
              want a pure smoke round.
            </span>
          </label>
        </div>
        <p className="muted small">
          Firing flash and firing sound belong to the unit's 3D depiction rather than the ammo, so they don't change here yet. Edits only affect
          this unit: the ammo is copied under a new name on export.
        </p>
      </div>
  );
}

function MountedWeapon({ weapon: w, name, boxes, canAddBox, inConflict, open, onToggle, onSwap, onMove, onChange, onReset }) {
  const { game } = useProject();
  const { ammo, original, override, stats } = w;
  const changed = Object.keys(override).length > 0;
  const maxRange = Math.max(stats.range || 0, stats.rangeHeli || 0, stats.rangeAir || 0);
  const sharing = boxes.find((b) => b.box === w.box)?.users || [];
  const iconUrl = vanillaWeaponUrl(game.weaponIcons[override.look?.icon || ammo?.icon]);

  return (
    <div className={`mounted ${changed ? "mounted-changed" : ""} ${inConflict ? "mounted-conflict" : ""}`}>
      <div className="mounted-row">
        <WeaponSwap url={iconUrl} name={name} onSwap={onSwap} />
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
        <Button size="sm" variant={open ? "primary" : "default"} onClick={onToggle}>
          {open ? "Close" : "Edit"}
        </Button>
        {changed && (
          <button type="button" className="link small" onClick={onReset}>
            reset
          </button>
        )}
      </div>
      {open && ammo && <AmmoEdits weapon={w} sharing={sharing} onChange={onChange} />}
    </div>
  );
}

/**
 * The firing-arc diagram sits above the turret controls, so it scrolls away while you edit turret 2
 * or 3. When it's mostly out of view but turret controls are on screen, a small floating copy shows
 * instead. "Hide" dismisses it until the diagram has been back in view.
 */
function useArcsWindow() {
  const [inlineEl, inlineRef] = useState(null);
  const [controlsEl, controlsRef] = useState(null);
  const [inlineSeen, setInlineSeen] = useState(true);
  const [controlsSeen, setControlsSeen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    if (!inlineEl || !controlsEl) return undefined;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.target === inlineEl) {
            const seen = e.intersectionRatio > 0.35;
            setInlineSeen(seen);
            if (seen) setDismissed(false);
          } else setControlsSeen(e.isIntersecting);
        }
      },
      { threshold: [0, 0.35, 1] },
    );
    io.observe(inlineEl);
    io.observe(controlsEl);
    return () => io.disconnect();
  }, [inlineEl, controlsEl]);
  return { inlineRef, controlsRef, floating: !inlineSeen && controlsSeen && !dismissed, dismiss: () => setDismissed(true) };
}

/** "Descriptor_Smoke_Fumi120mm_mortier" -> "120 mm mortar smoke" */
const smokeLabel = (id) =>
  id === "Descriptor_Smoke_Fumi_smoke_grenade"
    ? "Smoke grenade"
    : `${id.replace("Descriptor_Smoke_Fumi", "").replace(/^(\d+)mm/, "$1 mm").replace("_mortier", " mortar")} smoke`;

// Option lists for the searchable pickers, built once per catalog.
const optionCache = new WeakMap();
function cached(game, key, build) {
  if (!optionCache.has(game)) optionCache.set(game, {});
  const c = optionCache.get(game);
  return (c[key] ||= build());
}
const byGroupThenLabel = (a, b) => a.group.localeCompare(b.group) || a.label.localeCompare(b.label, undefined, { numeric: true });

function impactOptions(game, original) {
  const base = cached(game, "impact", () =>
    game.impactPresets.map((k) => ({ value: k, label: impactName(k), group: impactGroup(k) })).sort(byGroupThenLabel),
  );
  return base.map((o) => (o.value === original ? { ...o, badge: "original" } : o));
}

function iconOptions(game, original) {
  const base = cached(game, "icons", () =>
    Object.entries(game.weaponIcons)
      .map(([tex, file]) => ({ value: tex, label: file.replace(/_/g, " "), image: vanillaWeaponUrl(file) }))
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true })),
  );
  return base.map((o) => (o.value === original ? { ...o, badge: "original" } : o));
}

function firingOptions(game, suggested) {
  const base = cached(game, "firing", () => game.firingEffects.map((f) => ({ value: f, ...firingEffectInfo(f) })).sort(byGroupThenLabel));
  return base.map((o) => (o.value === suggested ? { ...o, badge: "suggested" } : o));
}

function AmmoPicker({ weapon, requirements, canAddBox, onPick, onClose, title, allowed = null }) {
  const { game } = useProject();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState(weapon.ammo?.category || "");
  const [onlyFits, setOnlyFits] = useState(false);
  const [mode, setMode] = useState(""); // fire mode filter: "", "direct", "lobbed", "smoke"
  const categories = useMemo(() => [...new Set(Object.values(game.ammo).map((a) => a.category))].sort(), [game]);

  const { rows, hiddenMount } = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    let hidden = 0;
    const list = [];
    for (const [id, a] of Object.entries(game.ammo)) {
      if (allowed && !allowed.has(id)) continue;
      if (category && a.category !== category) continue;
      if ((mode === "direct" && a.indirect) || (mode === "lobbed" && !a.indirect) || (mode === "smoke" && !a.smoke)) continue;
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
  }, [game, query, category, mode, onlyFits, weapon, requirements, canAddBox, allowed]);

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
        <select
          className="input"
          value={mode}
          // a fire mode cuts across weapon classes (lobbed rounds are mortars, howitzers, bombs…), so widen to all classes
          onChange={(e) => {
            setMode(e.target.value);
            if (e.target.value) setCategory("");
          }}
          aria-label="Fire mode"
        >
          <option value="">Any fire mode</option>
          <option value="direct">Direct fire</option>
          <option value="lobbed">Lobbed (indirect fire)</option>
          <option value="smoke">Smoke rounds</option>
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
                <td>
                  {cleanGameText(a.name)}
                  {a.indirect && <span className="ammo-tag">lobbed</span>}
                  {a.smoke && <span className="ammo-tag">smoke</span>}
                </td>
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
