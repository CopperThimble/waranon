import { EFFECTS_BY_KEY } from "./abilities.js";
import { CUSTOM_NAMES, MAX_NAMES, MIN_NAMES, parseNameList } from "./unitNames.js";
import {
  MAX_BOXES,
  MAX_TURRETS,
  MAX_WEAPONS,
  boxConflicts,
  boxCount,
  defaultFiringEffect,
  effectiveMounted,
  addKind,
  emptyBoxes,
  mountProblem,
  normalizeWeapons,
  squadWeaponCount,
  turretFireSource,
  turretLabel,
  weaponTotals,
} from "./weapons.js";
import {
  AMMO_STATS,
  isOnTick,
  snapToTick,
  STATS,
  allAlliances,
  allNations,
  isCustomRef,
  nationSide,
  resolveUnitRef,
  tagProblem,
} from "./model.js";

/**
 * Checks a project against the game catalog.
 * errors block export; warnings are things that will export but may misbehave in-game.
 * Each issue: { scope: 'project'|'nation'|'unit'|'division', id, message }
 */
export function validateProject(project, game) {
  const errors = [];
  const warnings = [];
  const err = (scope, id, message, tab) => errors.push({ scope, id, message, tab });
  const warn = (scope, id, message, tab) => warnings.push({ scope, id, message, tab });

  if (!project.name?.trim()) err("project", null, "Project needs a name.");

  // ── Nations ────────────────────────────────────────────────────────────────
  const allianceIds = new Set(allAlliances(project).map((a) => a.id));
  for (const n of project.nations) {
    const label = n.name || n.tag || "Unnamed nation";
    const tagIssue = tagProblem(game, project, n.id, n.tag);
    if (tagIssue) err("nation", n.id, `${label}: country tag: ${tagIssue}`);
    if (!n.name?.trim()) err("nation", n.id, `${label}: name is required.`);
    if (!allianceIds.has(n.allianceId)) err("nation", n.id, `${label}: alliance no longer exists.`);
    if (!n.flagAssetId && !game.countriesByTag.has(n.baseFlagCountry))
      err("nation", n.id, `${label}: upload a flag or pick a vanilla flag.`);
    if (n.flagAssetId && !project.assets[n.flagAssetId]) err("nation", n.id, `${label}: flag image is missing.`);
    for (const c of n.voice?.clips || []) {
      if (!project.assets[c.assetId]) err("nation", n.id, `${label}: a voice clip (${c.category} / ${c.action}) lost its audio; re-record or delete it on the Voices page.`);
    }
    {
      // units that would be silent: none of their voice categories is copied or recorded for this nation
      const recorded = new Set((n.voice?.clips || []).map((c) => c.category));
      const silent = project.units.filter((u) => {
        if (u.nationTag !== n.tag) return false;
        const base = game.unitsById.get(u.baseUnitId);
        return base?.acknow?.length && !base.acknow.some((t) => game.acknow?.[t]?.countries.includes(n.voiceCountry) || recorded.has(game.acknow?.[t]?.base));
      });
      if (silent.length)
        warn("nation", n.id, `${label}: ${silent.length} unit${silent.length > 1 ? "s have" : " has"} no voice lines (${silent.slice(0, 3).map((u) => u.name).join(", ")}${silent.length > 3 ? "…" : ""}). Pick a "Voice lines" country that has them, or record lines on the Voices page.`);
    }
    if (n.unitNamesDico === CUSTOM_NAMES) {
      const { names } = parseNameList(n.customNames);
      if (!names.length) err("nation", n.id, `${label}: paste at least one unit name, or pick a vanilla name pool.`);
      else if (names.length > MAX_NAMES) err("nation", n.id, `${label}: ${names.length} unit names; keep it under ${MAX_NAMES}.`);
      else if (names.length < MIN_NAMES) warn("nation", n.id, `${label}: only ${names.length} unit names, so they'll repeat a lot in game.`);
    }
  }

  const nationTags = new Set(allNations(game, project).map((n) => n.tag));
  const abilityIds = new Set((project.abilities || []).map((a) => a.id));

  // ── Units ──────────────────────────────────────────────────────────────────
  const inAnyDivision = new Set(
    project.divisions.flatMap((d) => d.roster.flatMap((r) => [r.unit, ...(r.transports || [])])),
  );
  for (const u of project.units) {
    const label = u.name || "Unnamed unit";
    const base = game.unitsById.get(u.baseUnitId);
    if (!base) {
      err("unit", u.id, `${label}: base unit ${u.baseUnitId} not found in game data.`);
      continue;
    }
    if (!u.name?.trim()) err("unit", u.id, "A unit has no name.");
    if (!nationTags.has(u.nationTag)) err("unit", u.id, `${label}: nation "${u.nationTag}" doesn't exist.`);
    if (u.iconAssetId && !project.assets[u.iconAssetId]) err("unit", u.id, `${label}: icon image is missing.`);

    const ranges = game.ranges[base.factory] || {};
    for (const stat of STATS) {
      if (!(stat.key in u.stats)) continue;
      const v = u.stats[stat.key];
      if (base.stats[stat.key] == null) continue;
      if (typeof v !== "number" || !Number.isFinite(v)) {
        err("unit", u.id, `${label}: ${stat.label} must be a number.`, stat.tab);
        continue;
      }
      if (!stat.decimals && !Number.isInteger(v)) err("unit", u.id, `${label}: ${stat.label} must be a whole number.`, stat.tab);
      const hardMin = stat.hardMin ?? 0;
      if (v < hardMin) err("unit", u.id, `${label}: ${stat.label} can't be below ${hardMin}.`, stat.tab);
      if (stat.hardMax != null && v > stat.hardMax) err("unit", u.id, `${label}: ${stat.label} can't exceed ${stat.hardMax}.`, stat.tab);
      if (stat.armor) {
        const max = game.hardLimits[base.armorFamily] || 1;
        if (!Number.isInteger(v) || v < 1 || v > max)
          err("unit", u.id, `${label}: ${stat.label} armor must be a whole number 1–${max} (game table size).`, stat.tab);
        continue;
      }
      const r = ranges[stat.key];
      if (r && (v < r.min || v > r.max))
        warn("unit", u.id, `${label}: ${stat.label} ${v} is outside the vanilla ${base.factory} range (${r.min}–${r.max}).`, stat.tab);
    }
    if (!inAnyDivision.has(`custom:${u.id}`))
      warn("unit", u.id, `${label}: not in any division, so it won't be selectable in-game.`);

    validateWeapons(u, base, label, game, (s, id, m) => err(s, id, m, "weapons"), (s, id, m) => warn(s, id, m, "weapons"));
    // In vanilla, infantry health is always one point per soldier.
    const soldiers = u.stats.soldiers ?? base.stats.soldiers;
    const health = u.stats.health ?? base.stats.health;
    if (soldiers != null) {
      const carried = squadWeaponCount(game, base, u);
      if (carried < soldiers)
        err(
          "unit",
          u.id,
          `${label}: ${soldiers} soldiers but only ${carried} weapons; the game refuses to load a squad where some soldiers have no weapon. Raise a weapon count or lower the squad size.`,
          "stats",
        );
    }
    if (soldiers != null && soldiers !== health)
      warn("unit", u.id, `${label}: ${soldiers} soldiers but ${health} health; vanilla infantry always has one health point per soldier.`, "stats");
    for (const id of u.abilities?.custom || []) {
      if (!abilityIds.has(id)) err("unit", u.id, `${label}: uses a custom ability that no longer exists.`, "abilities");
    }
  }

  // ── Custom abilities ───────────────────────────────────────────────────────
  const usedAbilities = new Set(project.units.flatMap((u) => u.abilities?.custom || []));
  for (const a of project.abilities || []) {
    const label = a.name || "Unnamed ability";
    if (!a.name?.trim()) err("ability", a.id, "An ability has no name.");
    if (!a.effects.length) err("ability", a.id, `${label}: add at least one effect.`);
    for (const e of a.effects) {
      const def = EFFECTS_BY_KEY[e.key];
      if (!def) err("ability", a.id, `${label}: unknown effect "${e.key}".`);
      else if (!Number.isFinite(Number(e.value))) err("ability", a.id, `${label}: ${def.label} needs a number.`);
      else if (def.style === "mult" && Number(e.value) <= 0) err("ability", a.id, `${label}: ${def.label} multiplier must be above 0.`);
    }
    if (a.mode !== "self" && !(a.range > 0)) err("ability", a.id, `${label}: range must be above 0.`);
    if (a.iconAssetId && !project.assets[a.iconAssetId]) err("ability", a.id, `${label}: icon image is missing.`);
    if (!usedAbilities.has(a.id)) warn("ability", a.id, `${label}: not given to any unit yet.`);
  }

  // ── Divisions ──────────────────────────────────────────────────────────────
  for (const d of project.divisions) {
    const label = d.name || "Unnamed division";
    if (!d.name?.trim()) err("division", d.id, "A division has no name.");
    if (!nationTags.has(d.nationTag)) err("division", d.id, `${label}: pick a nation.`);
    if (!game.divisionTypes.includes(d.typeToken)) err("division", d.id, `${label}: invalid division type.`);
    if (!(d.activationPoints > 0)) err("division", d.id, `${label}: activation points must be above 0.`);
    if (d.emblemAssetId && !project.assets[d.emblemAssetId]) err("division", d.id, `${label}: emblem image is missing.`);
    if (!d.roster.length) err("division", d.id, `${label}: add at least one unit.`);
    if (!d.costMatrix) err("division", d.id, `${label}: no cost matrix (pick a base division).`);

    const side = nationSide(game, project, d.nationTag);
    const seen = new Set();
    for (const r of d.roster) {
      const info = resolveUnitRef(game, project, r.unit);
      if (!info) {
        err("division", d.id, `${label}: a roster unit no longer exists (${r.unit}).`);
        continue;
      }
      if (seen.has(r.unit)) err("division", d.id, `${label}: ${info.name} is listed twice.`);
      seen.add(r.unit);
      if (!(r.cards >= 1) || !(r.perCard >= 1))
        err("division", d.id, `${label}: ${info.name} needs at least 1 card and 1 unit per card.`);
      if (!r.noTransport && !(r.transports || []).length)
        err("division", d.id, `${label}: ${info.name} needs a transport, or tick "no transport".`);
      for (const t of r.transports || []) {
        if (!resolveUnitRef(game, project, t))
          err("division", d.id, `${label}: a transport for ${info.name} no longer exists.`);
      }
      const unitSide = info.custom
        ? nationSide(game, project, info.country)
        : info.base.coalition;
      if (unitSide !== side)
        warn("division", d.id, `${label}: ${info.name} belongs to ${unitSide} but the division is ${side}.`);
      if (isCustomRef(r.unit) && r.cards > 20)
        warn("division", d.id, `${label}: ${info.name} has ${r.cards} cards; vanilla rarely exceeds 10.`);
    }
    if (d.roster.length > 90)
      warn("division", d.id, `${label}: ${d.roster.length} units; vanilla divisions max out around 90.`);
  }

  return { errors, warnings };
}

function validateWeapons(u, base, label, game, err, warn) {
  const ov = u.weapons;
  const loadout = base.weapon && game.weapons[base.weapon];
  if (!ov || !loadout) return;
  for (const [box, n] of Object.entries(ov.salves || {})) {
    if (!Number.isInteger(n) || n < 0) err("unit", u.id, `${label}: ammo box ${Number(box) + 1} needs a whole number of salvos.`);
  }
  for (const [ti, t] of Object.entries(ov.turrets || {})) {
    if (t.rotationSpeed != null && !(t.rotationSpeed > 0)) err("unit", u.id, `${label}: turret ${Number(ti) + 1} rotation speed must be above 0.`);
    if (t.traverse != null && !(t.traverse > 0 && t.traverse <= 360)) err("unit", u.id, `${label}: turret ${Number(ti) + 1} traverse must be 1–360°.`);
    // Engine limits: pitch within ±90°, and the lowest aim can't be above the highest.
    const base = loadout.turrets[ti];
    const deg = (rad) => (rad * 180) / Math.PI;
    const elevation = t.elevation ?? (base?.elevation != null ? deg(base.elevation) : null);
    const depression = t.depression ?? (base?.depression != null ? -deg(base.depression) : null);
    if (t.elevation != null && !(t.elevation >= 0 && t.elevation <= 90)) err("unit", u.id, `${label}: turret ${Number(ti) + 1} elevation must be 0–90°.`);
    if (t.depression != null && !(t.depression >= -90 && t.depression <= 90)) err("unit", u.id, `${label}: turret ${Number(ti) + 1} depression must be between -90° and 90°.`);
    if (elevation != null && depression != null && -depression > elevation + 1e-9)
      err("unit", u.id, `${label}: turret ${Number(ti) + 1} lowest aim (${-depression}°) is above its highest (${elevation}°); lower the depression limit or raise elevation.`);
    if (t.facing != null && !(t.facing >= -180 && t.facing <= 180)) err("unit", u.id, `${label}: turret ${Number(ti) + 1} facing must be between -180° and 180°.`);
  }
  // Added weapons need a depiction to clone (muzzle flash / firing sound / what the soldier holds).
  const withAdded = normalizeWeapons(loadout, ov);
  const kind = addKind(game, base);
  for (const a of withAdded.added || []) {
    const ammo = game.ammo[a.ammo];
    const where = `${label}: added ${a.role ? "soldier role" : a.coax ? "coaxial weapon" : "weapon"} ${ammo?.name || a.ammo}`;
    if (!Number.isInteger(a.count) || a.count < 1) err("unit", u.id, `${where}: weapon count must be a whole number of at least 1.`);
    if (!ammo) {
      err("unit", u.id, `${where}: ammunition not found in game data.`);
      continue;
    }
    if (!kind) {
      err("unit", u.id, `${where}: this unit has no 3D depiction the builder can copy, so it can't take new weapons.`);
      continue;
    }
    if (kind === "infantry") {
      if (!a.role) err("unit", u.id, `${where}: infantry weapons are added as a new soldier role.`);
      if (!game.infantryWeapons?.[a.ammo]) err("unit", u.id, `${where}: no vanilla soldier carries this, so there's no hand-held model for it. Pick an infantry weapon.`);
      continue;
    }
    if (a.role) {
      err("unit", u.id, `${where}: soldier roles are for infantry only.`);
      continue;
    }
    const host = loadout.turrets[a.turret];
    if (!host) {
      err("unit", u.id, `${where}: its turret no longer exists.`);
      continue;
    }
    if (a.coax && kind !== "vehicle") err("unit", u.id, `${where}: coaxial guns are for ground vehicles.`);
    if (a.coax && host.type !== "TwoAxis") err("unit", u.id, `${where}: coaxial guns need a rotating turret.`);
    if (a.coax && host.master != null) err("unit", u.id, `${where}: can't slave to a turret that is itself coaxial.`);
    const problem = mountProblem(a.coax ? "TwoAxis" : host.type, ammo.projectile);
    if (problem) err("unit", u.id, `${where}: ${problem}.`);
    if (!turretFireSource(game, base, a.turret))
      err("unit", u.id, `${where}: turret ${a.turret + 1} has nothing to fire from (no muzzle point or missile pylons in its depiction).`);
    const fx = a.fx || defaultFiringEffect(game, base, a.turret, a.ammo);
    if (!fx || !game.firingEffects.includes(fx)) err("unit", u.id, `${where}: pick a firing effect.`);
  }
  const totals = weaponTotals(loadout, withAdded);
  if (totals.weapons > MAX_WEAPONS) err("unit", u.id, `${label}: ${totals.weapons} weapons; vanilla never uses more than ${MAX_WEAPONS}.`);
  if (totals.turrets > MAX_TURRETS) err("unit", u.id, `${label}: ${totals.turrets} turrets; vanilla never uses more than ${MAX_TURRETS}.`);

  // Engine rules: mount types and matching salvo shape within a shared ammo box.
  for (const w of effectiveMounted(game, loadout, ov)) {
    const problem = w.ammo && mountProblem(w.turretType, w.ammo.projectile);
    if (problem && w.override.ammo)
      err("unit", u.id, `${label}: weapon ${w.ti + 1}.${w.mi + 1} (${w.ammo.name}) can't go on a ${turretLabel(w.turretType)}: ${problem}.`);
  }
  for (const c of boxConflicts(game, loadout, ov)) {
    const names = [...new Set(c.weapons.map((w) => `${w.ammo.name} (${c.field.get(w.ammo, w.stats)})`))].join(" vs ");
    err("unit", u.id, `${label}: ammo box ${Number(c.box) + 1} is shared by weapons with different ${c.field.label}: ${names}. Move the changed weapon to another ammo box (Weapons tab).`);
  }
  const norm = normalizeWeapons(loadout, ov);
  const total = boxCount(loadout, norm);
  if (total > MAX_BOXES)
    err("unit", u.id, `${label}: ${total} ammo boxes; vanilla never uses more than ${MAX_BOXES}. Remove a box on the Weapons tab.`);
  norm.extraBoxes.forEach((n, i) => {
    if (!Number.isInteger(n) || n < 0) err("unit", u.id, `${label}: ammo box ${loadout.salves.length + i + 1} needs a whole number of salvos.`);
  });
  for (const box of emptyBoxes(game, loadout, norm)) {
    err("unit", u.id, `${label}: ammo box ${box + 1} has no weapons. Remove it or move a weapon into it.`);
  }

  for (const [slot, m] of Object.entries(ov.mounted || {})) {
    const [ti, mi] = slot.split(".").map(Number);
    const original = loadout.turrets[ti]?.mounted[mi];
    const where = `${label}: weapon ${ti + 1}.${mi + 1}`;
    if (!original) {
      err("unit", u.id, `${where} doesn't exist on the base unit any more.`);
      continue;
    }
    if (m.count != null && (!Number.isInteger(m.count) || m.count < 1)) err("unit", u.id, `${where}: weapon count must be a whole number of at least 1.`);
    const ammoId = m.ammo || original.ammo;
    const ammo = game.ammo[ammoId];
    if (!ammo) {
      err("unit", u.id, `${where}: ammunition ${ammoId} not found in game data.`);
      continue;
    }
    if (m.ammo && m.ammo !== original.ammo && game.ammo[original.ammo]?.category !== ammo.category)
      warn("unit", u.id, `${where}: swapped to a different weapon class (${ammo.category?.replace("MinMax_", "")}); firing effects stay those of the original gun.`);
    const ranges = game.ammoRanges[ammo.category] || {};
    for (const stat of AMMO_STATS) {
      const v = m.stats?.[stat.key];
      if (v == null || v === ammo.stats[stat.key]) continue;
      if (!Number.isFinite(v)) {
        err("unit", u.id, `${where}: ${stat.label} must be a number.`);
        continue;
      }
      if (!stat.decimals && !stat.power && !Number.isInteger(v)) err("unit", u.id, `${where}: ${stat.label} must be a whole number.`);
      if (stat.tick && !isOnTick(v)) err("unit", u.id, `${where}: ${stat.label} ${v}s must be a multiple of the 0.1 s game tick (e.g. ${snapToTick(v).toFixed(1)}).`);
      if (v < (stat.hardMin ?? 0)) err("unit", u.id, `${where}: ${stat.label} can't be below ${stat.hardMin ?? 0}.`);
      if (stat.hardMax != null && v > stat.hardMax) err("unit", u.id, `${where}: ${stat.label} can't exceed ${stat.hardMax}.`);
      if (stat.power) {
        const max = game.hardLimits[ammo.family] || 1;
        if (!Number.isInteger(v) || v < 1 || v > max)
          err("unit", u.id, `${where}: power must be a whole number 1–${max} for ${ammo.family?.replace("DamageFamily_", "")} weapons (game table size).`);
        continue;
      }
      const r = ranges[stat.key];
      if (r && (v < r.min || v > r.max)) warn("unit", u.id, `${where}: ${stat.label} ${v} is outside the vanilla range for this weapon class (${r.min}–${r.max}).`);
    }
  }
}
