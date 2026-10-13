// Unit-level patching: cloning a vanilla TEntityDescriptor, its weapon loadout and ammunition,
// applying stat / ability overrides, and serializing custom abilities.

import { SF_XP_PACK, TARGET_PRESETS, VANILLA_ABILITIES, EFFECTS_BY_KEY, presetActive } from "./abilities.js";
import { GAME_TICK, guidFrom, snapToTick } from "./model.js";
import { appendToList, escapeRegExp, findObjectSpan, formatExact, matchClose, setExactByRegex, setNumberByRegex, setNumberInObject } from "./ndf.js";

const NUM = "(-?\\d+(?:\\.\\d*)?)";
const field = (name) => new RegExp(`(\\b${name}\\s*=\\s*)${NUM}`);

/** Apply several setNumberInObject calls; ok if the first (required) one succeeded. */
function chain(t, v, steps) {
  let text = t;
  let ok = false;
  steps.forEach(([obj, fieldName], i) => {
    const r = setNumberInObject(text, obj, fieldName, v);
    if (r.ok) text = r.text;
    if (i === 0) ok = r.ok;
  });
  return { text, ok };
}

const inObj = (obj, fieldName) => (t, v) => setNumberInObject(t, obj, fieldName, v);
const armor = (side) => (t, v) =>
  setNumberByRegex(t, new RegExp(`(Resistance${side}\\s*=\\s*TResistanceTypeRTTI\\(\\s*Family\\s*=\\s*\\w+\\s+Index\\s*=\\s*)(\\d+)`), v);

export const STAT_PATCHERS = {
  cp: (t, v) => setNumberByRegex(t, /(\$\/GFX\/Resources\/Resource_CommandPoints\s*,\s*)(-?\d+(?:\.\d*)?)/, v),
  health: inObj("TBaseDamageModuleDescriptor", "MaxPhysicalDamages"),
  // Planes and helicopters also have their own speed field; keep them in sync.
  speed: (t, v) =>
    chain(t, v, [
      ["TGenericMovementModuleDescriptor", "MaxSpeedInKmph"],
      ["AirplaneMovementDescriptor", "SpeedInKmph"],
      ["THelicopterMovementModuleDescriptor", "MaxSpeedInKmph"],
    ]),
  roadSpeed: inObj("TUnitUIModuleDescriptor", "DisplayRoadSpeedInKmph"),
  stealth: inObj("TVisibilityModuleDescriptor", "UnitConcealmentBonus"),
  optics: (t, v) => setNumberByRegex(t, /(EOpticalStrength\/Standard\s*,\s*)(-?\d+(?:\.\d*)?)/, v),
  fuel: inObj("TFuelModuleDescriptor", "FuelCapacity"),
  autonomy: inObj("TFuelModuleDescriptor", "FuelMoveDuration"),
  armorFront: armor("Front"),
  armorSides: armor("Sides"),
  armorRear: armor("Rear"),
  armorTop: armor("Top"),
  ecm: inObj("TDamageModuleDescriptor", "HitRollECM"),
  soldiers: inObj("TInfantrySquadModuleDescriptor", "SoldierCount"),
  supply: inObj("TSupplyModuleDescriptor", "SupplyCapacity"),
  accel: inObj("TLandMovementModuleDescriptor", "MaxAccelerationGRU"),
  decel: inObj("TLandMovementModuleDescriptor", "MaxDecelerationGRU"),
  turnTime: inObj("TLandMovementModuleDescriptor", "TempsDemiTour"),
  roadFactor: inObj("TLandMovementModuleDescriptor", "SpeedBonusFactorOnRoad"),
  turnRadius: inObj("AirplaneMovementDescriptor", "AgilityRadiusGRU"),
  altitude: inObj("AirplaneMovementDescriptor", "AltitudeGRU"),
  altitudeMin: inObj("AirplaneMovementDescriptor", "AltitudeMinGRU"),
  rollAngle: inObj("AirplaneMovementDescriptor", "RollAngleDegree"),
  rollSpeed: inObj("AirplaneMovementDescriptor", "RollSpeedDegreePerSecond"),
  pitchAngle: inObj("AirplaneMovementDescriptor", "PitchAngleDegree"),
  evacTime: inObj("TAirplaneModuleDescriptor", "EvacuationTime"),
  travelTime: inObj("TAirplaneModuleDescriptor", "TravelDuration"),
  climb: inObj("THelicopterMovementModuleDescriptor", "UpwardSpeedInKmph"),
  torque: inObj("THelicopterMovementModuleDescriptor", "TorqueManoeuvrability"),
  cyclic: inObj("THelicopterMovementModuleDescriptor", "CyclicManoeuvrability"),
  gLimit: inObj("THelicopterMovementModuleDescriptor", "GFactorLimit"),
  inclination: inObj("THelicopterMovementModuleDescriptor", "MaxInclination"),
  deployTime: inObj("TWeaponDeploymentModuleDescriptor", "TimeForWeaponDeployment"),
  packTime: inObj("TWeaponDeploymentModuleDescriptor", "TimeForWeaponPacking"),
};

export const AMMO_PATCHERS = {
  power: (t, v) => setNumberByRegex(t, /(Arme\s*=\s*TDamageTypeRTTI\(\s*Family\s*=\s*\w+\s+Index\s*=\s*)(\d+)/, v),
  damage: (t, v) => setNumberByRegex(t, field("PhysicalDamages"), v),
  suppress: (t, v) => setNumberByRegex(t, field("SuppressDamages"), v),
  splash: (t, v) => setNumberByRegex(t, field("RadiusSplashPhysicalDamagesGRU"), v),
  range: (t, v) => setNumberByRegex(t, field("MaximumRangeGRU"), v),
  rangeMin: (t, v) => setNumberByRegex(t, field("MinimumRangeGRU"), v),
  rangeHeli: (t, v) => setNumberByRegex(t, field("MaximumRangeHelicopterGRU"), v),
  rangeAir: (t, v) => setNumberByRegex(t, field("MaximumRangeAirplaneGRU"), v),
  accuracy: (t, v) => setNumberByRegex(t, /(EBaseHitValueModifier\/Idling\s*,\s*)(-?\d+(?:\.\d*)?)/, v),
  accuracyMoving: (t, v) => setNumberByRegex(t, /(EBaseHitValueModifier\/Moving\s*,\s*)(-?\d+(?:\.\d*)?)/, v),
  // the engine rejects timings that aren't whole 0.1 s ticks ("must be multiple of a gameplay tick length")
  aimTime: (t, v) => setNumberByRegex(t, field("AimingTime"), snapToTick(v)),
  reload: (t, v) => setNumberByRegex(t, field("TimeBetweenTwoSalvos"), v),
  shotsPerSalvo: (t, v) => setNumberByRegex(t, field("ShotsCountPerSalvo"), v),
  shotInterval: (t, v) => setNumberByRegex(t, field("TimeBetweenTwoShots"), Math.max(GAME_TICK, snapToTick(v))),
  projectileSpeed: (t, v) => setNumberByRegex(t, field("ProjectileSpeedGRU"), v),
  supplyCost: (t, v) => setNumberByRegex(t, field("SupplyCost"), v),
  // degrees in the editor, radians in NDF
  arcAngle: (t, v) => setExactByRegex(t, field("PitchForParabolic"), (v * Math.PI) / 180),
};

function applyPatchers(text, patchers, values, baseValues, onFail) {
  let t = text;
  for (const [key, value] of Object.entries(values || {})) {
    if (value == null || value === baseValues?.[key]) continue;
    const patcher = patchers[key];
    if (!patcher) continue;
    const res = patcher(t, value);
    if (res.ok) t = res.text;
    else onFail(key);
  }
  return t;
}

// ── Abilities ────────────────────────────────────────────────────────────────

/**
 * Final ability state for a custom unit: vanilla presets (override or inherited),
 * capacities that aren't part of any preset (engine plumbing, kept as-is), and custom abilities.
 * `customNames`: Map abilityId -> { capacity, specialty }.
 */
export function resolveUnitAbilities(unit, base, customNames) {
  const presetCaps = new Set(VANILLA_ABILITIES.flatMap((p) => p.caps || []));
  const presetSpecs = new Set(VANILLA_ABILITIES.map((p) => p.spec).filter(Boolean));
  const caps = base.capacities.filter((c) => !presetCaps.has(c));
  const specs = base.specialties.filter((s) => !presetSpecs.has(s));
  let era = base.era;
  let sf = base.xpPack === SF_XP_PACK;

  for (const p of VANILLA_ABILITIES) {
    const on = presetActive(p, unit, base);
    if (p.kind === "era") era = on;
    else if (p.kind === "sf") sf = on;
    else if (on) for (const c of p.caps) if (!caps.includes(c)) caps.push(c);
    if (on && p.spec && !specs.includes(p.spec)) specs.push(p.spec);
  }
  for (const id of unit.abilities?.custom || []) {
    const a = customNames.get(id);
    if (!a) continue;
    if (!caps.includes(a.capacity)) caps.push(a.capacity);
    if (!specs.includes(a.specialty)) specs.push(a.specialty);
  }
  return { caps, specs, era, sf };
}

const sameList = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

function patchAbilities(t, unit, base, customNames) {
  const { caps, specs, era, sf } = resolveUnitAbilities(unit, base, customNames);

  if (!sameList(caps, base.capacities)) {
    const list = caps.map((c) => `                $/GFX/EffectCapacity/${c},`).join("\n");
    const span = findObjectSpan(t, "TCapaciteModuleDescriptor");
    if (span) {
      const inner = t.slice(span.start, span.end).replace(/DefaultSkillList\s*=\s*\[[\s\S]*?\]/, `DefaultSkillList = [\n${list}\n            ]`);
      t = t.slice(0, span.start) + inner + t.slice(span.end);
    } else if (caps.length) {
      const block = `        TCapaciteModuleDescriptor\n        (\n            DefaultSkillList = [\n${list}\n            ]\n        ),`;
      t = t.replace(/^([ \t]*~\/EffectApplierModuleDescriptor,[ \t]*\n)/m, `$1${block}\n`);
    }
  }
  if (!sameList(specs, base.specialties)) {
    const list = specs.length ? `\n${specs.map((s) => `                '${s}',`).join("\n")}\n            ]` : "]";
    if (/SpecialtiesList\s*=\s*\[/.test(t)) t = t.replace(/SpecialtiesList\s*=\s*\[[\s\S]*?\]/, `SpecialtiesList = [${list}`);
    else t = t.replace(/^([ \t]*UnitRole\s*=\s*'[^']*'[ \t]*\n)/m, `$1            SpecialtiesList = [${list}\n`);
  }
  if (era !== base.era) t = t.replace(/(ExplosiveReactiveArmor\s*=\s*)(True|False)/, `$1${era ? "True" : "False"}`);
  if (sf !== (base.xpPack === SF_XP_PACK)) {
    const pack = sf ? SF_XP_PACK : "ExperienceLevelsPackDescriptor_XP_pack_simple_v3";
    t = t.replace(/(ExperienceLevelsPackDescriptor\s*=\s*)~\/\w+/, `$1~/${pack}`);
  }
  return t;
}

/**
 * Give every DescriptorId in a copied block a new GUID: the first gets `guid`, later ones a GUID
 * derived from it (stable across exports). Infantry squads carry a second one inside
 * TInfantrySquadModuleDescriptor > MimeticDescriptor; keeping it causes "Duplicate descriptor GUID".
 */
export function renewDescriptorIds(block, guid) {
  let n = 0;
  return block.replace(/(DescriptorId\s*=\s*)GUID:\{[^}]*\}/g, (m, prefix) => `${prefix}GUID:{${n++ === 0 ? guid : guidFrom(`${guid}:${n - 1}`)}}`);
}

/**
 * Copy a vanilla TEntityDescriptor and give it a new identity. Visual modules
 * (MimeticName, ReferenceMesh, depictions) are kept so it reuses the base unit's 3D model.
 */
export function cloneUnitBlock(block, r, warnings = [], customNames = new Map()) {
  const { unit, base } = r;
  let t = renewDescriptorIds(block, unit.guid)
    .replace(new RegExp(`^(export\\s+)?${escapeRegExp(base.id)}\\b`), `export ${r.descriptor}`)
    .replace(/(ClassNameForDebug\s*=\s*)'[^']*'/, `$1'Unit_${r.stem}'`)
    .replace(/(MotherCountry\s*=\s*)'[^']*'/, `$1'${r.tag}'`)
    .replace(/(Coalition\s*=\s*)TWargameCoalition\/\w+/, `$1TWargameCoalition/${r.side}`)
    .replace(/"UNITE_[^"]*"/, `"UNITE_${r.stem}"`)
    .replace(/(NameToken\s*=\s*)'[^']*'/, `$1'${unit.nameToken}'`)
    .replace(/(ButtonTexture\s*=\s*)'[^']*'/, `$1'${r.buttonTexture}'`)
    .replace(/^[ \t]*UpgradeFromUnit\s*=\s*\S+[ \t]*\n/m, "");
  if (r.weapon) {
    t = t.replace(new RegExp(`\\$/GFX/Weapon/${escapeRegExp(base.weapon)}\\b`), `$/GFX/Weapon/${r.weapon}`);
  }
  t = applyPatchers(t, STAT_PATCHERS, unit.stats, base.stats, (key) =>
    warnings.push({ scope: "unit", id: unit.id, message: `${unit.name}: couldn't apply ${key} (field not present on this unit type).` }),
  );
  return patchAbilities(t, unit, base, customNames);
}

// ── Weapons & ammunition ─────────────────────────────────────────────────────

/** Spans of consecutive `TypeRegex(...)` objects inside [from, to), skipping nested matches. */
function objectSpans(text, typePattern, from = 0, to = text.length) {
  const re = new RegExp(`\\b(${typePattern})\\s*\\(`, "g");
  re.lastIndex = from;
  const spans = [];
  let m;
  while ((m = re.exec(text)) && m.index < to) {
    const open = m.index + m[0].length - 1;
    const close = matchClose(text, open);
    if (close < 0) break;
    spans.push({ start: m.index, end: close + 1 });
    re.lastIndex = close + 1;
  }
  return spans;
}

const toRad = (deg) => (deg * Math.PI) / 180;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * Engine limits for turret angles (radians), matching the vanilla extremes. Values are written at
 * full precision: the engine compares against exact pi/2, so a rounded 1.5708 fails the check.
 */
export const TURRET_ANGLE_LIMITS = {
  facing: [-Math.PI, Math.PI],
  elevation: [0, Math.PI / 2],
  depression: [-Math.PI / 2, Math.PI / 2], // stored as AngleRotationMinPitch (negative = below horizon)
  traverse: { TwoAxis: [toRad(1), 2 * Math.PI], default: [toRad(1), Math.PI] },
};

/**
 * Apply a unit's weapon overrides to its (already renamed) weapon block.
 * override = { salves: {box: n}, turrets: {ti: {rotationSpeed°/s, traverse°}}, mounted: {"ti.mi": {ammo, count}} }
 * ammoFor(ti, mi, currentAmmoId) returns the ammo id to reference.
 * plan: { extra: [salvos…], assign: Map(slot -> box index) } from weapons.js boxPlan.
 */
export function patchWeaponBlock(block, override, ammoFor, onFail, plan = { extra: [], assign: new Map() }) {
  const boxForSlot = plan.assign;
  let t = block;
  const edits = []; // [start, end, replacement]

  const salvesMatch = /Salves\s*=\s*\[/.exec(t);
  if (salvesMatch && override?.salves && Object.keys(override.salves).length) {
    const open = salvesMatch.index + salvesMatch[0].length - 1;
    const close = matchClose(t, open);
    let i = 0;
    const inner = t.slice(open, close + 1).replace(/-?\d+(?:\.\d*)?/g, (num) => {
      const v = override.salves[i++];
      return v == null ? num : String(Math.round(v));
    });
    edits.push([open, close + 1, inner]);
  }

  const turrets = objectSpans(t, "TTurret\\w+Descriptor");
  turrets.forEach((ts, ti) => {
    let tText = t.slice(ts.start, ts.end);
    const to = override?.turrets?.[ti];
    const isTwoAxis = /^TTurretTwoAxisDescriptor/.test(tText);
    // tText is just this turret; mounted weapons inside it have no rotation fields
    if (to?.rotationSpeed != null) {
      const r = setExactByRegex(tText, field("VitesseRotation"), toRad(Math.max(1, to.rotationSpeed)));
      if (r.ok) tText = r.text;
      else onFail(`turret ${ti + 1} rotation speed`);
    }
    if (to?.traverse != null) {
      const [lo, hi] = TURRET_ANGLE_LIMITS.traverse[isTwoAxis ? "TwoAxis" : "default"];
      const r = setExactByRegex(tText, field("AngleRotationMax"), clamp(toRad(to.traverse), lo, hi));
      if (r.ok) tText = r.text;
      else onFail(`turret ${ti + 1} traverse`);
    }
    // facing: 0 = forward, 180 = rear. Elevation/depression are pitch limits (depression stored negative).
    for (const [key, fieldName, sign] of [["facing", "AngleRotationBase", 1], ["elevation", "AngleRotationMaxPitch", 1], ["depression", "AngleRotationMinPitch", -1]]) {
      if (to?.[key] == null) continue;
      const [lo, hi] = TURRET_ANGLE_LIMITS[key];
      const r = setExactByRegex(tText, field(fieldName), clamp(sign * toRad(to[key]), sign > 0 ? lo : -hi, sign > 0 ? hi : -lo));
      if (r.ok) tText = r.text;
      else onFail(`turret ${ti + 1} ${key}`);
    }
    // mounted weapons, patched back-to-front so offsets stay valid
    const mounted = objectSpans(tText, "TMountedWeaponDescriptor");
    for (let mi = mounted.length - 1; mi >= 0; mi--) {
      const ms = mounted[mi];
      let mText = tText.slice(ms.start, ms.end);
      const mo = override?.mounted?.[`${ti}.${mi}`];
      if (mo?.count != null) {
        const r = setNumberByRegex(mText, field("NbWeapons"), mo.count);
        if (r.ok) mText = r.text;
      }
      if (boxForSlot.has(`${ti}.${mi}`)) {
        const r = setNumberByRegex(mText, field("AmmoBoxIndex"), boxForSlot.get(`${ti}.${mi}`));
        if (r.ok) mText = r.text;
        else onFail(`ammo box for weapon ${ti + 1}.${mi + 1}`);
      }
      mText = mText.replace(/(Ammunition\s*=\s*\$\/GFX\/Weapon\/)(\w+)/, (all, pre, current) => pre + ammoFor(ti, mi, current));
      tText = tText.slice(0, ms.start) + mText + tText.slice(ms.end);
    }
    edits.push([ts.start, ts.end, tText]);
  });

  for (const [start, end, rep] of edits.sort((a, b) => b[0] - a[0])) t = t.slice(0, start) + rep + t.slice(end);

  // Append the new boxes. SalvoIsMainSalvo (aircraft only) is a parallel list and must stay the same length.
  for (const salvos of plan.extra) {
    t = appendToList(t, /\bSalves\s*=/, `        ${Math.round(salvos)},`);
    if (/\bSalvoIsMainSalvo\s*=/.test(t)) t = appendToList(t, /\bSalvoIsMainSalvo\s*=/, "        False,");
  }
  return t;
}

/**
 * Copy an ammunition block under a new name and apply stat overrides.
 * look: { impact: MimeticImpactMapping key (impact FX + sound), icon: weapon panel texture }.
 */
export function cloneAmmoBlock(block, srcId, newId, guid, stats, baseStats, onFail, look = {}) {
  let t = block
    .replace(new RegExp(`^(export\\s+)?${escapeRegExp(srcId)}\\b`), (all, exp) => `${exp || ""}${newId}`)
    .replace(/(DescriptorId\s*=\s*)GUID:\{[^}]*\}/, `$1GUID:{${guid}}`);
  if (look.impact) t = t.replace(/(ImpactHappening\s*=\s*)'[^']*'/, `$1'${look.impact}'`);
  if (look.icon) t = t.replace(/(InterfaceWeaponTexture\s*=\s*)"[^"]*"/, `$1"${look.icon}"`);
  return applyPatchers(t, AMMO_PATCHERS, stats, baseStats, onFail);
}

// ── Custom abilities ─────────────────────────────────────────────────────────

const ndfValue = (v) => {
  if (typeof v === "number") return Number.isInteger(v) ? v.toFixed(1) : String(Math.round(v * 10000) / 10000);
  return String(v);
};

export function serializeEffectPack(name, guid, ability) {
  const effects = ability.effects
    .map((e) => {
      const def = EFFECTS_BY_KEY[e.key];
      if (!def) return null;
      const body = Object.entries(def.fields(Number(e.value)))
        .map(([k, v]) => `            ${k} = ${ndfValue(v)}`)
        .join("\n");
      return `        ${def.type}\n        (\n${body}\n        ),`;
    })
    .filter(Boolean);
  return `export ${name} is TEffectsPackDescriptor
(
    DescriptorId       = GUID:{${guid}}
    NameForDebug       = '${name.replace("UnitEffect_", "")}'
    EffectsDescriptors = [
${effects.join("\n")}
    ]
)`;
}

export function serializeCapacity(name, guid, packName, ability) {
  const mode = ability.mode;
  const team = mode === "debuff" || mode === "proximity" ? "ennemi" : "joueur";
  const range = mode === "self" ? 0 : Math.round(ability.range);
  const tags = mode === "self" ? [] : TARGET_PRESETS.find((p) => p.id === ability.targets)?.tags || [];
  const effectLines =
    mode === "proximity"
      ? `    TargetEffect            = nil\n    SelfEffect              = ~/${packName}`
      : `    TargetEffect            = ~/${packName}`;
  const targetMyself = mode === "aura" ? (ability.includeSelf ? "True" : "False") : "True";
  return `export ${name} is TCapaciteDescriptor
(
    DescriptorId            = GUID:{${guid}}
    Name                    = "${name.replace("Capacite_", "")}"
    StackPolicy             = ~/CapacityStackPolicy_never
    Trigger                 = ~/CapacityTriggerType_automatic
    TargetTeamFilter        = ~/CapaciteTargetFilter_${team}
    InfluenceMapAlliance    = ~/AllianceRelation/vide
    RangeGRU                = ${range}
    CastTime                = 0.00
    CheckVisibility         = True
    CanBeCastFromTransport  = True
${effectLines}
    CapacityDuration        = -1.00
    TargetInBuilding        = True
    TargetInTransport       = False
    TargetInSelf            = False
    TargetMySelf            = ${targetMyself}
    FeedbackActivationMask  = ~/CapaciteFeedbackActivationMask_never
    DisplayRangeColor       = RGBA[0,0,0,0]
    DisplayRangeThickness   = 0.00
    AllowedTargetTags       = [
${tags.map((tag) => `        "${tag}",`).join("\n")}
    ]
    ForbiddenTargetTags     = [
    ]
)`;
}

export function serializeSpecialty(key, texture, titleToken, bodyToken) {
  return `        (
            "${key}",
            TUnitSpecialtyDescriptor
            (
                SpecialtyTextureName       = "${texture}"
                SpecialtyHintTitleToken    = "${titleToken}"
                SpecialtyHintBodyToken     = "${bodyToken}"
                ShowAsFilterInShowroom = False
            )
        ),`;
}

// ── Added weapons & depiction cloning ────────────────────────────────────────
//
// A weapon slot N is wired in two places:
//   loadout:   TMountedWeaponDescriptor with WeaponShootData_0_N / WeaponActiveAndCanShoot_N / …
//   depiction: a fire operator (muzzle point "anchors") with FireEffectTag "weapon_effet_tagN",
//              and an Actions entry "weapon_effet_tagN" -> Weapon_X (firing FX + sound).
// Cloned units share the base unit's depiction, so adding a weapon copies the depiction
// registration under a new BlackHoleKey and points the unit at it.

const INDENT_MOUNTED = "                ";
const TURRET_PATTERN = String.raw`TTurret\w+Descriptor`;

/** A new mounted weapon, copied from a sibling on the same turret and renumbered to slot n. */
function mountedFrom(template, a, n) {
  const ammoTail = a.ammo.replace(/^Ammo_/, "");
  return template
    .replace(/(AmmoBoxIndex\s*=\s*)\d+/, `$1${a.box}`)
    .replace(/(Ammunition\s*=\s*\$\/GFX\/Weapon\/)\w+/, `$1${a.ammo}`)
    .replace(/(EffectTag\s*=\s*)"[^"]*"/, `$1"FireEffect_${ammoTail}"`)
    .replace(/(HandheldEquipmentKey\s*=\s*)"[^"]*"/, `$1"WeaponAlternative_${n}"`)
    .replace(/(NbWeapons\s*=\s*)\d+/, `$1${Math.max(1, Math.round(a.count || 1))}`)
    .replace(/(WeaponActiveAndCanShootPropertyName\s*=\s*)"[^"]*"/, `$1"WeaponActiveAndCanShoot_${n}"`)
    .replace(/(WeaponIgnoredPropertyName\s*=\s*)"[^"]*"/, `$1"WeaponIgnored_${n}"`)
    .replace(/(WeaponShootDataPropertyName\s*=\s*)\[[\s\S]*?\]/, `$1[ "WeaponShootData_0_${n}" ]`)
    .replace(/^[ \t]*HideInInterface\s*=\s*\w+[ \t]*\n/m, "");
}

/** A coaxial turret: slaved to its master and riding the master's bone (the model has no spare bones). */
function coaxTurret(master, mounted) {
  const f = formatExact;
  const elevation = clamp(master.elevation ?? 0.5236, 0, Math.PI / 2);
  const depression = clamp(master.depression ?? -0.1745, -Math.PI / 2, Math.PI / 2);
  return `        TTurretTwoAxisDescriptor
        (
            AimingPriority = 3
            AngleRotationBase = 0
            AngleRotationBasePitch = 0
            AngleRotationMax = 0.017453292519943295
            AngleRotationMaxPitch = ${f(elevation)}
            AngleRotationMinPitch = ${f(depression)}
            MasterTurretYulBoneOrdinal = ${master.bone}
            MountedWeaponDescriptorList =
            [
${INDENT_MOUNTED}${mounted},
            ]
            OutOfRangeTrackingDuration = 3.5
            Tag = "${master.tag}"
            VitesseRotation = ${f(master.rotationSpeed ?? 1.5708)}
            YulBoneOrdinal = ${master.bone}
        ),`;
}

/**
 * Insert added weapons into a (renamed, patched) weapon block.
 * added: [{ a, n }] — a = { turret, coax, ammo, count, box }, n = new slot number.
 */
export function addWeaponsToBlock(block, loadout, added) {
  let t = block;
  // infantry: each new soldier role is its own TTurretInfanterieDescriptor, built from the first one
  const roles = added.filter(({ a }) => a.role);
  if (roles.length) {
    const first = objectSpans(t, "TTurretInfanterieDescriptor")[0];
    if (!first) throw new Error("No infantry turret to copy in weapon descriptor");
    const fText = t.slice(first.start, first.end);
    const mSpan = objectSpans(fText, "TMountedWeaponDescriptor")[0];
    const tmpl = fText.slice(mSpan.start, mSpan.end);
    let bone = Math.max(0, ...loadout.turrets.map((x) => x.bone || 0));
    for (const { a, n, donor } of roles) {
      bone += 1;
      const mounted = mountedFrom(tmpl, a, n)
        .replace(/(EffectTag\s*=\s*)"[^"]*"/, `$1"${donor.effectTag}"`)
        .replace(/(AnimateOnlyOneSoldier\s*=\s*)\w+/, `$1${donor.animOne ? "True" : "False"}`);
      t = appendToList(
        t,
        /\bTurretDescriptorList\s*=/,
        `        TTurretInfanterieDescriptor
        (
            MountedWeaponDescriptorList =
            [
${INDENT_MOUNTED}${mounted},
            ]
            YulBoneOrdinal = ${bone}
        ),`,
      );
    }
  }
  const onTurret = added.filter(({ a }) => !a.coax && !a.role);
  const turretIds = [...new Set(onTurret.map(({ a }) => a.turret))].sort((x, y) => y - x);
  for (const ti of turretIds) {
    const span = objectSpans(t, TURRET_PATTERN)[ti];
    if (!span) throw new Error(`Turret ${ti + 1} not found in weapon descriptor`);
    let tText = t.slice(span.start, span.end);
    const tmplSpan = objectSpans(tText, "TMountedWeaponDescriptor")[0];
    const tmpl = tText.slice(tmplSpan.start, tmplSpan.end);
    for (const { a, n } of onTurret.filter((x) => x.a.turret === ti)) {
      tText = appendToList(tText, /\bMountedWeaponDescriptorList\s*=/, `${INDENT_MOUNTED}${mountedFrom(tmpl, a, n)},`);
    }
    t = t.slice(0, span.start) + tText + t.slice(span.end);
  }
  for (const { a, n } of added.filter((x) => x.a.coax && !x.a.role)) {
    const span = objectSpans(t, TURRET_PATTERN)[a.turret];
    const mSpan = objectSpans(t.slice(span.start, span.end), "TMountedWeaponDescriptor")[0];
    const tmpl = t.slice(span.start + mSpan.start, span.start + mSpan.end);
    t = appendToList(t, /\bTurretDescriptorList\s*=/, coaxTurret(loadout.turrets[a.turret], mountedFrom(tmpl, a, n)));
  }
  return t;
}

/** Span of the unnamed registration `typeName(...)` whose BlackHoleKey is `key`. */
export function findRegistration(text, typeName, key) {
  const keyRe = new RegExp(String.raw`BlackHoleKey\s*=\s*['"]` + escapeRegExp(key) + `['"]`);
  const re = new RegExp(String.raw`unnamed\s+` + escapeRegExp(typeName) + String.raw`\s*\(`, "g");
  let m;
  while ((m = re.exec(text))) {
    const open = m.index + m[0].length - 1;
    const close = matchClose(text, open);
    if (close < 0) break;
    if (keyRe.test(text.slice(open, close))) return { start: m.index, end: close + 1 };
    re.lastIndex = close;
  }
  return null;
}

/**
 * Fire operator definition for a new weapon slot. `source` is { anchors } (muzzle bones) or
 * { carriage, weaponIndex } (fire from an existing weapon's missile pylons).
 */
export function fireOperator(name, kind, source, n) {
  if (source?.carriage) {
    return `${name} is DepictionOperator_WeaponMissileCarriageFire
(
    Connoisseur = ${source.carriage}
    FireEffectTag = "weapon_effet_tag${n}"
    NbProj = 1
    WeaponIndex = ${source.weaponIndex}
    WeaponShootDataPropertyName = ['WeaponShootData_0_${n}']
)`;
  }
  const anchors = Array.isArray(source) ? source : source?.anchors || [];
  const anchorList = `[${anchors.map((x) => `"${x}"`).join(", ")}]`;
  if (kind === "ContinuousFire") {
    return `${name} is DepictionOperator_WeaponContinuousFire
(
    FireEffectTag = "weapon_effet_tag${n}"
    Anchors = ${anchorList}
    WeaponShootDataPropertyName = "WeaponShootData_0_${n}"
    WeaponActiveAndCanShootPropertyName = "WeaponActiveAndCanShoot_${n}"
    NbFX = 1
)`;
  }
  return `${name} is DepictionOperator_WeaponInstantFire
(
    FireEffectTag = "weapon_effet_tag${n}"
    Anchors = ${anchorList}
    WeaponShootDataPropertyName = ['WeaponShootData_0_${n}']
    NbProj = 1
)`;
}

/**
 * Copy a vehicle's tactic registration under newKey, adding operators and Actions entries.
 * Returns the new registration text (null if the base registration isn't found).
 */
export function cloneTacticRegistration(text, key, newKey, operatorNames, actions, typeName = "TacticVehicleDepictionRegistration") {
  const span = findRegistration(text, typeName, key);
  if (!span) return null;
  let block = text.slice(span.start, span.end).replace(/(BlackHoleKey\s*=\s*)'[^']*'/, `$1'${newKey}'`);
  if (operatorNames.length) block = appendToList(block, /\bOperators\s*=/, operatorNames.map((o) => `        ${o},`).join("\n"));
  if (actions.length) {
    block = appendToList(block, /\bActions\s*=\s*MAP/, actions.map(([n, fx]) => `                ( "weapon_effet_tag${n}", ${fx} ),`).join("\n"));
  }
  return block;
}

export function cloneGhostRegistration(text, key, newKey) {
  const span = findRegistration(text, "GhostVehicleDepictionRegistration", key);
  return span ? text.slice(span.start, span.end).replace(/(BlackHoleKey\s*=\s*)"[^"]*"/, `$1"${newKey}"`) : null;
}

/** Point a cloned unit at its own depiction. */
export function setUnitBlackHoleKey(unitBlock, newKey) {
  const span = findObjectSpan(unitBlock, "VehicleApparenceModuleDescriptor");
  if (!span) return unitBlock;
  const inner = unitBlock.slice(span.start, span.end).replace(/(BlackHoleKey\s*=\s*)"[^"]*"/, `$1"${newKey}"`);
  return unitBlock.slice(0, span.start) + inner + unitBlock.slice(span.end);
}

// ── Infantry: new soldier roles ──────────────────────────────────────────────

function namedBlock(text, re) {
  const m = re.exec(text);
  if (!m) return null;
  if (m[0].trimEnd().endsWith("[")) {
    const end = text.indexOf("\n]", m.index);
    return end < 0 ? null : { start: m.index, end: end + 2 };
  }
  const open = text.indexOf("(", m.index + m[0].length - 1);
  const close = matchClose(text, open);
  return close < 0 ? null : { start: m.index, end: close + 1 };
}

/**
 * Copy an infantry squad's depiction (Infanterie/DepictionInfantry.ndf) under newKey, adding soldier
 * roles. roles: [{ n, donor: { mesh, effectTag, anim } }] where n is the new WeaponAlternative_N.
 * Returns { defs, entry, squad } (texts to append) or null if the squad isn't found.
 *  defs  - AllWeaponAlternatives / AllWeaponSubDepiction(+Backpack) / TacticDepiction_<new>_Soldier
 *  entry - TTransportedInfantryEntry for the transported-infantry catalog (Identifier = newKey)
 *  squad - ('squad_<newKey>', TemplateInfantryDepictionSquad(...)) for TUnitMimeticRegistration
 */
export function cloneInfantryDepiction(text, key, newKey, roles) {
  const k = escapeRegExp(key);
  const altSpan = namedBlock(text, new RegExp(String.raw`^AllWeaponAlternatives_${k} is \[`, "m"));
  const subSpan = namedBlock(text, new RegExp(String.raw`^AllWeaponSubDepiction_${k} is \w+\s*\(`, "m"));
  const bagSpan = namedBlock(text, new RegExp(String.raw`^AllWeaponSubDepictionBackpack_${k} is \w+\s*\(`, "m"));
  const solSpan = namedBlock(text, new RegExp(String.raw`^TacticDepiction_${k}_Soldier is \w+\s*\(`, "m"));
  const entryMatch = new RegExp(String.raw`TTransportedInfantryEntry\s*\(\s*Count\s*=\s*\d+\s*Identifier\s*=\s*"${k}"`).exec(text);
  const squadMatch = new RegExp(String.raw`\(\s*'squad_${k}',\s*TemplateInfantryDepictionSquad\(.*\)\),`).exec(text);
  if (!altSpan || !subSpan || !bagSpan || !solSpan || !entryMatch || !squadMatch) return null;

  const visuals = roles.map(({ n, donor }) => `  TDepictionVisual( SelectorId = ['WeaponAlternative_${n}'] MeshDescriptor = $/GFX/DepictionResources/${donor.mesh} ),`);
  let alt = text.slice(altSpan.start, altSpan.end).replace(`AllWeaponAlternatives_${key} is`, `AllWeaponAlternatives_${newKey} is`);
  const meshless = alt.search(/^\s*TMeshlessDepictionDescriptor/m);
  alt = meshless >= 0 ? `${alt.slice(0, meshless)}${visuals.join("\n")}\n${alt.slice(meshless)}` : alt.replace(/\n\]$/, `\n${visuals.join("\n")}\n]`);

  const ops = roles.map(
    ({ n, donor }) => `    DepictionOperator_WeaponInstantFireInfantry
    (
      FireEffectTag = "${donor.effectTag}"
      WeaponShootDataPropertyName = "WeaponShootData_0_${n}"
    ),`,
  );
  let sub = text
    .slice(subSpan.start, subSpan.end)
    .replace(`AllWeaponSubDepiction_${key} is`, `AllWeaponSubDepiction_${newKey} is`)
    .replace(`AllWeaponAlternatives_${key}`, `AllWeaponAlternatives_${newKey}`);
  sub = appendToList(sub, /\bOperators\s*=/, ops.join("\n"));
  const bag = text
    .slice(bagSpan.start, bagSpan.end)
    .replace(`AllWeaponSubDepictionBackpack_${key} is`, `AllWeaponSubDepictionBackpack_${newKey} is`)
    .replace(`AllWeaponAlternatives_${key}`, `AllWeaponAlternatives_${newKey}`);

  let sol = text
    .slice(solSpan.start, solSpan.end)
    .replace(`TacticDepiction_${key}_Soldier is`, `TacticDepiction_${newKey}_Soldier is`)
    .replace(`AllWeaponSubDepiction_${key}`, `AllWeaponSubDepiction_${newKey}`)
    .replace(`AllWeaponSubDepictionBackpack_${key}`, `AllWeaponSubDepictionBackpack_${newKey}`);
  const tags = roles.filter(({ donor }) => donor.anim).map(({ n, donor }) => `('${donor.anim}', 'WeaponAlternative_${n}')`);
  if (tags.length) {
    if (/ConditionalTags\s*=\s*\[/.test(sol)) sol = sol.replace(/(ConditionalTags\s*=\s*\[[^\]]*?)\s*\]/, `$1, ${tags.join(", ")} ]`).replace(/\[\s*,\s*/, "[ ");
    else sol = sol.replace(/DepictionOperator_SkeletalAnimation2_Default\(\s*\)/, `DepictionOperator_SkeletalAnimation2_Default( ConditionalTags = [ ${tags.join(", ")} ] )`);
  }

  const eOpen = text.indexOf("(", entryMatch.index);
  const eClose = matchClose(text, eOpen);
  const entry = text
    .slice(entryMatch.index, eClose + 1)
    .replace(`Identifier = "${key}"`, `Identifier = "${newKey}"`)
    .replace(`UnitMimetic = TacticDepiction_${key}_Soldier`, `UnitMimetic = TacticDepiction_${newKey}_Soldier`);
  const squad = squadMatch[0].replace(`'squad_${key}'`, `'squad_${newKey}'`);
  return { defs: [alt, sub, bag, sol].join("\n"), entry: `        ${entry},`, squad: `        ${squad}` };
}

/** Point a cloned infantry unit at its own squad depiction (soldiers, squad and transport keys). */
export function setSquadKey(unitBlock, oldKey, newKey) {
  const k = escapeRegExp(oldKey);
  return unitBlock
    .replace(new RegExp(String.raw`(SoldierBlackHoleKey\s*=\s*)'${k}'`), `$1'${newKey}'`)
    .replace(new RegExp(String.raw`(MimeticDescriptor\s*=\s*Descriptor_Unit_MimeticUnit\s*\([^)]*?BlackHoleKey\s*=\s*)'${k}'`), `$1'${newKey}'`)
    .replace(new RegExp(String.raw`(TransportedSoldier\s*=\s*)'${k}'`), `$1'${newKey}'`);
}
