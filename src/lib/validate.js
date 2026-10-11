import { EFFECTS_BY_KEY } from "./abilities.js";
import { MAX_BOXES, boxConflicts, boxCount, effectiveMounted, emptyBoxes, mountProblem, normalizeWeapons, turretLabel } from "./weapons.js";
import {
  AMMO_STATS,
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
  const err = (scope, id, message) => errors.push({ scope, id, message });
  const warn = (scope, id, message) => warnings.push({ scope, id, message });

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
        err("unit", u.id, `${label}: ${stat.label} must be a number.`);
        continue;
      }
      if (!stat.decimals && !Number.isInteger(v)) err("unit", u.id, `${label}: ${stat.label} must be a whole number.`);
      const hardMin = stat.hardMin ?? 0;
      if (v < hardMin) err("unit", u.id, `${label}: ${stat.label} can't be below ${hardMin}.`);
      if (stat.hardMax != null && v > stat.hardMax) err("unit", u.id, `${label}: ${stat.label} can't exceed ${stat.hardMax}.`);
      if (stat.armor) {
        const max = game.hardLimits[base.armorFamily] || 1;
        if (!Number.isInteger(v) || v < 1 || v > max)
          err("unit", u.id, `${label}: ${stat.label} armor must be a whole number 1–${max} (game table size).`);
        continue;
      }
      const r = ranges[stat.key];
      if (r && (v < r.min || v > r.max))
        warn("unit", u.id, `${label}: ${stat.label} ${v} is outside the vanilla ${base.factory} range (${r.min}–${r.max}).`);
    }
    if (!inAnyDivision.has(`custom:${u.id}`))
      warn("unit", u.id, `${label}: not in any division, so it won't be selectable in-game.`);

    validateWeapons(u, base, label, game, err, warn);
    // In vanilla, infantry health is always one point per soldier.
    const soldiers = u.stats.soldiers ?? base.stats.soldiers;
    const health = u.stats.health ?? base.stats.health;
    if (soldiers != null && soldiers !== health)
      warn("unit", u.id, `${label}: ${soldiers} soldiers but ${health} health; vanilla infantry always has one health point per soldier.`);
    for (const id of u.abilities?.custom || []) {
      if (!abilityIds.has(id)) err("unit", u.id, `${label}: uses a custom ability that no longer exists.`);
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
  }
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
