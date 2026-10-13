// Data for the in-game style unit card (components/UnitCard.jsx).

import { boxSalvos, effectiveMounted, isUtilityAmmo, normalizeWeapons } from "./weapons.js";

const AP_FAMILIES = new Set(["DamageFamily_ap", "DamageFamily_ap_missile", "DamageFamily_roquette_ap"]);
const r1 = (x) => Math.round((x || 0) * 10) / 10;

/** Trait icons (images/traits) like the little symbols above each weapon in game. */
function weaponTraits(w) {
  const t = [];
  const fam = w.ammo.family || "";
  if (w.ammo.indirect) t.push({ icon: "indirect", label: "Indirect fire" });
  if (w.ammo.projectile === "GuidedMissile") t.push({ icon: "fireAndForget", label: "Guided missile" });
  if (fam === "DamageFamily_ap") t.push({ icon: "KE", label: "Kinetic (AP)" });
  else if (fam.includes("ap_missile") || fam.includes("roquette_ap") || fam.includes("heat")) t.push({ icon: "HEAT", label: "HEAT" });
  else if (fam.includes("he") || fam.includes("frag")) t.push({ icon: "HE", label: "High explosive" });
  if (w.stats.rangeAir > 0 || w.stats.rangeHeli > 0) t.push({ icon: "antiair", label: "Can hit aircraft" });
  if (fam.includes("napalm")) t.push({ icon: "napalm", label: "Napalm" });
  if (fam.includes("cluster")) t.push({ icon: "cluster", label: "Cluster" });
  if (w.coax) t.push({ icon: "coax", label: "Coaxial" });
  return t;
}

/**
 * One column per weapon as the game shows it. Ammo variants of the same weapon on the same
 * turret (e.g. the M197's HE and AP belts) are merged into one column, taking the best values.
 */
export function cardWeapons(game, base, unit = null) {
  const loadout = base.weapon && game.weapons[base.weapon];
  if (!loadout) return [];
  const ov = normalizeWeapons(loadout, unit?.weapons || {});
  const salvos = boxSalvos(loadout, ov);
  const cols = new Map();
  for (const w of effectiveMounted(game, loadout, ov)) {
    if (!w.ammo || w.original?.hidden || isUtilityAmmo(w.ammoId)) continue;
    const s = w.stats;
    const count = w.added ? w.added.count || 1 : w.override?.count ?? w.original?.count ?? 1;
    const perSalvo = s.shotsPerSalvo || 1;
    const cycle = Math.max(0.1, (perSalvo - 1) * (s.shotInterval || 0) + (s.reload || 0));
    const col = {
      key: `${w.ti}:${w.ammo.name}`,
      name: w.ammo.name || w.ammoId.replace(/^Ammo_/, ""),
      icon: w.ammo.icon,
      count,
      ammoCount: Math.round((salvos[w.box] || 0) * (w.ammo.salvoDisplay || perSalvo)),
      ap: AP_FAMILIES.has(w.ammo.family),
      power: s.power || 0,
      indirect: !!w.ammo.indirect,
      range: s.range || 0,
      rangeHeli: s.rangeHeli || 0,
      rangeAir: s.rangeAir || 0,
      damage: r1(s.damage),
      suppress: Math.round(s.suppress || 0),
      accuracy: Math.round(s.accuracy || 0),
      accuracyMoving: s.accuracyMoving != null ? Math.round(s.accuracyMoving) : null,
      rof: Math.round((60 * perSalvo * (w.ammo.simultaneous || 1)) / cycle),
      perSalvo,
      reload: r1(s.reload),
      aimTime: r1(s.aimTime),
      traits: weaponTraits({ ...w, coax: !!w.added?.coax }),
    };
    const prev = cols.get(col.key);
    if (!prev) {
      cols.set(col.key, col);
      continue;
    }
    // merge variants: best of each, AP if either is
    for (const k of ["power", "range", "rangeHeli", "rangeAir", "damage", "suppress", "accuracy", "rof"]) prev[k] = Math.max(prev[k], col[k]);
    prev.ap ||= col.ap;
    if (prev.box !== w.box) prev.ammoCount = Math.max(prev.ammoCount, col.ammoCount);
    for (const t of col.traits) if (!prev.traits.some((x) => x.icon === t.icon)) prev.traits.push(t);
  }
  return [...cols.values()];
}

const scales = new WeakMap();

/** Bar maxima: the 97th percentile of each stat over all vanilla ammo, so one outlier doesn't flatten the rest. */
export function statScale(game) {
  let s = scales.get(game);
  if (s) return s;
  const all = Object.entries(game.ammo)
    .filter(([id, a]) => a.stats && !isUtilityAmmo(id))
    .map(([, a]) => a);
  const p97 = (get) => {
    const v = all.map(get).filter((x) => x > 0).sort((a, b) => a - b);
    return v.length ? v[Math.floor(v.length * 0.97)] : 1;
  };
  s = {
    power: p97((a) => a.stats.power),
    range: p97((a) => (a.indirect ? 0 : a.stats.range)),
    indirect: p97((a) => (a.indirect ? a.stats.range : 0)),
    rangeAir: p97((a) => a.stats.rangeAir),
    damage: p97((a) => a.stats.damage),
    suppress: p97((a) => a.stats.suppress),
    rof: p97((a) => {
      const st = a.stats;
      const per = st.shotsPerSalvo || 1;
      return (60 * per) / Math.max(0.1, (per - 1) * (st.shotInterval || 0) + (st.reload || 0));
    }),
  };
  scales.set(game, s);
  return s;
}
