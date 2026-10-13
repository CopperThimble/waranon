// End-to-end check of the exporter against a real mod source folder.
//   node scripts/test-export.mjs [MOD_ROOT] [OUT_DIR]
// 1. builds a sample project (new nation + alliance, 2 cloned units, 1 division)
// 2. exports it against MOD_ROOT and writes the files to OUT_DIR
// 3. re-exports using OUT_DIR overlaid on MOD_ROOT and checks the result is identical (idempotent)

import fs from "node:fs";
import path from "node:path";
import { buildModFiles } from "../src/lib/exportMod.js";
import { indexGameData } from "../src/lib/gameData.js";
import { customRef, defaultRuleFor, newAbility, newAlliance, newDivision, newNation, newProject, newUnit } from "../src/lib/model.js";

const modRoot = path.resolve(process.argv[2] || "SampleMods/modexample");
const outDir = path.resolve(process.argv[3] || "test-output");
const game = indexGameData(JSON.parse(fs.readFileSync("public/data/game-data.json", "utf8")));

function fsSource(...roots) {
  return {
    name: path.basename(modRoot),
    async readText(rel) {
      for (const root of roots) {
        const p = path.join(root, rel);
        if (fs.existsSync(p)) return fs.readFileSync(p, "utf8");
      }
      return null;
    },
    async listDir(rel) {
      const p = path.join(modRoot, rel);
      if (!fs.existsSync(p)) return null;
      return fs.readdirSync(p, { withFileTypes: true }).map((d) => ({ name: d.name, kind: d.isDirectory() ? "directory" : "file" }));
    },
  };
}

// ── Sample project ───────────────────────────────────────────────────────────
const project = newProject("Ruritania Test");
const alliance = { ...newAlliance(), name: "Baltic League", side: "NATO" };
project.alliances.push(alliance);

const png = new Blob([fs.readFileSync("images/flags/US_FLAG.png")], { type: "image/png" });
project.assets.flag1 = { blob: png, name: "flag.png" };
project.assets.icon1 = { blob: png, name: "icon.png" };
project.assets.emblem1 = { blob: png, name: "emblem.png" };

const nation = { ...newNation(), tag: "RUR", name: "Ruritania", allianceId: alliance.id, flagAssetId: "flag1", voiceCountry: "UK", unitNamesDico: "NAMES_UK" };
// voice clips (Voices page): replace UK infantry "select", add to UK command "move", and a category UK has no lines for
const ogg = new Blob([new Uint8Array([0x4f, 0x67, 0x67, 0x53])], { type: "audio/ogg" });
for (const id of ["v1", "v2", "v3", "v4", "v5"]) project.assets[id] = { blob: ogg, name: `${id}.ogg` };
nation.voice = {
  clips: [
    { id: "c1", category: "Inf", action: "Select", assetId: "v1" },
    { id: "c2", category: "Inf", action: "Select", assetId: "v2" },
    { id: "c3", category: "Command", action: "Move", assetId: "v3" },
    { id: "c4", category: "Seals", action: "Select", assetId: "v4" },
  ],
  keepVanilla: { "Command|Move": true },
};
project.nations.push(nation);
// a second nation with a pasted name list (own name pool)
project.nations.push({
  ...newNation(), tag: "BOR", name: "Borduria", allianceId: alliance.id, baseFlagCountry: "POL", voiceCountry: null,
  voice: { clips: [{ id: "c5", category: "Inf", action: "Select", assetId: "v5" }] },
  unitNamesDico: "custom", customNames: "# test list\n1. Kurvi-Tasch\n- Sponsz\nSponsz\n\"Plekszy-Gladz\"\nZöldi; Müller\n",
});

const tank = newUnit(game.unitsById.get("Descriptor_Unit_M1A1_Abrams_US"), "RUR");
tank.name = "Rur Lion MBT";
tank.stats = { cp: 300, speed: 70, armorFront: 22, stealth: 1.25, health: 11 };
tank.iconAssetId = "icon1";
const inf = newUnit(game.unitsById.get("Descriptor_Unit_Rifles_US"), "RUR");
inf.name = "Rur Grenadiers";
inf.stats = { cp: 50 };
// Weapons: more main-gun ammo, faster turret, hotter AP round, MG swapped for a .50 cal
tank.weapons = {
  salves: { 0: 50 },
  turrets: { 0: { rotationSpeed: 75 } },
  mounted: {
    "0.0": { stats: { power: 36, range: 2450, accuracy: 70 } },
    "2.0": { ammo: "Ammo_HMG_12_7_mm_M2HB" },
  },
};
// Abilities: add vanilla Shock + ERA, plus a custom aura
const aura = { ...newAbility(), name: "Lion Command", mode: "aura", range: 600, targets: "ground",
  effects: [{ key: "accuracyStatic", value: 10 }, { key: "suppressTaken", value: -25 }], iconAssetId: "icon1" };
project.abilities.push(aura);
tank.abilities = { presets: { shock: true, era: true }, custom: [aura.id] };
inf.abilities = { presets: { sf: true } };

const jet = newUnit(game.unitsById.get("Descriptor_Unit_F15E_StrikeEagle_US"), "RUR");
jet.name = "Rur Falcon";
jet.stats = { speed: 1250, turnRadius: 800, rollSpeed: 110, travelTime: 8 };
const heli = newUnit(game.unitsById.get("Descriptor_Unit_AH64_Apache_emp1_US"), "RUR");
heli.name = "Rur Hornet";
heli.stats = { speed: 260, climb: 150, cyclic: 230 };
project.units.push(tank, inf, jet, heli);

const base = game.divisionsById.get("Descriptor_Deck_Division_US_3rd_Arm_multi");
const div = { ...newDivision("RUR"), name: "1st Lion Guards", baseDivisionId: base.id, emblemAssetId: "emblem1", summary: "Elite armor", history: "Formed 1985." };
div.roster = game.rules[base.rule].map((r) => ({ ...r }));
div.costMatrix = structuredClone(game.costMatrices[base.costMatrix]);
div.roster.push(defaultRuleFor(game, project, customRef(tank.id)));
const infRule = defaultRuleFor(game, project, customRef(inf.id));
infRule.noTransport = false;
infRule.transports = ["Descriptor_Unit_M113A3_US"];
div.roster.push(infRule);
div.roster.push(defaultRuleFor(game, project, customRef(jet.id)));
div.roster.push(defaultRuleFor(game, project, customRef(heli.id)));
project.divisions.push(div);

// ── Run ──────────────────────────────────────────────────────────────────────
const first = await buildModFiles({ project, game, source: fsSource(modRoot) });
if (first.errors.length) {
  console.error("Validation errors:", first.errors);
  process.exit(1);
}
fs.rmSync(outDir, { recursive: true, force: true });
for (const f of first.files) {
  const p = path.join(outDir, f.path);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, typeof f.data === "string" ? f.data : Buffer.from(await f.data.arrayBuffer()));
  console.log(`${f.kind.padEnd(8)} ${f.path}  — ${f.notes.join("; ")}`);
}
// custom name pool: CSV + UnitNamesDico registration + nation mapping
const byPath = Object.fromEntries(first.files.map((f) => [f.path.replace(/\\/g, "/"), f.data]));
const namesCsvPath = Object.keys(byPath).find((p) => p.endsWith("/WRN_BOR.csv"));
const expectedCsv = '"TOKEN";"REFTEXT"\r\n"1";"Kurvi-Tasch"\r\n"2";"Sponsz"\r\n"3";"Plekszy-Gladz"\r\n"4";"Zöldi Müller"\r\n';
const namesOk =
  "WRN_BOR".length <= 10 &&
  namesCsvPath?.startsWith("GameData/Localisation/") &&
  byPath[namesCsvPath] === expectedCsv &&
  byPath["GameData/Generated/Gameplay/Gfx/UnitNamesDico/Dico_WRN_BOR.ndf"]?.includes(`FileName = "GameData:/${namesCsvPath.replace(/^GameData\//, "")}"`) &&
  byPath["GameData/Generated/Gameplay/Gfx/UnitNames/UnitNames_BOR.ndf"]?.includes('DicoToken = "WRN_BOR"');
// every DescriptorId in the patched unit file must be unique (infantry squads carry a nested one)
const unitsFile = byPath["GameData/Generated/Gameplay/Gfx/UniteDescriptor.ndf"] || "";
const guids = [...unitsFile.matchAll(/DescriptorId\s*=\s*GUID:\{([^}]*)\}/g)].map((m) => m[1].toLowerCase());
const dupes = guids.filter((g, i) => guids.indexOf(g) !== i);
console.log(dupes.length ? `unique GUIDs: FAILED (${[...new Set(dupes)].join(", ")})` : `unique GUIDs: OK (${guids.length})`);
if (dupes.length) process.exit(1);
// voice lines: files + entries (inside the Waranon section of AcknowDescriptors.ndf)
const ack = byPath["GameData/Generated/Sound/AcknowDescriptors.ndf"] || "";
const region = ack.slice(ack.indexOf("// >>> waranon:"), ack.indexOf("// <<< waranon:"));
const entry = (tag, type, action) =>
  new RegExp(String.raw`MotherCountry = '${tag}'\s*TypeSpecific\s*=\s*TAcknowUnitType_${type}\s*Action\s*=\s*TAcknowUnitAction_${action}\s*Sounds\s*=\s*\[([\s\S]*?)\]`).exec(region)?.[1] || null;
const infSel = entry("RUR", "Inf", "Select");
const cmdMove = entry("RUR", "Command", "Move");
const voiceChecks = {
  "clip files written": ["WR_Inf_Select_1", "WR_Inf_Select_2", "WR_Command_Move_1", "WR_Seals_Select_1"].every((n) => byPath[`GameData/Assets/Sons/Acknows/RUR/${n}.ogg`]) && byPath["GameData/Assets/Sons/Acknows/BOR/WR_Inf_Select_1.ogg"],
  "replaced lines hold only our clips": infSel && (infSel.match(/Template_UnitAcknow/g) || []).length === 2 && infSel.includes("Acknows/RUR/WR_Inf_Select_2.ogg' Filter = TSoundFilter_RadioOutside"),
  "kept lines keep vanilla + ours": cmdMove && (cmdMove.match(/Acknows\/UK\//g) || []).length > 0 && cmdMove.includes("WR_Command_Move_1.ogg"),
  "new entry for a category the source lacks": (entry("RUR", "Seals", "Select") || "").includes("WR_Seals_Select_1.ogg"),
  "nation without copied voices gets its own entry": (entry("BOR", "Inf", "Select") || "").includes("Acknows/BOR/WR_Inf_Select_1.ogg"),
  "brackets balanced": ack.split("(").length === ack.split(")").length && ack.split("[").length === ack.split("]").length,
};
for (const [k, ok] of Object.entries(voiceChecks)) console.log(`voice: ${k}: ${ok ? "OK" : "FAILED"}`);
if (Object.values(voiceChecks).some((ok) => !ok)) process.exit(1);
console.log(namesOk ? "custom names: OK" : `custom names: FAILED\n${JSON.stringify(byPath[namesCsvPath])}`);
if (!namesOk) process.exit(1);
console.log(`warnings: ${first.warnings.length}`);
for (const w of first.warnings) console.log("  -", w.message);

const second = await buildModFiles({ project, game, source: fsSource(outDir, modRoot) });
const a = Object.fromEntries(first.files.filter((f) => typeof f.data === "string").map((f) => [f.path, f.data]));
let same = true;
for (const f of second.files) {
  if (typeof f.data === "string" && a[f.path] !== f.data) {
    same = false;
    console.error("NOT idempotent:", f.path);
  }
}
console.log(same ? "idempotent: OK" : "idempotent: FAILED");
process.exit(same ? 0 : 1);
