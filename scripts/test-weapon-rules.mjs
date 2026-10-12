// Checks the weapon-loadout rules against real game data:
//   node scripts/test-weapon-rules.mjs [MOD_ROOT]
// Reproduces "Two ammunitions used by weapons on ammo box '0' don't have the same ShotCountPerSalvo"
// and verifies that validation blocks it and that moving the weapon to its own ammo box fixes it.
import fs from "node:fs";
import path from "node:path";
import { buildModFiles } from "../src/lib/exportMod.js";
import { indexGameData } from "../src/lib/gameData.js";
import { customRef, defaultRuleFor, newDivision, newNation, newProject, newUnit } from "../src/lib/model.js";
import { validateProject } from "../src/lib/validate.js";
import { squadWeaponCount } from "../src/lib/weapons.js";

const modRoot = path.resolve(process.argv[2] || "SampleMods/modexample");
const game = indexGameData(JSON.parse(fs.readFileSync("public/data/game-data.json", "utf8")));
const source = {
  name: path.basename(modRoot),
  readText: async (rel) => (fs.existsSync(path.join(modRoot, rel)) ? fs.readFileSync(path.join(modRoot, rel), "utf8") : null),
};
let failed = 0;
const check = (ok, msg) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${msg}`);
  if (!ok) failed++;
};

function project(unitPatch) {
  const p = newProject("rules");
  p.nations.push({ ...newNation(), tag: "RUR", name: "Ruritania" });
  // 81mm mortar: box 0 is shared by HE and smoke rounds, both 5 shots per salvo
  const u = { ...newUnit(game.unitsById.get("Descriptor_Unit_81mm_mortar_Aero_US"), "RUR"), name: "Test Mortar", ...unitPatch };
  p.units.push(u);
  const d = { ...newDivision("RUR"), name: "Test Div" };
  d.costMatrix = structuredClone(Object.values(game.costMatrices)[0]);
  d.roster = [defaultRuleFor(game, p, customRef(u.id))];
  d.roster[0].noTransport = true;
  p.divisions.push(d);
  return p;
}
const errorsOf = (p) => validateProject(p, game).errors.map((e) => e.message);

// 1. swap the smoke round for a 1-shot tank round on the shared box -> must be rejected
const bad = project({ weapons: { mounted: { "0.1": { ammo: "Ammo_Canon_HE_120_mm_L52_M68" } } } });
check(errorsOf(bad).some((m) => m.includes("shots per salvo")), "mismatched shots-per-salvo on a shared box is an error");

// 2. same swap on its own ammo box -> valid, and exported correctly
const fixed = project({ weapons: { mounted: { "0.1": { ammo: "Ammo_Canon_HE_120_mm_L52_M68", ownBox: true, ownBoxSalvos: 12 } } } });
check(errorsOf(fixed).length === 0, `own ammo box clears the error (${errorsOf(fixed).join("; ") || "no errors"})`);
const out = await buildModFiles({ project: fixed, game, source });
const wFile = out.files.find((f) => f.path.endsWith("WeaponDescriptor.ndf"));
const block = /export WeaponDescriptor_Test_Mortar_RUR[\s\S]*?\n\)/.exec(wFile?.data || "")?.[0] || "";
check(/Salves\s*=\s*\[\s*22,\s*12,\s*\]/.test(block), "new box appended to Salves (22, 12)");
const mounted = block.split("TMountedWeaponDescriptor").slice(1);
check(/AmmoBoxIndex = 0/.test(mounted[0]) && /AmmoBoxIndex = 1/.test(mounted[1]), "swapped weapon points at box 1, the other stays on box 0");

// 3. editing shots per salvo on a shared box is also caught
const edited = project({ weapons: { mounted: { "0.0": { stats: { shotsPerSalvo: 3 } } } } });
check(errorsOf(edited).some((m) => m.includes("shots per salvo")), "editing shots-per-salvo on a shared box is an error");

// 4. mount rules
const bomb = project({ weapons: { mounted: { "0.0": { ammo: Object.keys(game.ammo).find((id) => game.ammo[id].projectile === "Bombe"), ownBox: true } } } });
check(errorsOf(bomb).some((m) => m.includes("bombs need a bomb bay")), "a bomb on a non-bomb-bay mount is an error");

// 5. trajectory, turret angles and squad size reach the NDF
const traj = project({
  stats: {},
  weapons: {
    turrets: { 0: { facing: 180, elevation: 70, depression: 5 } },
    mounted: { "0.0": { stats: { arcAngle: 45, projectileSpeed: 250 } } },
  },
});
const out2 = await buildModFiles({ project: traj, game, source });
const ammoFile = out2.files.find((f) => f.path.endsWith("/Ammunition.ndf"))?.data || "";
const ammoBlock = /Ammo_Test_Mortar_RUR_T1W1 is[\s\S]*?\n\)/.exec(ammoFile)?.[0] || "";
check(/PitchForParabolic\s*=\s*0\.7853981633974483\b/.test(ammoBlock), "launch angle 45° written as exact radians");
check(/ProjectileSpeedGRU\s*=\s*250\b/.test(ammoBlock), "projectile speed written");
const wBlock = /export WeaponDescriptor_Test_Mortar_RUR[\s\S]*?\n\)/.exec(out2.files.find((f) => f.path.endsWith("WeaponDescriptor.ndf"))?.data || "")?.[0] || "";
check(/AngleRotationBase = 3\.141592653589793\b/.test(wBlock), "turret facing 180° -> exact pi");
check(/AngleRotationMaxPitch = 1\.2217304763960306\b/.test(wBlock), "elevation 70° -> exact radians");
check(/AngleRotationMinPitch = -0\.08726646259971647\b/.test(wBlock), "depression 5° -> exact radians");

const p3 = newProject("squad");
p3.nations.push({ ...newNation(), tag: "RUR", name: "Ruritania" });
// Rifles carry 7 M16 + 3 other weapons = 10; 12 soldiers need 2 more M16s (engine: one weapon per soldier)
const rifles = { ...newUnit(game.unitsById.get("Descriptor_Unit_Rifles_US"), "RUR"), name: "Big Squad", stats: { soldiers: 12, health: 12 }, weapons: { mounted: { "0.0": { count: 9 } } } };
p3.units.push(rifles);
const out3 = await buildModFiles({ project: p3, game, source });
const uBlock = /export Descriptor_Unit_Big_Squad_RUR[\s\S]*?\n\)/.exec(out3.files.find((f) => f.path.endsWith("UniteDescriptor.ndf"))?.data || "")?.[0] || "";
check(/SoldierCount = 12/.test(uBlock) && /MaxPhysicalDamages = 12/.test(uBlock), "squad of 12 with 12 health");
check(validateProject({ ...p3, units: [{ ...rifles, stats: { soldiers: 12 } }] }, game).warnings.some((w) => w.message.includes("one health point per soldier")), "squad/health mismatch warns");
const unarmed = validateProject({ ...p3, units: [{ ...rifles, weapons: undefined }] }, game).errors;
check(unarmed.some((e) => e.message.includes("12 soldiers but only 10 weapons") && e.tab === "stats"), "more soldiers than weapons is an error (engine: Too few weapons)");
check(!validateProject(p3, game).errors.some((e) => e.message.includes("weapons; the game refuses")), "12 soldiers with 12 weapons is fine");
// two ammo types on one turret count once (the engine counted a user's 4 AKS + RPG-7 VR/VL squad as 5)
const milTch = game.unitsById.get("Descriptor_Unit_Militia_CMD_TCH"); // 5 soldiers: 5 rifles + one launcher turret with 2 ammo types
check(game.weapons[milTch.weapon].turrets[1].mounted.length === 2, "Militia_CMD_TCH has a turret with two ammo types");
const shortMil = { ...newUnit(milTch, "RUR"), name: "Short Mil", weapons: { mounted: { "0.0": { count: 3 } } } };
check(squadWeaponCount(game, milTch, shortMil) === 4, "3 rifles + a 2-ammo launcher = 4 weapons, not 5");
check(validateProject({ ...p3, units: [shortMil] }, game).errors.some((e) => e.message.includes("5 soldiers but only 4 weapons")), "...so a 5-man squad with it is an error");
const vanillaShort = game.units.filter((u) => u.stats.soldiers && squadWeaponCount(game, u) < u.stats.soldiers);
check(vanillaShort.length === 0, `every vanilla squad has a weapon per soldier (${vanillaShort.length} exceptions)`);

// 6. freely added boxes: extraBoxes + per-weapon box index
const added = project({ weapons: { extraBoxes: [8], mounted: { "0.1": { box: 1 } } } });
check(errorsOf(added).length === 0, `weapon moved into an added box is valid (${errorsOf(added).join("; ") || "no errors"})`);
const out4 = await buildModFiles({ project: added, game, source });
const block4 = /export WeaponDescriptor_Test_Mortar_RUR[\s\S]*?\n\)/.exec(out4.files.find((f) => f.path.endsWith("WeaponDescriptor.ndf"))?.data || "")?.[0] || "";
check(/Salves\s*=\s*\[\s*22,\s*8,\s*\]/.test(block4), "added box appended to Salves (22, 8)");
check(/AmmoBoxIndex = 1/.test(block4.split("TMountedWeaponDescriptor")[2] || ""), "weapon points at the added box");
const empty = project({ weapons: { extraBoxes: [8] } });
check(errorsOf(empty).some((m) => m.includes("has no weapons")), "an added box with no weapons is an error");
const tooMany = project({ weapons: { extraBoxes: [1, 1, 1, 1, 1], mounted: { "0.1": { box: 1 } } } });
check(errorsOf(tooMany).some((m) => m.includes("never uses more than 5")), "more than 5 boxes is an error");

// 7. impact + icon swaps clone the ammo with the new look
const look = project({ weapons: { mounted: { "0.0": { look: { impact: "CanonGrosAPFDSM1Abrams", icon: "Texture_Interface_Weapon_M68_120" } } } } });
const out5 = await buildModFiles({ project: look, game, source });
const ammo5 = /Ammo_Test_Mortar_RUR_T1W1 is[\s\S]*?\n\)/.exec(out5.files.find((f) => f.path.endsWith("/Ammunition.ndf"))?.data || "")?.[0] || "";
check(/ImpactHappening\s*=\s*'CanonGrosAPFDSM1Abrams'/.test(ammo5), "impact effect swapped on cloned ammo");
check(/InterfaceWeaponTexture\s*=\s*"Texture_Interface_Weapon_M68_120"/.test(ammo5), "weapon icon swapped on cloned ammo");

// 8. ammo timings must be whole 0.1 s game ticks
const offTick = project({ weapons: { mounted: { "0.0": { stats: { shotInterval: 0.95 } } } } });
check(errorsOf(offTick).some((m) => m.includes("multiple of the 0.1 s game tick")), "time between shots off the 0.1 s tick is an error");

// 9. angle limits: 90° elevation must be exactly pi/2 (a rounded 1.5708 is over the engine's limit);
//    360° traverse exactly 2*pi on rotating turrets, clamped to pi on fixed mounts
function unitProject(unitId, name, weapons) {
  const p = newProject("add");
  p.nations.push({ ...newNation(), tag: "RUR", name: "Ruritania" });
  const u = { ...newUnit(game.unitsById.get(unitId), "RUR"), name, weapons };
  p.units.push(u);
  const d = { ...newDivision("RUR"), name: "Test Div" };
  d.costMatrix = structuredClone(Object.values(game.costMatrices)[0]);
  d.roster = [{ ...defaultRuleFor(game, p, customRef(u.id)), noTransport: true }];
  p.divisions.push(d);
  return p;
}
const limits = unitProject("Descriptor_Unit_M1A1_Abrams_US", "Limit Tank", { turrets: { 0: { elevation: 90, traverse: 360 }, 4: { elevation: 90, traverse: 360 } } });
const wl = /export WeaponDescriptor_Limit_Tank_RUR[\s\S]*?\n\)/.exec((await buildModFiles({ project: limits, game, source })).files.find((f) => f.path.endsWith("WeaponDescriptor.ndf"))?.data || "")?.[0] || "";
const tl = wl.split(/\n {8}TTurret/).slice(1);
check(/AngleRotationMaxPitch = 1\.5707963267948966\b/.test(tl[0]) && /AngleRotationMaxPitch = 1\.5707963267948966\b/.test(tl[4]), "90° elevation written as exact pi/2 (not 1.5708)");
check(/AngleRotationMax = 6\.283185307179586\b/.test(tl[0]), "360° traverse on a rotating turret = exact 2*pi");
check(/AngleRotationMax = 3\.141592653589793\b/.test(tl[4]), "360° traverse on a fixed mount clamped to pi");

// 10. adding weapons: one on the AAVP-7's main turret and a coaxial gun slaved to it
const AAV = "Descriptor_Unit_AAVP_7A1_USMC_US";
const aavBase = game.unitsById.get(AAV);
// vanilla slot numbers aren't contiguous (AAV-7: 1, 4, 5), so new weapons take max + 1, max + 2
const aavMax = Math.max(...game.weapons[aavBase.weapon].turrets.flatMap((t) => t.mounted.map((m) => m.slot)));
const [s1, s2] = [aavMax + 1, aavMax + 2];
const aavAnchor = game.depictions[aavBase.blackHoleKey].slots[game.weapons[aavBase.weapon].turrets[0].mounted[0].slot].anchors[0];
const addP = unitProject(AAV, "Gun Tank", {
  extraBoxes: [400, 800],
  added: [
    { id: "a1", turret: 0, coax: false, ammo: "Ammo_HMG_12_7_mm_M2HB", count: 1, box: 3 },
    { id: "a2", turret: 0, coax: true, ammo: "Ammo_MMG_M240_7_62mm", count: 2, box: 4 },
  ],
});
check(errorsOf(addP).length === 0, `added weapon + coaxial gun are valid (${errorsOf(addP).join("; ") || "no errors"})`);
const out6 = await buildModFiles({ project: addP, game, source });
const file = (end) => out6.files.find((f) => f.path.endsWith(end))?.data || "";
const w6 = /export WeaponDescriptor_Gun_Tank_RUR[\s\S]*?\n\)/.exec(file("WeaponDescriptor.ndf"))?.[0] || "";
const turretsOut = w6.split(/\n {8}TTurret/).slice(1);
check(turretsOut.length === 4, `coaxial turret appended (4 turrets, got ${turretsOut.length})`);
check(new RegExp(String.raw`Ammo_HMG_12_7_mm_M2HB[\s\S]*WeaponActiveAndCanShoot_${s1}\b`).test(turretsOut[0]), `added HMG sits on the main turret as weapon slot ${s1}`);
const masterBone = game.weapons[aavBase.weapon].turrets[0].bone;
check(new RegExp(`MasterTurretYulBoneOrdinal = ${masterBone}\\b`).test(turretsOut[3]) && new RegExp(`YulBoneOrdinal = ${masterBone}\\b`).test(turretsOut[3]) && new RegExp(String.raw`WeaponShootData_0_${s2}\b`).test(turretsOut[3]), `coaxial turret slaved to the main turret's bone, slot ${s2}`);
check(/Salves\s*=\s*\[[^\]]*400,\s*800,\s*\]/.test(w6), "two added ammo boxes appended");
const u6 = /export Descriptor_Unit_Gun_Tank_RUR[\s\S]*?\n\)/.exec(file("UniteDescriptor.ndf"))?.[0] || "";
check(/BlackHoleKey = "WR_Gun_Tank_RUR"/.test(u6), "unit points at its own depiction");
const dv = file("DepictionVehicles.ndf");
check(new RegExp(`DepictionOperator_WR_Gun_Tank_RUR_Weapon${s1} is DepictionOperator_WeaponContinuousFire[\\s\\S]*?${aavAnchor}`).test(dv), `fire operator for slot ${s1} uses the main turret's muzzle point`);
check(new RegExp(String.raw`BlackHoleKey = 'WR_Gun_Tank_RUR'[\s\S]*"weapon_effet_tag${s1}", Weapon_HMG_12_7_mm_M2HB[\s\S]*"weapon_effet_tag${s2}", Weapon_MMG_M240_7_62mm`).test(dv), `cloned registration maps slots ${s1} and ${s2} to firing effects`);
check(/BlackHoleKey = "WR_Gun_Tank_RUR"/.test(file("DepictionGhosts.ndf")), "placement ghost cloned");
const reExport = await buildModFiles({ project: addP, game, source: { ...source, readText: async (rel) => out6.files.find((f) => f.path === rel)?.data ?? source.readText(rel) } });
check(reExport.files.filter((f) => typeof f.data === "string").every((f) => f.data === out6.files.find((g) => g.path === f.path)?.data), "re-exporting added weapons is idempotent");

// 11. limits and unsupported cases
const tooManyWeapons = unitProject("Descriptor_Unit_M1A1_Abrams_US", "Full Tank", { added: [1, 2].map((i) => ({ id: `x${i}`, turret: 1, coax: false, ammo: "Ammo_HMG_12_7_mm_M2HB", count: 1, box: 1 })) });
check(errorsOf(tooManyWeapons).some((m) => m.includes("never uses more than 6")), "more than 6 weapons is an error");
const inf = newProject("inf");
inf.nations.push({ ...newNation(), tag: "RUR", name: "Ruritania" });
inf.units.push({ ...newUnit(game.unitsById.get("Descriptor_Unit_Rifles_US"), "RUR"), name: "Inf", weapons: { added: [{ id: "i", turret: 0, ammo: "Ammo_HMG_12_7_mm_M2HB", count: 1, box: 0 }] } });
check(validateProject(inf, game).errors.some((e) => e.message.includes("only supported for ground vehicles")), "adding weapons to infantry is refused for now");

console.log(failed ? `${failed} check(s) failed` : "all checks passed");
process.exit(failed ? 1 : 0);
