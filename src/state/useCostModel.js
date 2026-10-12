import { useEffect, useState } from "react";
import { assessUnit } from "../lib/costModel";
import { loadCostModel } from "../lib/gameData";

/** The points model, or null while loading / if it hasn't been built. */
export function useCostModel() {
  const [model, setModel] = useState(null);
  useEffect(() => {
    let alive = true;
    loadCostModel().then((m) => alive && setModel(m));
    return () => {
      alive = false;
    };
  }, []);
  return model;
}

const cache = new WeakMap();

/** Map of vanilla unit id -> assessment (computed once per model; null while the model loads). */
export function useVanillaAssessments(game) {
  const model = useCostModel();
  if (!model) return null;
  let map = cache.get(model);
  if (!map) {
    map = new Map();
    for (const u of game.units) {
      if (u.building || !(u.stats.cp > 0)) continue;
      const a = assessUnit(model, game, u);
      if (a) map.set(u.id, a);
    }
    cache.set(model, map);
  }
  return map;
}
