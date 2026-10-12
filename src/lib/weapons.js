// Rules for weapon loadouts, shared by the editor, validation and export.
//
// A loadout has ammo boxes (Salves) and turrets holding mounted weapons; each mounted weapon
// fires one ammunition and draws from one box. Two engine rules matter when editing:
//   1. Every ammunition drawing from the same box must agree on salvo shape
//      (ShotsCountPerSalvo — the engine refuses to load otherwise — plus two display fields
//      that never differ in vanilla). Fix: give the weapon its own box.
//   2. Mount types: bombs only work from bomb bays (which carry the bomb trajectory config),
//      bomb bays only drop bombs, and grenades only come from infantry weapons.

export const BOX_MATCH_FIELDS = [
  { key: "shotsPerSalvo", label: "shots per salvo", get: (a, stats) => stats.shotsPerSalvo },
  { key: "salvoDisplay", label: "ammo shown per salvo", get: (a) => a.salvoDisplay },
  { key: "simultaneous", label: "simultaneous shots", get: (a) => a.simultaneous },
];

export const MAX_BOXES = 5; // vanilla never exceeds 5; the unit panel may not show more
export const MAX_TURRETS = 5; // vanilla maximum per loadout
export const MAX_WEAPONS = 6; // vanilla maximum mounted weapons per loadout

// Ammo fired as a stream (machine guns, autocannons) uses a continuous-fire depiction operator;
// everything else (cannons, rockets, missiles, howitzers) fires single projectiles.
const CONTINUOUS_CATEGORIES = new Set([
  "MinMax_MMG_HMG", "MinMax_Gatling", "MinMax_AutocanonHE", "MinMax_DCA", "MinMax_Assault_rifle",
  "MinMax_inf_MMG", "MinMax_SMG", "MinMax_FLAME",
]);
export const fireKind = (ammo) => (CONTINUOUS_CATEGORIES.has(ammo?.category) ? "ContinuousFire" : "InstantFire");

const TURRET_LABELS = { TwoAxis: "rotating turret", Infanterie: "infantry weapon", Unit: "fixed mount", Bombardier: "bomb bay" };
export const turretLabel = (type) => TURRET_LABELS[type] || type;

/** Can ammunition with this projectile type be fired from this turret type? */
export function mountProblem(turretType, projectile) {
  if (turretType === "Bombardier" && projectile !== "Bombe") return "bomb bays can only drop bombs";
  if (projectile === "Bombe" && turretType !== "Bombardier") return "bombs need a bomb bay";
  if (projectile === "Grenade" && turretType !== "Infanterie") return "grenades can only be thrown by infantry";
  return null;
}

/**
 * Weapon overrides store extra ammo boxes as `extraBoxes: [salvos…]` (appended after the vanilla
 * boxes) and per-weapon `mounted[slot].box` (any box index). Older projects used
 * `mounted[slot].ownBox`; convert those so every caller sees one shape.
 */
export function normalizeWeapons(loadout, ov = {}) {
  if (!ov || !loadout) return ov || {};
  const extraBoxes = [...(ov.extraBoxes || [])];
  const mounted = {};
  for (const [slot, mo] of Object.entries(ov.mounted || {})) {
    const m = { ...mo };
    if (m.ownBox) {
      const [ti, mi] = slot.split(".").map(Number);
      const original = loadout.turrets[ti]?.mounted[mi];
      extraBoxes.push(m.ownBoxSalvos ?? loadout.salves[original?.box] ?? 1);
      m.box = loadout.salves.length + extraBoxes.length - 1;
    }
    delete m.ownBox;
    delete m.ownBoxSalvos;
    mounted[slot] = m;
  }
  return { ...ov, extraBoxes, mounted };
}

export const boxCount = (loadout, ov) => loadout.salves.length + (ov?.extraBoxes?.length || 0);

/** Salvos in each box after overrides: vanilla boxes (possibly edited) then extra boxes. */
export function boxSalvos(loadout, ov) {
  return [...loadout.salves.map((n, i) => ov?.salves?.[i] ?? n), ...(ov?.extraBoxes || [])];
}

/** Every mounted weapon with the (normalized) override applied. */
export function effectiveMounted(game, loadout, override = {}) {
  const ov = normalizeWeapons(loadout, override);
  const out = [];
  loadout.turrets.forEach((t, ti) =>
    t.mounted.forEach((m, mi) => {
      const slot = `${ti}.${mi}`;
      const mo = ov.mounted?.[slot] || {};
      const ammoId = mo.ammo || m.ammo;
      const ammo = game.ammo[ammoId];
      out.push({
        slot,
        ti,
        mi,
        turretType: t.type,
        original: m,
        override: mo,
        ammoId,
        ammo,
        stats: { ...(ammo?.stats || {}), ...(mo.stats || {}) },
        box: mo.box ?? m.box,
      });
    }),
  );
  // Weapons added in the builder: on an existing turret, or on a new coaxial turret slaved to it.
  for (const a of ov.added || []) {
    const ammo = game.ammo[a.ammo];
    const host = loadout.turrets[a.turret];
    out.push({
      slot: `add:${a.id}`,
      ti: a.turret,
      mi: null,
      added: a,
      turretType: a.coax ? "TwoAxis" : host?.type,
      original: { ammo: a.ammo, count: a.count, box: a.box, hidden: false },
      override: {},
      ammoId: a.ammo,
      ammo,
      stats: { ...(ammo?.stats || {}) },
      box: a.box,
    });
  }
  return out;
}

/** Muzzle points (depiction anchors) usable for a new weapon on turret ti, or [] if none. */
export function turretAnchors(game, base, ti) {
  const slots = game.depictions?.[base.blackHoleKey]?.slots || {};
  const turret = game.weapons[base.weapon]?.turrets[ti];
  for (const m of turret?.mounted || []) {
    const anchors = slots[m.slot]?.anchors;
    if (anchors?.length) return anchors;
  }
  return [];
}

/** Firing effect (FX + sound) to use for new ammo: its own Weapon_* if the game has one. */
export function defaultFiringEffect(game, base, ti, ammoId) {
  const own = `Weapon_${String(ammoId).replace(/^Ammo_/, "")}`;
  if (game.firingEffects?.includes(own)) return own;
  const slots = game.depictions?.[base.blackHoleKey]?.slots || {};
  const turret = game.weapons[base.weapon]?.turrets[ti];
  return turret?.mounted.map((m) => slots[m.slot]?.fx).find(Boolean) || null;
}

export function weaponTotals(loadout, override) {
  const added = override?.added || [];
  return {
    weapons: loadout.turrets.reduce((n, t) => n + t.mounted.length, 0) + added.length,
    turrets: loadout.turrets.length + added.filter((a) => a.coax).length,
  };
}

/** Boxes whose weapons disagree on a must-match field. */
export function boxConflicts(game, loadout, override) {
  const byBox = new Map();
  for (const w of effectiveMounted(game, loadout, override)) {
    if (!w.ammo) continue;
    if (!byBox.has(w.box)) byBox.set(w.box, []);
    byBox.get(w.box).push(w);
  }
  const conflicts = [];
  for (const [box, weapons] of byBox) {
    for (const f of BOX_MATCH_FIELDS) {
      const values = new Set(weapons.map((w) => f.get(w.ammo, w.stats)));
      if (values.size > 1) conflicts.push({ box, field: f, weapons, values: [...values] });
    }
  }
  return conflicts;
}

/** Box indices no weapon draws from. */
export function emptyBoxes(game, loadout, override) {
  const used = new Set(effectiveMounted(game, loadout, override).map((w) => w.box));
  return Array.from({ length: boxCount(loadout, normalizeWeapons(loadout, override)) }, (_, i) => i).filter((i) => !used.has(i));
}

/** The values a weapon must match to join a box (null if no other weapon uses it). */
export function boxRequirements(game, loadout, override, slot, box) {
  const all = effectiveMounted(game, loadout, override);
  const me = all.find((w) => w.slot === slot);
  const target = box ?? me?.box;
  const partners = all.filter((w) => w.slot !== slot && w.box === target && w.ammo);
  if (!partners.length) return null;
  return {
    box: target,
    partners,
    values: Object.fromEntries(BOX_MATCH_FIELDS.map((f) => [f.key, f.get(partners[0].ammo, partners[0].stats)])),
  };
}

export function fitsBox(ammo, requirements, stats = ammo.stats) {
  if (!requirements) return true;
  return BOX_MATCH_FIELDS.every((f) => f.get(ammo, stats) === requirements.values[f.key]);
}

/** What the exporter needs: extra boxes to append and weapons whose box index changes. */
export function boxPlan(loadout, override) {
  const ov = normalizeWeapons(loadout, override);
  const assign = new Map();
  loadout.turrets.forEach((t, ti) =>
    t.mounted.forEach((m, mi) => {
      const box = ov.mounted?.[`${ti}.${mi}`]?.box;
      if (box != null && box !== m.box) assign.set(`${ti}.${mi}`, box);
    }),
  );
  return { extra: ov.extraBoxes || [], assign };
}

/**
 * Weapons a squad carries, counted the way the engine does when it loads the unit: each turret
 * (one per soldier role / bone) counts once, with its largest NbWeapons. Several ammo types on one
 * turret are one weapon (e.g. an RPG-7 with VR and VL rockets is 1, not 2). Must be >= SoldierCount,
 * else "Too few weapons: squad has N weapons, but has M soldiers". Holds for all 691 vanilla squads.
 */
export function squadWeaponCount(game, base, unit = null) {
  const loadout = base.weapon && game.weapons[base.weapon];
  if (!loadout) return 0;
  const perTurret = new Map();
  for (const w of effectiveMounted(game, loadout, unit?.weapons || {})) {
    const key = w.added?.coax ? `coax:${w.slot}` : w.ti;
    const n = w.added ? w.added.count || 1 : w.override?.count ?? w.original?.count ?? 1;
    perTurret.set(key, Math.max(perTurret.get(key) || 0, n));
  }
  return [...perTurret.values()].reduce((a, b) => a + b, 0);
}

/** The mounted weapon carried by the most soldiers (usually the rifle): { slot, count, ammo }. */
export function mainSquadWeapon(loadout) {
  let best = null;
  loadout?.turrets.forEach((t, ti) =>
    t.mounted.forEach((m, mi) => {
      if (!best || m.count > best.count) best = { slot: `${ti}.${mi}`, count: m.count, ammo: m.ammo };
    }),
  );
  return best;
}
