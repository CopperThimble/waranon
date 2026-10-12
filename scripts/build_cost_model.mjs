// Train the points model on vanilla unit prices and write public/data/cost-model.json.
//   npm run model
// Re-run after `npm run data` (a game update changes prices and stats).
import fs from "node:fs";
import { ROLE_NAMES, assessUnit, categoryDrivers, trainCostModel, unitFeatures } from "../src/lib/costModel.js";
import { indexGameData } from "../src/lib/gameData.js";

const game = indexGameData(JSON.parse(fs.readFileSync("public/data/game-data.json", "utf8")));
const rows = game.units
  .filter((u) => !u.building && u.stats.cp > 0)
  .map((u) => ({ id: u.id, category: u.factory, role: u.role, features: unitFeatures(game, u), cost: u.stats.cp }));

const categories = trainCostModel(rows);
const model = { version: 2, gameVersion: game.gameVersion, trainedOn: rows.length, categories };
fs.writeFileSync("public/data/cost-model.json", JSON.stringify(model));

const pct = (cv) => `±${(cv.medianPctError * 100).toFixed(1).padStart(4)}%`;
console.log(`Trained on ${rows.length} vanilla units (game data ${game.gameVersion}).\n`);
console.log("model                                 units  held-out error   R² (log)");
for (const [cat, m] of Object.entries(categories).sort((a, b) => b[1].n - a[1].n)) {
  console.log(`${cat.padEnd(37)} ${String(m.n).padStart(5)}   ${pct(m.cv)} → ${pct(m.combinedCv)}   ${m.cv.r2Log.toFixed(2)} → ${m.combinedCv.r2Log.toFixed(2)}`);
  for (const [role, t] of Object.entries(m.types).sort((a, b) => b[1].n - a[1].n)) {
    const name = `  · ${ROLE_NAMES[role] || role}`;
    console.log(`${name.padEnd(37)} ${String(t.n).padStart(5)}   ${pct(t.categoryCv)} → ${pct(t.cv)}   ${t.categoryCv.r2Log.toFixed(2)} → ${t.cv.r2Log.toFixed(2)}`);
  }
}
console.log("(category model alone → with per-type models)");

for (const [cat, role] of [["Tanks", "armor"], ["Infantry", "hq_inf"], ["Infantry", "AT"], ["Planes", null]]) {
  console.log(`\n${cat}${role ? ` · ${ROLE_NAMES[role]}` : ""}: biggest price drivers (effect of +1 std dev)`);
  for (const d of categoryDrivers(model, cat, 8, role)) console.log(`  ${d.pct > 0 ? "+" : ""}${d.pct}%  ${d.label}`);
  const scored = game.units
    .filter((u) => u.factory === cat && (!role || u.role === role) && !u.building && u.stats.cp > 0)
    .map((u) => ({ u, a: assessUnit(model, game, u) }))
    .sort((x, y) => x.a.ratio - y.a.ratio);
  const fmt = ({ u, a }) => `${u.name} (${u.country}) ${a.actual} vs ~${a.suggested}`;
  console.log(`  most underpriced: ${scored.slice(0, 3).map(fmt).join(" | ")}`);
  console.log(`  most overpriced:  ${scored.slice(-3).reverse().map(fmt).join(" | ")}`);
}
console.log(`\nWrote public/data/cost-model.json (${(fs.statSync("public/data/cost-model.json").size / 1024).toFixed(0)} KB)`);
