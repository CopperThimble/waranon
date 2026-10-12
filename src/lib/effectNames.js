// Readable names and groups for the game's impact presets (MimeticImpactMapping) and firing effects
// (DepictionWeaponBlock Weapon_*), which use French/abbreviated internal names.

const WORDS = [
  [/^Artillerie/, "Artillery "],
  [/^Bomblets/, "Bomblets "],
  [/^Bombe?/, "Bomb "],
  [/^Canon/, "Cannon "],
  [/^Roquette/, "Rocket "],
  [/^Mortier/, "Mortar "],
  [/^Mitrailleuse/, "Machine gun "],
  [/^Fusile?/, "Rifle "],
  [/^MIssile/, "Missile "],
  [/^Lanceflamme/, "Flamethrower"],
  [/^Lance/, "Launcher "],
  [/^Destruction/, "Destruction "],
  [/Bombe/g, "Bomb "],
  [/Lourd/g, "Heavy "],
  [/Gros/g, "Large "],
  [/Moyen/g, "Medium "],
  [/Petit/g, "Small "],
  [/Externe/g, " external"],
  [/Infanterie/g, "Infantry"],
  [/Unite/g, "Unit "],
  [/Avion/g, "Aircraft "],
  [/Sniper Lourd/g, "Heavy sniper"],
  [/Green/g, " (green tracer)"],
];

const spaced = (s) =>
  s
    .replace(/([a-z])([A-Z0-9])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/(\d)\s*Mm\b/g, "$1 mm")
    .replace(/(\d)\s*Kg\b/g, "$1 kg")
    .replace(/\s+/g, " ")
    .trim();

/** "BombeMk84" -> "Bomb Mk 84", "CanonGrosAPFDSM1Abrams" -> "Cannon Large APFDS M1 Abrams" */
export function impactName(key) {
  let s = key;
  for (const [re, to] of WORDS) s = s.replace(re, to);
  return spaced(s);
}

const IMPACT_GROUPS = [
  [/^(Bomb|Bombe|Bomblets|MissileBombe)/, "Bombs"],
  [/^Artillerie/, "Artillery shells"],
  [/^Mortier/, "Mortars"],
  [/^Roquette/, "Rockets"],
  [/^Canon/, "Cannons & tank guns"],
  [/^M[Ii]ssile/, "Missiles"],
  [/(Gatling|Vulcan|Gsh|Mauser)/, "Gatlings & aircraft cannons"],
  [/^(Mitrailleuse|Fusil)/, "Small arms"],
  [/^(Grenade|Lance)/, "Grenades & launchers"],
  [/^Destruction/, "Destruction"],
];

export function impactGroup(key) {
  return IMPACT_GROUPS.find(([re]) => re.test(key))?.[1] || "Other";
}

const FIRING_GROUPS = [
  [/^Bomb/, "Bombs"],
  [/^Howz/, "Howitzers"],
  [/^Mortier/, "Mortars"],
  [/^(RocketArt|MLRS)/, "Rocket artillery"],
  [/^RocketAir/, "Aircraft rockets"],
  [/^RocketInf/, "Infantry rockets"],
  [/^Canon/, "Tank & field guns"],
  [/^AutoCanon/, "Autocannons"],
  [/^(ATGM|Javelin)/, "Anti-tank missiles"],
  [/^(AGM|Pave|KMGU|MW)/, "Air-to-ground weapons"],
  [/^(AA|SAM|MANPAD|Mistral|Starstreak)/, "Anti-air missiles"],
  [/^DCA/, "AA guns"],
  [/^(Gatling|GatlingAir|Pod)/, "Gatlings & gun pods"],
  [/^(HMG|hmg|MMG)/, "Machine guns"],
  [/^Lance/, "Grenade launchers"],
];

/** "Weapon_Howz_Canon_2A33_152mm" -> { label: "Howz Canon 2A33 152 mm", group: "Howitzers" } */
export function firingEffectInfo(id) {
  const tail = id.replace(/^Weapon_/, "");
  return {
    label: tail.replace(/_/g, " ").replace(/(\d)mm\b/g, "$1 mm").replace(/\bHowz\b/, "Howitzer").replace(/\bMortier\b/, "Mortar"),
    group: FIRING_GROUPS.find(([re]) => re.test(tail))?.[1] || "Other",
  };
}
