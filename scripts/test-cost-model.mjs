// Sanity checks for the points model (public/data/cost-model.json).
//   npm run test:model
import fs from "node:fs";
import { assessUnit, modelFor, similarUnits } from "../src/lib/costModel.js";
import { indexGameData } from "../src/lib/gameData.js";

const game = indexGameData(JSON.parse(fs.readFileSync("public/data/game-data.json", "utf8")));
const model = JSON.parse(fs.readFileSync("public/data/cost-model.json", "utf8"));
let failed = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? ` (${detail})` : ""}`);
  if (!ok) failed++;
};

check("model matches game data version", model.gameVersion === game.gameVersion, `${model.gameVersion} vs ${game.gameVersion}`);
for (const [cat, m] of Object.entries(model.categories)) {
  check(`${cat}: held-out error under 15%`, m.combinedCv.medianPctError < 0.15, `±${(m.combinedCv.medianPctError * 100).toFixed(1)}%`);
}

const tank = game.units.find((u) => u.factory === "Tanks" && u.role === "armor" && u.stats.armorFront >= 10 && u.stats.cp > 0);
const plain = assessUnit(model, game, tank);
check("tanks use the main-battle-tank model", modelFor(model, tank).typed && plain.scope.role === "armor");
const armored = assessUnit(model, game, tank, { stats: { armorFront: tank.stats.armorFront + 4 } });
check("more front armor raises the suggestion", armored.predicted > plain.predicted, `${plain.suggested} → ${armored.suggested}`);
const cheap = assessUnit(model, game, tank, { stats: { cp: 5 } });
check("a 5-point tank is underpriced", cheap.verdict === "underpriced");
const pricey = assessUnit(model, game, tank, { stats: { cp: tank.stats.cp * 3 } });
check("a tripled price is overpriced", pricey.verdict === "overpriced");
check("suggestions are multiples of 5", plain.suggested % 5 === 0);
const sim = similarUnits(model, game, tank, null, 5);
check("similar units share the type and exclude itself", sim.length === 5 && sim.every((s) => s.unit.role === "armor" && s.unit.id !== tank.id));

if (failed) {
  console.log(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log("\nall checks passed");
