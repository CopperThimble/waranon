// Unit-level patching: cloning a vanilla TEntityDescriptor, its weapon loadout and ammunition,
// applying stat / ability overrides, and serializing custom abilities.

import { SF_XP_PACK, TARGET_PRESETS, VANILLA_ABILITIES, EFFECTS_BY_KEY, presetActive } from "./abilities.js";
import { appendToList, escapeRegExp, findObjectSpan, matchClose, setNumberByRegex, setNumberInObject } from "./ndf.js";

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
  aimTime: (t, v) => setNumberByRegex(t, field("AimingTime"), v),
  reload: (t, v) => setNumberByRegex(t, field("TimeBetweenTwoSalvos"), v),
  shotsPerSalvo: (t, v) => setNumberByRegex(t, field("ShotsCountPerSalvo"), v),
  shotInterval: (t, v) => setNumberByRegex(t, field("TimeBetweenTwoShots"), v),
  projectileSpeed: (t, v) => setNumberByRegex(t, field("ProjectileSpeedGRU"), v),
  supplyCost: (t, v) => setNumberByRegex(t, field("SupplyCost"), v),
  // degrees in the editor, radians in NDF
  arcAngle: (t, v) => setNumberByRegex(t, field("PitchForParabolic"), (v * Math.PI) / 180),
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
 * Copy a vanilla TEntityDescriptor and give it a new identity. Visual modules
 * (MimeticName, ReferenceMesh, depictions) are kept so it reuses the base unit's 3D model.
 */
export function cloneUnitBlock(block, r, warnings = [], customNames = new Map()) {
  const { unit, base } = r;
  let t = block
    .replace(new RegExp(`^(export\\s+)?${escapeRegExp(base.id)}\\b`), `export ${r.descriptor}`)
    .replace(/(DescriptorId\s*=\s*)GUID:\{[^}]*\}/, `$1GUID:{${unit.guid}}`)
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
    // tText is just this turret; mounted weapons inside it have no rotation fields
    if (to?.rotationSpeed != null) {
      const r = setNumberByRegex(tText, field("VitesseRotation"), toRad(to.rotationSpeed));
      if (r.ok) tText = r.text;
      else onFail(`turret ${ti + 1} rotation speed`);
    }
    if (to?.traverse != null) {
      const r = setNumberByRegex(tText, field("AngleRotationMax"), toRad(to.traverse));
      if (r.ok) tText = r.text;
      else onFail(`turret ${ti + 1} traverse`);
    }
    // facing: 0 = forward, 180 = rear. Elevation/depression are pitch limits (depression stored negative).
    for (const [key, fieldName, sign] of [["facing", "AngleRotationBase", 1], ["elevation", "AngleRotationMaxPitch", 1], ["depression", "AngleRotationMinPitch", -1]]) {
      if (to?.[key] == null) continue;
      const r = setNumberByRegex(tText, field(fieldName), sign * toRad(to[key]));
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
