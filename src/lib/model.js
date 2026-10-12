// Project shape, factories, and lookups shared by the UI and the exporter.

export const SIDES = ["NATO", "PACT"];

/** The simulation runs in 0.1 s ticks; some ammo timings must be whole multiples of it. */
export const GAME_TICK = 0.1;
export const snapToTick = (v) => Math.round(Number(v) / GAME_TICK) * GAME_TICK;
export const isOnTick = (v) => Math.abs(snapToTick(v) - Number(v)) < 1e-6;

export const BUILTIN_ALLIANCES = [
  { id: "NATO", name: "NATO", side: "NATO", color: "#3b82f6", builtin: true },
  { id: "PACT", name: "Warsaw Pact", side: "PACT", color: "#dc2626", builtin: true },
];

// FactoryType -> deck column. Order matches the in-game deck builder.
export const CATEGORIES = [
  { id: "Logistic", short: "LOG", label: "Logistics" },
  { id: "Infantry", short: "INF", label: "Infantry" },
  { id: "Art", short: "ART", label: "Artillery" },
  { id: "Tanks", short: "TNK", label: "Tanks" },
  { id: "Recons", short: "REC", label: "Recon" },
  { id: "DCA", short: "AA", label: "Air Defense" },
  { id: "Helis", short: "HEL", label: "Helicopters" },
  { id: "Planes", short: "AIR", label: "Aircraft" },
];

export const DIVISION_TYPE_LABELS = {
  MECHANIZ: "Mechanized",
  INFANREG: "Infantry",
  MOTORIZD: "Motorized",
  AIRBORNE: "Airborne",
  ARMORED: "Armored",
  DIVNAVAL: "Marine",
  AIRMOBIL: "Airmobile",
  ARMORREC: "Armored Recon",
};

// Editable unit stats. `tab` picks the editor tab; stats a unit type doesn't have are hidden.
export const STATS = [
  { key: "cp", label: "Cost", unit: "pts", tab: "stats", group: "General", step: 5 },
  { key: "soldiers", label: "Squad size", tab: "stats", group: "Squad", step: 1, hardMin: 1, hardMax: 30, special: "squad" },
  { key: "health", label: "Health", tab: "stats", group: "General", step: 1 },
  { key: "stealth", label: "Stealth", tab: "stats", group: "General", step: 0.25, decimals: 2 },
  { key: "optics", label: "Optics", tab: "stats", group: "General", step: 1 },
  { key: "supply", label: "Supply capacity", tab: "stats", group: "General", step: 50, hint: "Supply points carried (supply units)" },
  { key: "armorFront", label: "Front", tab: "stats", group: "Armor", step: 1, armor: true },
  { key: "armorSides", label: "Sides", tab: "stats", group: "Armor", step: 1, armor: true },
  { key: "armorRear", label: "Rear", tab: "stats", group: "Armor", step: 1, armor: true },
  { key: "armorTop", label: "Top", tab: "stats", group: "Armor", step: 1, armor: true },
  { key: "ecm", label: "ECM", tab: "stats", group: "Armor", step: 0.05, decimals: 2, hardMin: -1, hardMax: 0, hint: "Negative = harder to hit (-0.4 is a 40% penalty)" },

  { key: "speed", label: "Top speed", unit: "km/h", tab: "mobility", group: "Speed & fuel", step: 1 },
  { key: "roadSpeed", label: "Road speed (display only)", unit: "km/h", tab: "mobility", group: "Speed & fuel", step: 1 },
  { key: "fuel", label: "Fuel", unit: "L", tab: "mobility", group: "Speed & fuel", step: 10 },
  { key: "autonomy", label: "Autonomy", unit: "s", tab: "mobility", group: "Speed & fuel", step: 5 },
  { key: "accel", label: "Acceleration", unit: "GRU/s²", tab: "mobility", group: "Ground handling", step: 1 },
  { key: "decel", label: "Braking", unit: "GRU/s²", tab: "mobility", group: "Ground handling", step: 1 },
  { key: "turnTime", label: "Half-turn time", unit: "s", tab: "mobility", group: "Ground handling", step: 0.1, decimals: 1, hint: "Time to turn around 180°: lower is nimbler" },
  { key: "roadFactor", label: "Road speed bonus", unit: "×", tab: "mobility", group: "Ground handling", step: 0.05, decimals: 2 },
  { key: "turnRadius", label: "Turn radius", unit: "GRU", tab: "mobility", group: "Flight", step: 25, hint: "Lower turns tighter (dogfighting)" },
  { key: "altitude", label: "Cruise altitude", unit: "GRU", tab: "mobility", group: "Flight", step: 25 },
  { key: "altitudeMin", label: "Minimum altitude", unit: "GRU", tab: "mobility", group: "Flight", step: 5 },
  { key: "rollAngle", label: "Max bank angle", unit: "°", tab: "mobility", group: "Flight", step: 1, hardMax: 90 },
  { key: "rollSpeed", label: "Roll rate", unit: "°/s", tab: "mobility", group: "Flight", step: 1 },
  { key: "pitchAngle", label: "Max pitch", unit: "°", tab: "mobility", group: "Flight", step: 1, hardMax: 90 },
  { key: "travelTime", label: "Time to arrive", unit: "s", tab: "mobility", group: "Flight", step: 1, hint: "Delay before the plane reaches the map" },
  { key: "evacTime", label: "Evacuation time", unit: "s", tab: "mobility", group: "Flight", step: 1 },
  { key: "climb", label: "Climb speed", unit: "km/h", tab: "mobility", group: "Helicopter", step: 1 },
  { key: "torque", label: "Yaw agility", tab: "mobility", group: "Helicopter", step: 5 },
  { key: "cyclic", label: "Pitch/roll agility", tab: "mobility", group: "Helicopter", step: 5 },
  { key: "gLimit", label: "G-force limit", tab: "mobility", group: "Helicopter", step: 0.1, decimals: 1 },
  { key: "inclination", label: "Max tilt", unit: "°", tab: "mobility", group: "Helicopter", step: 1, hardMax: 90 },
  { key: "deployTime", label: "Weapon deploy time", unit: "s", tab: "mobility", group: "Deployment", step: 0.5, decimals: 1 },
  { key: "packTime", label: "Weapon pack-up time", unit: "s", tab: "mobility", group: "Deployment", step: 0.5, decimals: 1 },
];

// Editable ammunition stats (per mounted weapon). Ranges come from game.ammoRanges[category].
export const AMMO_STATS = [
  { key: "power", label: "Power (AP / damage level)", group: "Damage", step: 1, power: true, hint: "Index into the damage table for this weapon's damage type" },
  { key: "damage", label: "HE damage", group: "Damage", step: 0.1, decimals: 2 },
  { key: "suppress", label: "Suppression", group: "Damage", step: 5 },
  { key: "splash", label: "Splash radius", unit: "GRU", group: "Damage", step: 1 },
  { key: "range", label: "Range vs ground", unit: "GRU", group: "Range", step: 25 },
  { key: "rangeMin", label: "Minimum range", unit: "GRU", group: "Range", step: 25 },
  { key: "rangeHeli", label: "Range vs helicopters", unit: "GRU", group: "Range", step: 25 },
  { key: "rangeAir", label: "Range vs planes", unit: "GRU", group: "Range", step: 25 },
  { key: "accuracy", label: "Accuracy (stationary)", unit: "%", group: "Handling", step: 1, hardMax: 100 },
  { key: "accuracyMoving", label: "Accuracy (moving)", unit: "%", group: "Handling", step: 1, hardMax: 100 },
  { key: "aimTime", label: "Aim time", unit: "s", group: "Handling", step: 0.1, decimals: 1, tick: true },
  { key: "reload", label: "Reload (between salvos)", unit: "s", group: "Handling", step: 0.1, decimals: 1 },
  { key: "shotsPerSalvo", label: "Shots per salvo", group: "Handling", step: 1, hardMin: 1 },
  { key: "shotInterval", label: "Time between shots", unit: "s", group: "Handling", step: 0.1, decimals: 1, hardMin: 0.1, tick: true, hint: "Must be a multiple of the 0.1 s game tick" },
  { key: "arcAngle", label: "Launch angle", unit: "°", group: "Trajectory", step: 1, hardMin: 5, hardMax: 85, hint: "Indirect fire: higher = steeper, slower arc" },
  { key: "projectileSpeed", label: "Projectile speed", unit: "GRU/s", group: "Trajectory", step: 25 },
  { key: "supplyCost", label: "Supply cost per salvo", group: "Handling", step: 1 },
];

const TOKEN_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** Localisation tokens in WARNO are 10 upper-case letters (e.g. 'HMNGALJGAU'). */
export function newToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return Array.from(bytes, (b) => TOKEN_CHARS[b % 26]).join("");
}

export function newId() {
  return crypto.randomUUID();
}

/**
 * Why a country tag can't be used, or null. Tags become '#TAG' text commands in the
 * UI's TextFormatScript bank, so they must not collide with existing commands like INF or CMD.
 */
export function tagProblem(game, project, nationId, tag) {
  if (!tag) return "Required: the internal country code, like US or SOV.";
  if (tag.length < 2) return "Must be at least 2 characters.";
  if (game.countriesByTag.has(tag)) return `${tag} is a vanilla country.`;
  const reserved = (game.reservedTextKeys || []).find((k) => k.toUpperCase() === tag);
  if (reserved) return `${tag} is reserved by the game's UI (it's the #${reserved} text icon). Pick another tag.`;
  if (project.nations.some((o) => o.id !== nationId && o.tag === tag)) return "Another nation uses this tag.";
  return null;
}

export function sanitizeTag(value) {
  return String(value || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 6);
}

/** Safe identifier fragment for NDF names / file names (always used after a prefix). */
export function slugify(value, max = 32) {
  const s = String(value || "")
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, max);
  return s || "Unnamed";
}

export function newProject(name = "My WARNO mod") {
  const now = Date.now();
  return {
    id: newId(),
    schema: 1,
    name,
    createdAt: now,
    updatedAt: now,
    alliances: [],
    nations: [],
    units: [],
    divisions: [],
    abilities: [],
    assets: {},
  };
}

/** Fill in collections added in later versions, so old saved projects keep working. */
export function normalizeProject(p) {
  return { alliances: [], nations: [], units: [], divisions: [], abilities: [], assets: {}, ...p };
}

export function newAlliance() {
  return { id: newId(), name: "New alliance", side: "NATO", color: "#16a34a", description: "" };
}

export function newNation() {
  return {
    id: newId(),
    tag: "",
    name: "",
    allianceId: "NATO",
    flagAssetId: null,
    baseFlagCountry: "US",
    voiceCountry: "US",
    unitNamesDico: "NAMES_US",
  };
}

export function newUnit(baseUnit, nationTag) {
  return {
    id: newId(),
    baseUnitId: baseUnit.id,
    name: `${titleCase(baseUnit.name)} Mk2`,
    nationTag: nationTag || baseUnit.country,
    stats: {},
    iconAssetId: null,
    nameToken: newToken(),
    guid: newId(),
  };
}

export function newAbility() {
  return {
    id: newId(),
    name: "New ability",
    description: "",
    mode: "self",
    range: 500,
    targets: "ground",
    includeSelf: true,
    effects: [{ key: "damageTaken", value: -15 }],
    iconTexture: "Texture_Speciality_Icon_resolute",
    iconAssetId: null,
    guid: newId(),
    packGuid: newId(),
    titleToken: newToken(),
    bodyToken: newToken(),
  };
}

/** Stable GUID derived from a string, so re-exports produce identical files. */
export function guidFrom(seed) {
  const hex = [0x811c9dc5, 0x01000193, 0x2f2b1c3d, 0x6a09e667].map((h) => {
    for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619) >>> 0;
    return h.toString(16).padStart(8, "0");
  }).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export function newDivision(nationTag) {
  return {
    id: newId(),
    name: "New Division",
    nationTag: nationTag || "",
    typeToken: "MECHANIZ",
    baseDivisionId: null,
    activationPoints: 50,
    emblemAssetId: null,
    summary: "",
    history: "",
    roster: [],
    costMatrix: null,
    nameToken: newToken(),
    summaryToken: newToken(),
    historyToken: newToken(),
    guid: newId(),
  };
}

/**
 * Game names are ALL CAPS. Title-case plain words ("ABRAMS" -> "Abrams") but leave
 * designations and acronyms alone ("M1A1(HA)", "CMD", "T-80BV", "16DE").
 */
export function titleCase(s) {
  return String(s || "")
    .split(" ")
    .map((w) => (/^['"(]*[A-Za-z]{4,}['")]*$/.test(w) ? w.toLowerCase().replace(/[a-z]/, (c) => c.toUpperCase()) : w))
    .join(" ");
}

export const customRef = (unitId) => `custom:${unitId}`;
export const isCustomRef = (ref) => typeof ref === "string" && ref.startsWith("custom:");

// ── Lookups ──────────────────────────────────────────────────────────────────

export function allAlliances(project) {
  return [...BUILTIN_ALLIANCES, ...(project.alliances || [])];
}

export function allianceById(project, id) {
  return allAlliances(project).find((a) => a.id === id) || BUILTIN_ALLIANCES[0];
}

/** Every nation a unit/division can belong to: custom ones first, then vanilla. */
export function allNations(game, project) {
  const custom = (project.nations || []).map((n) => ({
    tag: n.tag,
    name: n.name || n.tag,
    side: allianceById(project, n.allianceId).side,
    custom: true,
    nation: n,
  }));
  const taken = new Set(custom.map((c) => c.tag));
  const vanilla = game.countries
    .filter((c) => !taken.has(c.tag))
    .map((c) => ({ tag: c.tag, name: c.name, side: c.coalition, custom: false, country: c }));
  return [...custom.filter((c) => c.tag), ...vanilla];
}

export function nationSide(game, project, tag) {
  return allNations(game, project).find((n) => n.tag === tag)?.side || "NATO";
}

/** Uniform view over a vanilla unit id or a `custom:<id>` reference. */
export function resolveUnitRef(game, project, ref) {
  if (isCustomRef(ref)) {
    const unit = project.units.find((u) => customRef(u.id) === ref);
    if (!unit) return null;
    const base = game.unitsById.get(unit.baseUnitId);
    if (!base) return null;
    return {
      ref,
      custom: true,
      unit,
      base,
      name: unit.name,
      factory: base.factory,
      country: unit.nationTag,
      isTransport: base.isTransport,
      stats: { ...base.stats, ...unit.stats },
    };
  }
  const base = game.unitsById.get(ref);
  if (!base) return null;
  return {
    ref,
    custom: false,
    base,
    name: titleCase(base.name),
    factory: base.factory,
    country: base.country,
    isTransport: base.isTransport,
    stats: base.stats,
  };
}

export function defaultRuleFor(game, project, ref) {
  const info = resolveUnitRef(game, project, ref);
  const baseId = info?.base?.id;
  const d = (baseId && game.unitDefaults[baseId]) || null;
  return {
    unit: ref,
    cards: d?.cards ?? 2,
    perCard: d?.perCard ?? 1,
    noTransport: d ? d.noTransport : true,
    transports: d ? [...d.transports] : [],
    xp: d ? [...d.xp] : [0, 1, 0.5, 0],
  };
}
