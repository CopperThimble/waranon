// Points model: what a unit "should" cost given its stats, learned from vanilla prices.
//
// One ridge regression per category (tanks, infantry, planes…) — and per unit type inside a category
// (command, ATGM team, howitzer…) when there are enough of them — on log(command points), so each
// feature's effect is a multiplier ("+12% per armor level above average"). The same feature code
// runs in the trainer (scripts/build_cost_model.mjs) and in the app, so custom units — with their
// stat edits, swapped/added weapons and abilities — are scored exactly like vanilla ones.

import { VANILLA_ABILITIES, presetActive } from "./abilities.js";
import { ROLE_LABELS } from "./labels.js";
import { boxSalvos, effectiveMounted, isUtilityAmmo, normalizeWeapons } from "./weapons.js";

const AT_FAMILIES = new Set(["DamageFamily_ap", "DamageFamily_ap_missile", "DamageFamily_roquette_ap"]);
const ROLES = ["reco", "appui", "infantry", "AA", "transport", "AT", "armor", "supply", "hq_inf", "howitzer", "hq_veh", "mortar", "hq_tank", "engineer", "ifv", "mlrs", "sead", "hq_helo", "uav"];
const TRAITS = ["_smoke_launcher", "_amphibie", "_para", "_transport1", "_transport2", "_ifv", "_leader", "_canBeAirlifted", "_airlift", "_mountaineer", "_falseflag"];
const ABILITY_FEATURES = VANILLA_ABILITIES.map((p) => p.id);

const log1p = (x) => Math.log1p(Math.max(0, x || 0));

/** Human labels for explanations. */
export const FEATURE_LABELS = {
  health: "Health",
  speed: "Speed",
  stealth: "Stealth",
  optics: "Optics",
  armorFront: "Front armor",
  armorSides: "Side armor",
  armorRear: "Rear armor",
  armorTop: "Top armor",
  heavyArmor: "Armored hull",
  ecm: "ECM",
  soldiers: "Squad size",
  supply: "Supply capacity",
  turnRadius: "Turn radius",
  atPower: "Anti-tank power",
  atRange: "Anti-tank range",
  atMissile: "Guided anti-tank missile",
  heDamage: "HE damage",
  heRate: "Firepower (damage per second)",
  suppress: "Suppression",
  directRange: "Direct-fire range",
  accuracy: "Accuracy",
  indirectRange: "Artillery range",
  indirectPunch: "Artillery salvo damage",
  aaRange: "Range vs planes",
  heliRange: "Range vs helicopters",
  aaPower: "Anti-air power",
  weapons: "Number of weapons",
  ammo: "Ammunition carried",
  transport: "Can carry infantry",
  ...Object.fromEntries(ROLES.map((r) => [`role:${r}`, `Type: ${(ROLE_LABELS[r] || r).toLowerCase()}`])),
  ...Object.fromEntries(TRAITS.map((t) => [`trait:${t}`, `Trait: ${t.replace(/^_/, "").replace(/_/g, " ")}`])),
  ...Object.fromEntries(VANILLA_ABILITIES.map((p) => [`ability:${p.id}`, `Ability: ${p.label}`])),
};

/**
 * Features for a unit. `unit` is a custom unit ({ stats, weapons, abilities }) or null for vanilla.
 * Returns { name: number }.
 */
export function unitFeatures(game, base, unit = null) {
  if (unit) return computeFeatures(game, base, unit);
  // vanilla units never change: compute each once per catalog (similarUnits scans whole categories)
  if (!vanillaCache.has(game)) vanillaCache.set(game, new Map());
  const cache = vanillaCache.get(game);
  if (!cache.has(base.id)) cache.set(base.id, computeFeatures(game, base, null));
  return cache.get(base.id);
}

const vanillaCache = new WeakMap();

function computeFeatures(game, base, unit) {
  const stats = { ...base.stats, ...(unit?.stats || {}) };
  const f = {};
  f.health = stats.health || 0;
  f.speed = log1p(stats.speed);
  f.stealth = stats.stealth || 0;
  f.optics = log1p(stats.optics);
  const heavy = base.armorFamily === "ResistanceFamily_blindage";
  f.heavyArmor = heavy ? 1 : 0;
  for (const side of ["Front", "Sides", "Rear", "Top"]) f[`armor${side}`] = heavy ? stats[`armor${side}`] || 0 : 0;
  f.ecm = -(stats.ecm || 0);
  f.soldiers = stats.soldiers || 0;
  f.supply = log1p(stats.supply);
  f.turnRadius = stats.turnRadius ? Math.log(stats.turnRadius) : 0;

  // weapons, after every override (swapped ammo, stat edits, counts, added weapons, extra boxes)
  const loadout = base.weapon && game.weapons[base.weapon];
  Object.assign(f, { atPower: 0, atRange: 0, atMissile: 0, heDamage: 0, heRate: 0, suppress: 0, directRange: 0, accuracy: 0 });
  Object.assign(f, { indirectRange: 0, indirectPunch: 0, aaRange: 0, heliRange: 0, aaPower: 0, weapons: 0, ammo: 0 });
  if (loadout) {
    const ov = normalizeWeapons(loadout, unit?.weapons || {});
    for (const w of effectiveMounted(game, loadout, ov)) {
      if (!w.ammo || isUtilityAmmo(w.ammoId)) continue;
      const s = w.stats;
      const count = w.added ? w.added.count || 1 : w.override.count ?? w.original.count ?? 1;
      const ground = s.range || 0;
      f.weapons += 1;
      if (!w.ammo.indirect) f.accuracy = Math.max(f.accuracy, s.accuracy || 0);
      if (s.rangeAir > 0) {
        f.aaRange = Math.max(f.aaRange, Math.log1p(s.rangeAir));
        f.aaPower = Math.max(f.aaPower, s.damage || 0);
      }
      if (s.rangeHeli > 0) f.heliRange = Math.max(f.heliRange, Math.log1p(s.rangeHeli));
      if (w.ammo.indirect) {
        f.indirectRange = Math.max(f.indirectRange, Math.log1p(ground));
        f.indirectPunch = Math.max(f.indirectPunch, log1p((s.damage || 0) * (s.shotsPerSalvo || 1) * count));
        continue;
      }
      if (ground <= 0) continue;
      f.directRange = Math.max(f.directRange, Math.log1p(ground));
      f.suppress = Math.max(f.suppress, log1p(s.suppress));
      if (AT_FAMILIES.has(w.ammo.family)) {
        if ((s.power || 0) > f.atPower) {
          f.atPower = s.power || 0;
          f.atRange = Math.log1p(ground);
          f.atMissile = w.ammo.family === "DamageFamily_ap_missile" ? 1 : 0;
        }
      } else {
        f.heDamage = Math.max(f.heDamage, s.damage || 0);
        const cycle = Math.max(0.5, (s.reload || 0) + (s.aimTime || 0));
        f.heRate += ((s.damage || 0) * (s.shotsPerSalvo || 1) * count) / cycle;
      }
    }
    f.heRate = log1p(f.heRate * 10);
    f.ammo = log1p(boxSalvos(loadout, ov).reduce((a, b) => a + b, 0));
  }

  f.transport = base.isTransport ? 1 : 0;
  for (const r of ROLES) f[`role:${r}`] = base.role === r ? 1 : 0;
  for (const t of TRAITS) f[`trait:${t}`] = base.specialties.includes(t) ? 1 : 0;
  for (const p of VANILLA_ABILITIES) f[`ability:${p.id}`] = (unit ? presetActive(p, unit, base) : presetActiveOnBaseSafe(p, base)) ? 1 : 0;
  return f;
}

function presetActiveOnBaseSafe(p, base) {
  return presetActive(p, {}, base);
}

export const ALL_FEATURES = [
  "health", "speed", "stealth", "optics", "heavyArmor", "armorFront", "armorSides", "armorRear", "armorTop", "ecm",
  "soldiers", "supply", "turnRadius",
  "atPower", "atRange", "atMissile", "heDamage", "heRate", "suppress", "directRange", "accuracy",
  "indirectRange", "indirectPunch", "aaRange", "heliRange", "aaPower", "weapons", "ammo", "transport",
  ...ROLES.map((r) => `role:${r}`), ...TRAITS.map((t) => `trait:${t}`), ...ABILITY_FEATURES.map((a) => `ability:${a}`),
];

// ── Ridge regression (small dense systems, no dependencies) ─────────────────

function solve(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    [M[c], M[piv]] = [M[piv], M[c]];
    const d = M[c][c] || 1e-12;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const k = M[r][c] / d;
      if (k) for (let j = c; j <= n; j++) M[r][j] -= k * M[c][j];
    }
  }
  return M.map((row, i) => row[n] / (row[i] || 1e-12));
}

function fitRidge(X, y, lambda) {
  const p = X[0].length;
  const ym = y.reduce((a, b) => a + b, 0) / y.length;
  const A = Array.from({ length: p }, () => new Array(p).fill(0));
  const b = new Array(p).fill(0);
  for (let i = 0; i < X.length; i++) {
    const xi = X[i];
    const yi = y[i] - ym;
    for (let j = 0; j < p; j++) {
      if (!xi[j]) continue;
      b[j] += xi[j] * yi;
      for (let k = 0; k < p; k++) A[j][k] += xi[j] * xi[k];
    }
  }
  for (let j = 0; j < p; j++) A[j][j] += lambda;
  return { coef: solve(A, b), intercept: ym };
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : 0;
};

const CATEGORY_NOUNS = {
  Infantry: "infantry", Tanks: "tank", Recons: "recon", Planes: "plane", Art: "artillery",
  Logistic: "logistics", DCA: "air defense", Helis: "helicopter",
};

/** Smallest unit type that gets its own model; smaller types use their category's model. */
export const MIN_TYPE_UNITS = 40;

const meanAbs = (xs) => xs.reduce((a, b) => a + Math.abs(b), 0) / (xs.length || 1);

/** One ridge model on rows; lambda by 5-fold CV. Also returns the held-out prediction per row id. */
function trainOne(rows, lambdas) {
  const data = [...rows].sort((a, b) => a.id.localeCompare(b.id));
  // keep features that vary in this group
  const names = ALL_FEATURES.filter((n) => new Set(data.map((r) => r.features[n])).size > 1);
  const mean = names.map((n) => data.reduce((a, r) => a + r.features[n], 0) / data.length);
  const std = names.map((n, j) => Math.sqrt(data.reduce((a, r) => a + (r.features[n] - mean[j]) ** 2, 0) / data.length) || 1);
  const X = data.map((r) => names.map((n, j) => (r.features[n] - mean[j]) / std[j]));
  const y = data.map((r) => Math.log(r.cost));

  const folds = 5;
  let best = null;
  for (const lambda of lambdas) {
    const preds = new Array(data.length);
    for (let k = 0; k < folds; k++) {
      const trainIdx = data.map((_, i) => i).filter((i) => i % folds !== k);
      const m = fitRidge(trainIdx.map((i) => X[i]), trainIdx.map((i) => y[i]), lambda);
      for (let i = k; i < data.length; i += folds) preds[i] = m.intercept + m.coef.reduce((a, c, j) => a + c * X[i][j], 0);
    }
    // choose by mean |log error|: unlike the median it penalises the odd wild miss on rare features
    const score = meanAbs(preds.map((p, i) => p - y[i]));
    if (!best || score < best.score) best = { lambda, score, preds };
  }
  const m = fitRidge(X, y, best.lambda);
  return {
    model: { n: data.length, lambda: best.lambda, features: names, mean, std, coef: m.coef, intercept: m.intercept, cv: cvStats(best.preds, y) },
    heldOut: new Map(data.map((r, i) => [r.id, best.preds[i]])),
  };
}

/** Held-out accuracy from log predictions vs log costs. */
function cvStats(preds, y) {
  const ym = y.reduce((a, b) => a + b, 0) / y.length;
  const ssRes = preds.reduce((a, p, i) => a + (y[i] - p) ** 2, 0);
  const ssTot = y.reduce((a, v) => a + (v - ym) ** 2, 0);
  return {
    medianPctError: median(preds.map((p, i) => Math.abs(Math.exp(p - y[i]) - 1))),
    medianPointsError: median(preds.map((p, i) => Math.abs(Math.exp(p) - Math.exp(y[i])))),
    r2Log: ssTot ? 1 - ssRes / ssTot : 0,
  };
}

/**
 * Train one model per category, plus one per unit type (role) inside it when the type is big enough
 * and its own model beats the category model on held-out units. rows: [{ id, category, role, features, cost }].
 * Returns { [category]: { ...model, types: { [role]: model } } }.
 */
export function trainCostModel(rows, { lambdas = [1, 3, 10, 30, 100, 300] } = {}) {
  const out = {};
  for (const cat of [...new Set(rows.map((r) => r.category))]) {
    const catRows = rows.filter((r) => r.category === cat);
    const parent = trainOne(catRows, lambdas);
    const types = {};
    const typeHeldOut = {};
    for (const role of [...new Set(catRows.map((r) => r.role))]) {
      const typeRows = catRows.filter((r) => r.role === role);
      if (typeRows.length < MIN_TYPE_UNITS || typeRows.length === catRows.length) continue;
      const own = trainOne(typeRows, lambdas);
      const err = (held) => meanAbs(typeRows.map((r) => held.get(r.id) - Math.log(r.cost)));
      const parentErr = err(parent.heldOut);
      const ownErr = err(own.heldOut);
      if (ownErr < parentErr) {
        const y = typeRows.map((r) => Math.log(r.cost));
        types[role] = { ...own.model, role, categoryCv: cvStats(typeRows.map((r) => parent.heldOut.get(r.id)), y) };
        typeHeldOut[role] = own.heldOut;
      }
    }
    // overall held-out accuracy using whichever model each unit is scored with
    const y = catRows.map((r) => Math.log(r.cost));
    const combined = catRows.map((r) => (typeHeldOut[r.role] || parent.heldOut).get(r.id));
    out[cat] = { ...parent.model, types, combinedCv: cvStats(combined, y) };
  }
  return out;
}

// ── Prediction & explanation ──────────────────────────────────────────────────

export const VERDICT_LABELS = {
  underpriced: "Underpriced (a bargain)",
  overpriced: "Overpriced",
  fair: "Fairly priced",
};

/** Points to round suggestions to (vanilla prices are multiples of 5). */
const roundTo5 = (x) => Math.max(5, Math.round(x / 5) * 5);

/**
 * The model a unit is scored with: its type's own model when one was trained, else its category's.
 * Returns { m, category, role, typed, label } or null.
 */
export function modelFor(model, base) {
  const cat = model?.categories?.[base.factory];
  if (!cat) return null;
  const typed = cat.types?.[base.role];
  const roleName = (ROLE_LABELS[base.role] || base.role).toLowerCase();
  return {
    m: typed || cat,
    category: base.factory,
    role: base.role,
    typed: !!typed,
    label: typed ? `${base.factory} · ${roleName}` : base.factory,
    /** "other command (tank) units" / "other tanks" for sentences */
    peers: `other ${typed ? roleName : CATEGORY_NOUNS[base.factory] || base.factory.toLowerCase()} units`,
    cv: typed ? typed.cv : cat.cv,
  };
}

/**
 * Suggested cost and why. Returns null if the category has no model.
 * { predicted, suggested, actual, ratio, verdict, drivers: [{ label, pct }], tolerance, scope }
 */
export function assessUnit(model, game, base, unit = null) {
  const scope = modelFor(model, base);
  if (!scope) return null;
  const { m } = scope;
  const f = unitFeatures(game, base, unit);
  const z = m.features.map((n, j) => (f[n] - m.mean[j]) / m.std[j]);
  const parts = m.features.map((n, j) => ({ name: n, value: m.coef[j] * z[j] }));
  const logPred = m.intercept + parts.reduce((a, p) => a + p.value, 0);
  const predicted = Math.exp(logPred);
  const actual = unit?.stats?.cp ?? base.stats.cp;
  const ratio = actual / predicted;
  const tolerance = Math.max(0.1, m.cv.medianPctError * 1.5);
  const verdict = ratio > 1 + tolerance ? "overpriced" : ratio < 1 / (1 + tolerance) ? "underpriced" : "fair";

  // group role one-hots into a single driver; drop negligible ones
  const grouped = new Map();
  for (const p of parts) {
    const key = p.name.startsWith("role:") ? "role" : p.name;
    const label = key === "role" ? FEATURE_LABELS[`role:${base.role}`] || "Role" : FEATURE_LABELS[p.name] || p.name;
    grouped.set(key, { label, value: (grouped.get(key)?.value || 0) + p.value });
  }
  const drivers = [...grouped.values()]
    .map((d) => ({ label: d.label, pct: Math.round((Math.exp(d.value) - 1) * 100) }))
    .filter((d) => Math.abs(d.pct) >= 3)
    .sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct));

  return { predicted, suggested: roundTo5(predicted), actual, ratio, verdict, drivers, tolerance, features: f, z, scope };
}

/** Most similar vanilla units scored by the same model (features weighted by how much they move price). */
export function similarUnits(model, game, base, unit = null, k = 5) {
  const scope = modelFor(model, base);
  if (!scope) return [];
  const { m } = scope;
  const weights = m.coef.map((c) => Math.abs(c));
  const zOf = (f) => m.features.map((n, j) => (f[n] - m.mean[j]) / m.std[j]);
  const target = zOf(unitFeatures(game, base, unit));
  return game.units
    .filter((u) => u.factory === base.factory && (!scope.typed || u.role === base.role))
    .filter((u) => !u.building && u.stats.cp > 0 && u.id !== (unit ? null : base.id))
    .map((u) => {
      const z = zOf(unitFeatures(game, u));
      const d = Math.sqrt(z.reduce((a, v, j) => a + weights[j] * (v - target[j]) ** 2, 0));
      return { unit: u, distance: d };
    })
    .sort((a, b) => a.distance - b.distance)
    .slice(0, k);
}

/** The strongest price drivers for a category (or one unit type in it), for the "what costs points" summary. */
export function categoryDrivers(model, category, top = 8, role = null) {
  const cat = model?.categories?.[category];
  const m = (role && cat?.types?.[role]) || cat;
  if (!m) return [];
  return m.features
    .map((n, j) => ({ name: n, label: FEATURE_LABELS[n] || n, pct: Math.round((Math.exp(m.coef[j]) - 1) * 100) }))
    .filter((d) => Math.abs(d.pct) >= 2)
    .sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct))
    .slice(0, top);
}
