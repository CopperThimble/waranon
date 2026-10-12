// Human-readable names for the game's internal unit roles, specialties and tags.

export const ROLE_LABELS = {
  armor: "Tank",
  AT: "Anti-tank",
  AA: "Air defense",
  infantry: "Infantry",
  ifv: "IFV",
  reco: "Recon",
  appui: "Support",
  transport: "Transport",
  supply: "Supply",
  howitzer: "Howitzer",
  mortar: "Mortar",
  mlrs: "Rocket artillery",
  engineer: "Engineers",
  sead: "SEAD",
  uav: "Drone",
  hq_inf: "Command (infantry)",
  hq_veh: "Command (vehicle)",
  hq_tank: "Command (tank)",
  hq_helo: "Command (helicopter)",
};

export const SPECIALTY_LABELS = {
  _smoke_launcher: "Smoke launchers",
  _amphibie: "Amphibious",
  _leader: "Leader",
  _resolute: "Resolute",
  _choc: "Shock troops",
  _para: "Airborne",
  _transport1: "Light transport",
  _transport2: "Heavy transport",
  _reservist: "Reservists",
  _ifv: "IFV",
  _canBeAirlifted: "Air-liftable",
  _sf: "Special forces",
  _security: "Security",
  _mp: "Military police",
  _era: "Reactive armor",
  _militia: "Militia",
  _gsr: "Ground radar",
  _sniper: "Snipers",
  _mountaineer: "Mountain troops",
  _singint: "SIGINT",
  _instructor: "Instructors",
  _airlift: "Airlift",
  _cbr: "CBRN",
  _electronic_warfare: "Electronic warfare",
  _jammer: "Jammer",
  _falseflag: "False flag",
  _eo_dazzler: "EO dazzler",
};

const TAG_LABELS = {
  Infanterie: "Infantry",
  Infanterie_Standard: "Line infantry",
  Infanterie_Reco: "Recon infantry",
  Infanterie_CMD: "Command infantry",
  Infanterie_AT: "AT infantry",
  Infanterie_AA: "AA infantry",
  Infanterie_IFV: "Mechanized infantry",
  Infanterie_noAT: "Infantry (no AT)",
  Infanterie_Spec_Defense: "Defensive infantry",
  Infanterie_Spec_Attaque: "Assault infantry",
  Vehicule: "Vehicle",
  Vehicule_Transport: "Transport vehicle",
  Vehicule_Transport_Arme: "Armed transport",
  Vehicule_Reco: "Recon vehicle",
  Vehicule_CMD: "Command vehicle",
  Vehicule_Logistique: "Logistics vehicle",
  Vehicule_Appui: "Fire-support vehicle",
  Vehicule_faible: "Light vehicle",
  Char: "Tank",
  Char_Standard: "Main battle tank",
  Char_CMD: "Command tank",
  Char_Reco: "Recon tank",
  ChasseurDeChar: "Tank destroyer",
  ChasseurDeChar_Standard: "Missile tank destroyer",
  ChasseurDeChar_canon_AT: "Gun tank destroyer",
  Artillerie: "Artillery",
  Artillerie_Longue_Portee: "Long-range artillery",
  Artillerie_Courte_Portee: "Short-range artillery",
  Artillerie_MLRS: "Rocket artillery",
  Canon_AA: "AA gun",
  Canon_AA_Standard: "SPAAG",
  Canon_AA_Porte: "Self-propelled AA",
  AA_radar: "Radar AA",
  Air: "Air",
  Avion: "Aircraft",
  Avion_Chasseur: "Fighter",
  Avion_Bombardier: "Bomber",
  Avion_Bombardier_Infanterie: "Anti-infantry bomber",
  Avion_Bombardier_Vehicule: "Anti-vehicle bomber",
  Avion_AT: "Anti-tank aircraft",
  Avion_SEAD: "SEAD aircraft",
  Avion_Napalm: "Napalm",
  Avion_Reco: "Recon aircraft",
  Helo: "Helicopter",
  Helo_Gunship: "Gunship",
  Helo_Reco: "Recon helicopter",
  Helo_Transport: "Transport helicopter",
  Helo_Transport_Arme: "Armed transport helicopter",
  Helo_AT: "Anti-tank helicopter",
  Helo_AA: "AA helicopter",
  Helo_CMD: "Command helicopter",
  Helo_Logistique: "Supply helicopter",
  Commandant: "Commander",
  Radio: "Radio",
  Reco: "Recon",
  reco_radar: "Recon radar",
  Unite_transportable: "Transportable",
  CanBeAirlifted: "Air-liftable",
  isGSR: "Ground radar",
  Instructor: "Instructor",
  Non_Radar_Targetable: "Not radar-targetable",
};

const AMMO_CATEGORY_LABELS = {
  MinMax_CanonAP: "Tank gun (AP)",
  MinMax_obusier: "Howitzer",
  MinMax_Bombe: "Bomb",
  MinMax_ATGM: "ATGM",
  MinMax_Mortier: "Mortar",
  MinMax_MMG_HMG: "Machine gun",
  MinMax_DCA: "AA gun",
  MinMax_LAW: "Rocket launcher (LAW)",
  MinMax_Roquette_AS: "Air-to-ground rockets",
  MinMax_SAM: "SAM",
  MinMax_AAM: "Air-to-air missile",
  MinMax_AGM: "Air-to-ground missile",
  MinMax_Gatling: "Gatling",
  MinMax_AutocanonHE: "Autocannon",
  MinMax_Assault_rifle: "Assault rifle",
  MinMax_MLRS: "MLRS",
  MinMax_Cluster: "Cluster",
  MinMax_FLAME: "Flamethrower",
  MinMax_Grenade: "Grenade",
  MinMax_SEAD: "Anti-radar missile",
  MinMax_SMG: "SMG",
  MinMax_Shotgun: "Shotgun",
  MinMax_inf_MMG: "Infantry MG",
  MinMax_inf_sniper: "Sniper rifle",
};

export const ammoCategoryLabel = (c) => AMMO_CATEGORY_LABELS[c] || String(c || "Other").replace("MinMax_", "").replace(/_/g, " ");
export const damageFamilyLabel = (f) => String(f || "").replace("DamageFamily_", "").replace(/_/g, " ").toUpperCase();
export const cleanGameText = (s) => String(s || "").replace(/#\w+\{([^}]*)\}/g, "$1");

/** Facet keys are 'spec:<specialty>' or 'tag:<TagSet entry>'. */
export function facetLabel(key) {
  const [kind, value] = key.split(/:(.*)/);
  if (kind === "content") return value === "dlc" ? "DLC only" : "Base game";
  const label = kind === "spec" ? SPECIALTY_LABELS[value] : TAG_LABELS[value];
  return label || value.replace(/^_/, "").replace(/_/g, " ");
}

// Tags that just repeat a specialty (shown once, as the specialty).
const DUPLICATE_TAGS = new Set(["Instructor", "CanBeAirlifted", "isGSR"]);

export function unitFacets(base) {
  return [
    // base.dlc is set by markDlc (lib/dlc.js): fielded only in paid Nemesis divisions
    ...(base.divisions?.length ? [base.dlc ? "content:dlc" : "content:base"] : []),
    ...(base.specialties || []).map((s) => `spec:${s}`),
    ...(base.tags || []).filter((t) => !DUPLICATE_TAGS.has(t)).map((t) => `tag:${t}`),
  ];
}
