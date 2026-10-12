// Unit abilities ("capacities" in NDF).
//
// How the game does it: a TCapaciteDescriptor (CapaciteList.ndf) decides WHO is affected
// (self / friendly units / enemies, a range, target tags) and points at a TEffectsPackDescriptor
// (EffetsSurUnite.ndf), which is a list of effect building blocks (+20% damage, x0.8 reload…).
// Units list capacities in TCapaciteModuleDescriptor.DefaultSkillList and show icons through
// TUnitUIModuleDescriptor.SpecialtiesList.

/**
 * Effect building blocks offered for custom abilities. `fields(value)` renders the NDF body.
 * Modifier styles follow what vanilla uses for each effect type:
 *   pct  -> ModifierType_Pourcentage, value is a +/- percentage
 *   mult -> ModifierType_Multiplicatif, value is a factor (0.8 = 20% less)
 *   add  -> ModifierType_Additionnel, value is added
 */
export const EFFECTS = [
  {
    key: "damageTaken", type: "TUnitEffectIncreaseDamageTakenDescriptor", label: "Damage taken", style: "pct",
    param: "BonusDamage", match: (p) => String(p.DamageType || "").endsWith("Physical"),
    default: -15, min: -90, max: 200, step: 5, good: "negative",
    fields: (v) => ({ ModifierType: "~/ModifierType_Pourcentage", BonusDamage: v, DamageType: "EDamageType/Physical" }),
  },
  {
    key: "suppressTaken", type: "TUnitEffectIncreaseDamageTakenDescriptor", label: "Suppression taken", style: "pct",
    param: "BonusDamage", match: (p) => String(p.DamageType || "").endsWith("Suppress"),
    default: -20, min: -90, max: 200, step: 5, good: "negative",
    fields: (v) => ({ ModifierType: "~/ModifierType_Pourcentage", BonusDamage: v, DamageType: "EDamageType/Suppress" }),
  },
  {
    key: "suppressRecovery", type: "TUnitEffectHealOverTimeDescriptor", label: "Suppression recovery", style: "rate", unit: "/s",
    param: "HealUnitsPerSecond", default: 0.5, min: 0, max: 5, step: 0.25,
    fields: (v) => ({ NbUpdatePerSecond: 1, HealUnitsPerSecond: v, DamageType: "EDamageType/Suppress" }),
  },
  {
    key: "accuracyStatic", type: "TUnitEffectIncreaseWeaponPrecisionArretDescriptor", label: "Accuracy (stationary)", style: "add", unit: "pts",
    param: "ModifierValue", default: 10, min: -50, max: 50, step: 1,
    fields: (v) => ({ ModifierType: "~/ModifierType_Additionnel", ModifierValue: v }),
  },
  {
    key: "accuracyMoving", type: "TUnitEffectIncreaseWeaponPrecisionMouvementDescriptor", label: "Accuracy (moving)", style: "add", unit: "pts",
    param: "ModifierValue", default: 10, min: -50, max: 50, step: 1,
    fields: (v) => ({ ModifierType: "~/ModifierType_Additionnel", ModifierValue: v }),
  },
  {
    key: "reload", type: "TUnitEffectAlterWeaponTempsEntreDeuxSalvesDescriptor", label: "Reload time", style: "mult",
    param: "ModifierValue", default: 0.85, min: 0.1, max: 3, step: 0.05, good: "low",
    fields: (v) => ({ ModifierType: "~/ModifierType_Multiplicatif", ModifierValue: v }),
  },
  {
    key: "aimTime", type: "TBonusWeaponAimtimeEffectDescriptor", label: "Aim time", style: "mult",
    param: "ModifierValue", default: 0.85, min: 0.1, max: 3, step: 0.05, good: "low",
    fields: (v) => ({ ModifierType: "~/ModifierType_Multiplicatif", ModifierValue: v }),
  },
  {
    key: "damageDealt", type: "TUnitEffectIncreaseWeaponPhysicalDamagesDescriptor", label: "Damage dealt", style: "pct",
    param: "ModifierValue", default: 15, min: -90, max: 300, step: 5,
    fields: (v) => ({ ModifierType: "~/ModifierType_Pourcentage", ModifierValue: v }),
  },
  {
    key: "weaponRange", type: "TUnitEffectIncreaseWeaponMaxRangeDescriptor", label: "Weapon range", style: "mult",
    param: "ModifierValue", default: 1.1, min: 0.1, max: 3, step: 0.05,
    fields: (v) => ({ ModifierType: "~/ModifierType_Multiplicatif", ModifierValue: v, ModifierValueGRU: 0 }),
  },
  {
    key: "dispersion", type: "TUnitEffectIncreaseDispersionDescriptor", label: "Shot dispersion", style: "pct",
    param: "BonusDispersion", default: -20, min: -90, max: 300, step: 5, good: "negative",
    fields: (v) => ({ ModifierType: "~/ModifierType_Pourcentage", BonusDispersion: v }),
  },
  {
    key: "speed", type: "TUnitEffectIncreaseSpeedDescriptor", label: "Speed", style: "pct",
    param: "BonusSpeedBaseInPercent", default: 10, min: -90, max: 200, step: 5,
    fields: (v) => ({ ModifierType: "~/ModifierType_Pourcentage", BonusSpeedBaseInPercent: v }),
  },
  {
    key: "turretSpeed", type: "TUnitEffectIncreaseTurretRotationSpeedDescriptor", label: "Turret rotation speed", style: "pct",
    param: "BonusTurretRotationSpeed", default: 25, min: -90, max: 300, step: 5,
    fields: (v) => ({ ModifierType: "~/ModifierType_Pourcentage", BonusTurretRotationSpeed: v }),
  },
  {
    key: "optics", type: "TUnitEffectIncreaseOpticalStrengthDescriptor", label: "Optics", style: "mult",
    param: "BonusOpticalStrength", default: 1.25, min: 0.1, max: 4, step: 0.05,
    fields: (v) => ({ ModifierType: "~/ModifierType_Multiplicatif", BonusOpticalStrength: v }),
  },
  {
    key: "stealth", type: "TUnitEffectIncreaseConcealmentBonusDescriptor", label: "Stealth", style: "add",
    param: "BonusConcealmentBonus", default: 0.5, min: -2, max: 3, step: 0.25,
    fields: (v) => ({ ModifierType: "~/ModifierType_Additionnel", BonusConcealmentBonus: v }),
  },
  {
    key: "vision", type: "TUnitEffectIncreaseVisionDescriptor", label: "Vision range", style: "add", unit: "GRU",
    param: "BonusVisionBase", default: 500, min: -3000, max: 5000, step: 100,
    fields: (v) => ({ ModifierType: "~/ModifierType_Additionnel", BonusVisionBase: v }),
  },
  {
    key: "experience", type: "TUnitEffectBonusExperienceLevelDescriptor", label: "Veterancy levels", style: "add",
    param: "ExperienceLevelModifier", default: 1, min: -3, max: 3, step: 1,
    fields: (v) => ({ ModifierType: "~/ModifierType_Additionnel", ExperienceLevelModifier: v }),
  },
  {
    key: "ecm", type: "TUnitEffectBonusHitRollECMDescriptor", label: "ECM (enemy hit chance)", style: "add",
    param: "BonusHitRollECM", default: -0.1, min: -0.9, max: 0.9, step: 0.05, good: "negative",
    fields: (v) => ({ ModifierType: "~/ModifierType_Additionnel", BonusHitRollECM: v }),
  },
];

export const EFFECTS_BY_KEY = Object.fromEntries(EFFECTS.map((e) => [e.key, e]));

export const ABILITY_MODES = [
  { id: "self", label: "Always-on (self)", hint: "Permanent buff or drawback on the unit itself, like Resolute or Reservists." },
  { id: "aura", label: "Aura for friendly units", hint: "Affects your units within range, like Military Police or instructors." },
  { id: "debuff", label: "Debuff enemies in range", hint: "Affects enemy units within range, like electronic warfare." },
  { id: "proximity", label: "Bonus when enemies are near", hint: "Buffs the unit itself while enemies are within range, like Shock troops." },
];

export const TARGET_PRESETS = [
  { id: "ground", label: "Ground units", tags: ["GroundUnits"] },
  { id: "infantry", label: "Infantry", tags: ["Infanterie"] },
  { id: "vehicles", label: "Vehicles", tags: ["Vehicule"] },
  { id: "tanks", label: "Tanks", tags: ["Char"] },
  { id: "air", label: "Aircraft & helicopters", tags: ["Avion", "Helo"] },
  { id: "all", label: "Everything", tags: [] },
];

/**
 * Vanilla abilities as toggles. `caps` are the CapaciteList entries the game attaches,
 * `spec` is the icon key in UnitSpecialties. ERA and special forces aren't capacities:
 * ERA is an armor flag, SF is a veterancy pack.
 */
export const VANILLA_ABILITIES = [
  { id: "shock", label: "Shock troops", caps: ["Capacite_Choc", "Capacite_Choc_feedback"], spec: "_choc" },
  { id: "resolute", label: "Resolute", caps: ["Capacite_resolute"], spec: "_resolute" },
  { id: "reservist", label: "Reservists", caps: ["Capacite_reserviste"], spec: "_reservist" },
  { id: "militia", label: "Militia", caps: ["Capacite_militia"], spec: "_militia" },
  { id: "security", label: "Security", caps: ["Capacite_security"], spec: "_security" },
  { id: "mp", label: "Military police", caps: ["Capacite_MilitaryPolice", "Capacite_MilitaryPolice_feedback"], spec: "_mp" },
  { id: "ifv", label: "IFV support", caps: ["Capacite_IFV", "Capacite_IFV_feedback"], spec: "_ifv" },
  { id: "sniper", label: "Sniper", caps: ["Capacite_sniper", "Capacite_sniper_no_snipe", "Capacite_sniper_feedback"], spec: "_sniper" },
  { id: "instructorInf", label: "Instructor (infantry)", caps: ["Capacite_Instructor_INF"], spec: "_instructor" },
  { id: "instructorTank", label: "Instructor (tanks)", caps: ["Capacite_Instructor_TNK"], spec: "_instructor" },
  { id: "gsr", label: "Ground surveillance radar", caps: ["Capacite_GSR"], spec: "_gsr" },
  { id: "sigint", label: "SIGINT", caps: ["Capacite_sigint_far", "Capacite_sigint_close", "Capacite_sigint_feedback"], spec: "_singint" },
  { id: "cbr", label: "Counter-battery radar", caps: ["Capacite_Counter_Battery_Radar"], spec: "_cbr" },
  { id: "ew", label: "Electronic warfare", caps: ["Capacite_electronic_warfare"], spec: "_electronic_warfare" },
  { id: "jammer", label: "Jammer", caps: ["Capacite_jammer", "Capacite_jammer_arty", "Capacite_jammer_gsr"], spec: "_jammer" },
  { id: "dazzler", label: "EO dazzler", caps: ["Capacite_eo_dazzler"], spec: "_eo_dazzler" },
  { id: "fireDirection", label: "Fire direction", caps: ["Capacite_fireDirection"], spec: "_fireDirection" },
  { id: "uav", label: "UAV", caps: ["Capacite_UAV"], spec: null },
  { id: "era", label: "Reactive armor (ERA)", kind: "era", spec: "_era", hint: "Armor flag: protects against HEAT/missile hits." },
  { id: "sf", label: "Special forces", kind: "sf", spec: "_sf", hint: "Uses the special-forces veterancy pack." },
];

export const SF_XP_PACK = "ExperienceLevelsPackDescriptor_XP_pack_SF_v2";

export function presetActiveOnBase(preset, base) {
  if (preset.kind === "era") return base.era;
  if (preset.kind === "sf") return base.xpPack === SF_XP_PACK;
  return preset.caps.every((c) => base.capacities.includes(c));
}

/** Is a preset on for this custom unit (override, else inherited from the base unit)? */
export function presetActive(preset, unit, base) {
  const o = unit.abilities?.presets?.[preset.id];
  return o === undefined ? presetActiveOnBase(preset, base) : o;
}

// ── Describing effects (vanilla presets and custom abilities share this) ─────

export function formatEffectValue(style, value, unit) {
  const n = Number(value);
  const s = (x) => (x > 0 ? `+${x}` : `${x}`);
  if (style === "pct") return `${s(n)}%`;
  if (style === "mult") return `×${n}`;
  if (style === "rate") return `+${n}${unit || ""}`;
  return `${s(n)}${unit ? ` ${unit}` : ""}`;
}

function styleFromModifier(mod) {
  if (String(mod).includes("Pourcentage")) return "pct";
  if (String(mod).includes("Multiplicatif")) return "mult";
  return "add";
}

/** Human summary of a vanilla effect (from game-data capacities). */
export function describeVanillaEffect(e) {
  const def = EFFECTS.find((x) => x.type === e.type && (!x.match || x.match(e.params)));
  if (!def) return null;
  const value = e.params[def.param];
  if (value === undefined) return null;
  const style = def.style === "rate" ? "rate" : styleFromModifier(e.params.ModifierType);
  return `${def.label} ${formatEffectValue(style, value, def.unit)}`;
}

export function describeCapacity(cap) {
  if (!cap) return [];
  const where =
    cap.team === "ennemi" ? (cap.self.length ? "when enemies are near" : "on enemies in range") : cap.range > 0 ? "on nearby friendly units" : "";
  const lines = [...cap.self, ...cap.target].map(describeVanillaEffect).filter(Boolean);
  return lines.length && where ? [...lines, where] : lines;
}

export function describePreset(preset, game) {
  if (preset.hint) return preset.hint;
  const lines = preset.caps.flatMap((c) => describeCapacity(game.capacities[c]));
  return [...new Set(lines)].join(" · ") || "Special behaviour handled by the game engine.";
}

export function describeCustomAbility(a) {
  const fx = a.effects
    .map((e) => {
      const def = EFFECTS_BY_KEY[e.key];
      return def ? `${def.label} ${formatEffectValue(def.style, e.value, def.unit)}` : null;
    })
    .filter(Boolean)
    .join(" · ");
  const mode = ABILITY_MODES.find((m) => m.id === a.mode);
  return `${fx || "No effects"}${a.mode !== "self" ? ` (${mode?.label.toLowerCase()}, ${a.range} GRU)` : ""}`;
}
