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
check(/PitchForParabolic\s*=\s*0\.7854/.test(ammoBlock), "launch angle 45° written as 0.7854 rad");
check(/ProjectileSpeedGRU\s*=\s*250\b/.test(ammoBlock), "projectile speed written");
const wBlock = /export WeaponDescriptor_Test_Mortar_RUR[\s\S]*?\n\)/.exec(out2.files.find((f) => f.path.endsWith("WeaponDescriptor.ndf"))?.data || "")?.[0] || "";
check(/AngleRotationBase = 3\.1416/.test(wBlock), "turret facing 180° -> AngleRotationBase 3.1416");
check(/AngleRotationMaxPitch = 1\.2217/.test(wBlock), "elevation 70° -> 1.2217");
check(/AngleRotationMinPitch = -0\.0873/.test(wBlock), "depression 5° -> -0.0873");

const p3 = newProject("squad");
p3.nations.push({ ...newNation(), tag: "RUR", name: "Ruritania" });
const rifles = { ...newUnit(game.unitsById.get("Descriptor_Unit_Rifles_US"), "RUR"), name: "Big Squad", stats: { soldiers: 12, health: 12 } };
p3.units.push(rifles);
const out3 = await buildModFiles({ project: p3, game, source });
const uBlock = /export Descriptor_Unit_Big_Squad_RUR[\s\S]*?\n\)/.exec(out3.files.find((f) => f.path.endsWith("UniteDescriptor.ndf"))?.data || "")?.[0] || "";
check(/SoldierCount = 12/.test(uBlock) && /MaxPhysicalDamages = 12/.test(uBlock), "squad of 12 with 12 health");
check(validateProject({ ...p3, units: [{ ...rifles, stats: { soldiers: 12 } }] }, game).warnings.some((w) => w.message.includes("one health point per soldier")), "squad/health mismatch warns");

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

console.log(failed ? `${failed} check(s) failed` : "all checks passed");
process.exit(failed ? 1 : 0);
