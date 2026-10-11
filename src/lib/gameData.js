// Loads the compact catalog produced by scripts/build_game_data.py and adds lookup maps.

export function indexGameData(raw) {
  return {
    ...raw,
    unitsById: new Map(raw.units.map((u) => [u.id, u])),
    divisionsById: new Map(raw.divisions.map((d) => [d.id, d])),
    countriesByTag: new Map(raw.countries.map((c) => [c.tag, c])),
  };
}

let pending = null;

export function loadGameData() {
  if (!pending) {
    pending = fetch(`${import.meta.env.BASE_URL}data/game-data.json`)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load game data (${res.status})`);
        return res.json();
      })
      .then(indexGameData)
      .catch((err) => {
        pending = null;
        throw err;
      });
  }
  return pending;
}
