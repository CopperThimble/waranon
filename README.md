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
npm run model         # scripts/build_cost_model.mjs -> public/data/cost-model.json (points model; rerun after `npm run data`)
npm run test:model    # points model sanity checks
```

### Points model

The Balance page and the "Suggested cost" panel in the unit editor come from `src/lib/costModel.js`. It fits a ridge regression on log(cost) to every priced vanilla unit: one model per category (Tanks, Infantry…) and, inside a category, one per unit type (command, ATGM team, howitzer…) when the type has at least 40 units *and* its own model beats the category model on held-out units. Inputs are stats, armor, weapon power/range/rate (after the user's edits and added weapons), traits and abilities. `npm run model` prints held-out accuracy per model (about ±4–11% typical miss) and the biggest price drivers. It can't see things the game prices outside the unit (card availability, veterancy, division role), so very cheap/expensive specialists will look off.

Unit portraits live in `images/portraits/{NATO,PACT}/*.webp`, mirroring the game's `GameData/Assets/2D/Interface/Common/UnitsIcons/` layout. They are made from a local PNG extraction in `images/unit-icons/` (gitignored, with `portraits_manifest.json`) by `python scripts/convert_portraits.py` (needs `pip install pillow`; 396 MB of PNG becomes about 45 MB of WebP). Each unit's `portrait` field in the catalog is resolved through its button texture in `ButtonTexturesUnites.ndf`.

Role, trait and ability icons (`images/specialties/`, 63 files) and weapon trait icons (`images/traits/`, 43 files) were cropped from the game's `UnitIcons-Spec` and `Traits` atlases with the separate EugenImageExtractor (`warno-portraits atlas PC/Atlas/UnitIcons-Spec/TextureSmall.atlas --crop Specialties --out images/specialties`). They're resolved through `UnitSpecialties.ndf` (`game.specialtyIcons`) and are part of the game-art switch.

DLC: the game files don't say which divisions are paid DLC (the engine checks Steam ownership), so `src/lib/dlc.js` lists the Nemesis packs by division CfgName. A unit counts as DLC when every division that fields it is DLC. Add new packs there when they're released.

Vanilla unit and weapon names come from `data/vanilla_localisation.csv`, which is from an older patch, so divisions added since then fall back to their config names.

## Layout

```
src/lib/        exportMod.js (patching), ndf.js (text helpers), validate.js, model.js,
                gameData.js, storage.js (IndexedDB), images.js, modFolder.js (folder access)
src/state/      ProjectContext (load/autosave/CRUD), useProject
src/pages/      Overview, Alliances, Nations, Units, Abilities, Voices, Divisions, Balance, Export, Gallery
src/components/ ui primitives, UnitPicker, flags/thumbnails
scripts/        data extraction (Python), exporter test (Node)
```

## Engine constraints worth knowing

- Only **two sides** exist (`TWargameCoalition` is NATO=0 / PACT=1, mirrored from C++). Custom alliances fight on one of them.
- Armor values are indices into fixed tables (`DamageResistance.ndf`); for example, heavy armor (`blindage`) has 30 levels. The unit editor enforces these.
- Cloned units keep the base unit's `MimeticName`/model, so they reuse its 3D model, animations and depiction.
- Weapons added in the builder need something to fire from, so the unit gets its own copy of its depiction under a new key (`WR_<unit>`):
  - ground vehicles: on an existing turret or as a coaxial gun, firing from the turret's muzzle (`DepictionVehicles.ndf` + `DepictionGhosts.ndf`);
  - planes and helicopters: on an existing mount, firing from its gun muzzle or launching from the pylons of the missiles already on it (`DepictionAerialUnits.ndf`, `DepictionOperator_WeaponMissileCarriageFire`);
  - infantry: as a new soldier role (own `TTurretInfanterieDescriptor`, `WeaponAlternative_N`) holding the weapon the way vanilla squads hold it: model, pose and muzzle effect come from `game.infantryWeapons` (`Infanterie/DepictionInfantry.ndf`: weapon alternatives, soldier depiction, transported-infantry entry and `squad_<key>` mimetic).
  Vanilla limits of 6 weapons, 5 turrets and 5 ammo boxes per unit are enforced.
- A squad needs at least one weapon per soldier, counted per turret (several ammo types on one turret count once), and every GUID in a copied unit must be new (squads carry a second one in `MimeticDescriptor`).
- Voice lines (Voices page): units pick lines by `AcknowUnitTypes` (e.g. Command, Inf) and the game adds the radio filter itself. Clips are recorded/uploaded in the browser, trimmed and encoded to mono 44.1 kHz Ogg Vorbis (`wasm-media-encoders`), written to `GameData/Assets/Sons/Acknows/<TAG>/` and referenced from `Sound/AcknowDescriptors.ndf`; GenerateMod cooks them.
- Ammo shot intervals and aim times must be multiples of the 0.1 s game tick, and turret angles are written at full precision (the engine checks elevation against exact pi/2).

## Legal and game art

Waranon is a free fan tool, not affiliated with or endorsed by Eugen Systems. WARNO game data and artwork are © Eugen Systems; the app shows this attribution and a contact link (set in `waranon.config.json`) on every page.

All game artwork lives in `images/` and can be switched off in one step:

```sh
npm run art -- status
npm run art -- off   # hide all game art in the app + untrack it from git (local files kept)
npm run art -- on    # restore both
```

With art off, the build contains no game images (pictures fall back to placeholders). CI can force it with `WARANON_GAME_ART=off`. Untracking removes the art from the branch and the deployed site once pushed, but not from git history. `images/unit-icons/` (locally extracted portraits) is gitignored separately and is never published by these commands.

## Privacy, backups and analytics

- Projects are stored only in the visitor's browser (IndexedDB); mod files are read and written locally. Nothing is uploaded, and there are no cookies or tracking.
- "Write into folder" (Chrome/Edge) asks the browser for permission, which lasts only while the tab is open. Before overwriting anything, it backs up the original files to `waranon-backups/<date-time>/` inside the mod folder, with a README explaining how to undo. "Download .zip" is the default.
- Optional page-view counting: set `analytics.goatcounter` in `waranon.config.json` to your GoatCounter code. It's cookieless, only runs on the deployed build, and the footer mentions it automatically when on.

Tests: `npm run test:export`, `npm run test:rules`, `npm run test:write` (backup/undo).
