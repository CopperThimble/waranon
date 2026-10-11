# Waranon: WARNO mod builder

A browser app for building WARNO mods without hand-editing NDF: custom **alliances**, **nations** (flag, name, voice lines), **units** (cloned from vanilla, renamed, rebalanced, custom icon) and **divisions** (rosters, transports, emblem). Projects autosave in the browser (IndexedDB) and can be exported or imported as `.waranon.json` files.

## How export works

1. In your WARNO install, run `Mods/CreateNewMod.bat MyMod`. That creates a mod *source* folder holding a full editable copy of the game data.
2. On the Export page, pick that folder. The app reads the game files in it and patches them, so the output always matches *your* game version. In Chrome or Edge it can write the files in place; other browsers get a zip.
3. Run `GenerateMod.bat`, then `LaunchGameDevMode.bat` to test.

Everything the builder adds is fenced with `// >>> waranon:<id>` comments, so re-exporting replaces the previous output instead of duplicating it.

Files touched: `UISpecificCountriesInfos`, `UniteDescriptor`, `WeaponDescriptor`, `ButtonTexturesUnites`, `AcknowDescriptors`, `Divisions`, `DivisionRules`, `DivisionCostMatrix`, `DeckSerializer`, `DivisionTextures`, the mod's localisation CSVs, plus new `UnitNames_<TAG>.ndf` and PNGs under `GameData/Assets/2D/Interface/...`.

## Development

```sh
npm install
npm run dev          # http://localhost:5173/waranon/
npm run lint
npm run build
```

With `SampleMods/modexample` present (a copy of a CreateNewMod folder; gitignored), the dev server exposes it, and the Export page shows a **Use SampleMods/modexample (dev)** button.

### Game data

The app loads `public/data/game-data.json`, a compact catalog extracted from vanilla NDF. Regenerate it after a game update:

```sh
npm run data          # scripts/build_game_data.py  -> public/data/game-data.json
npm run data:ranges   # scripts/extract_stat_ranges.py -> data/stat_ranges.json (every field's min/max)
npm run test:export   # end-to-end exporter check against SampleMods/modexample (incl. idempotency)
npm run test:rules    # weapon loadout rules (shared ammo boxes, mount types)
```

Vanilla unit and weapon names come from `data/vanilla_localisation.csv`, which is from an older patch, so divisions added since then fall back to their config names.

## Layout

```
src/lib/        exportMod.js (patching), ndf.js (text helpers), validate.js, model.js,
                gameData.js, storage.js (IndexedDB), images.js, modFolder.js (folder access)
src/state/      ProjectContext (load/autosave/CRUD), useProject
src/pages/      Overview, Alliances, Nations, Units, Divisions, Export
src/components/ ui primitives, UnitPicker, flags/thumbnails
scripts/        data extraction (Python), exporter test (Node)
```

## Engine constraints worth knowing

- Only **two sides** exist (`TWargameCoalition` is NATO=0 / PACT=1, mirrored from C++). Custom alliances fight on one of them.
- Armor values are indices into fixed tables (`DamageResistance.ndf`); for example, heavy armor (`blindage`) has 30 levels. The unit editor enforces these.
- Cloned units keep the base unit's `MimeticName`/model, so they reuse its 3D model, animations and depiction.
