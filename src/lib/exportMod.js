// Turns a project into the set of files to drop into a WARNO mod *source* folder
// (the one created by Mods/CreateNewMod.bat). Existing game files are read from the
// user's own folder and patched in place, so the output always matches their game version.

import {
  allianceById,
  customRef,
  guidFrom,
  isCustomRef,
  nationSide,
  slugify,
} from "./model.js";
import {
  addWeaponsToBlock,
  cloneAmmoBlock,
  cloneGhostRegistration,
  cloneTacticRegistration,
  cloneUnitBlock,
  fireOperator,
  setUnitBlackHoleKey,
  patchWeaponBlock,
  serializeCapacity,
  serializeEffectPack,
  serializeSpecialty,
} from "./exportUnits.js";
import {
  appendToList,
  detectEol,
  escapeRegExp,
  findTopLevelBlock,
  fromLf,
  hasTopLevelName,
  matchClose,
  maxPairNumber,
  stripRegions,
  toLf,
  upsertCsvRows,
  wrapRegion,
} from "./ndf.js";
import { validateProject } from "./validate.js";
import { boxPlan, defaultFiringEffect, fireKind, normalizeWeapons, turretAnchors } from "./weapons.js";

const G = "GameData/Generated";
export const PATHS = {
  countries: `${G}/UserInterface/UISpecificCountriesInfos.ndf`,
  unitNamesDir: `${G}/Gameplay/Gfx/UnitNames`,
  units: `${G}/Gameplay/Gfx/UniteDescriptor.ndf`,
  weapons: `${G}/Gameplay/Gfx/WeaponDescriptor.ndf`,
  buttons: `${G}/UserInterface/Textures/ButtonTexturesUnites.ndf`,
  acknow: `${G}/Sound/AcknowDescriptors.ndf`,
  divisions: `${G}/Gameplay/Decks/Divisions.ndf`,
  rules: `${G}/Gameplay/Decks/DivisionRules.ndf`,
  matrix: `${G}/Gameplay/Decks/DivisionCostMatrix.ndf`,
  serializer: `${G}/Gameplay/Decks/DeckSerializer.ndf`,
  divisionTextures: `${G}/UserInterface/Textures/DivisionTextures.ndf`,
  ammo: `${G}/Gameplay/Gfx/Ammunition.ndf`,
  ammoMissiles: `${G}/Gameplay/Gfx/AmmunitionMissiles.ndf`,
  depVehicles: `${G}/Gameplay/Gfx/Depictions/DepictionVehicles.ndf`,
  depGhosts: `${G}/Gameplay/Gfx/Depictions/DepictionGhosts.ndf`,
  effects: `${G}/Gameplay/Effects/EffetsSurUnite.ndf`,
  capacities: `${G}/Gameplay/Gfx/CapaciteList.ndf`,
  specialties: `${G}/UserInterface/UnitSpecialties.ndf`,
  specialtyTextures: `${G}/UserInterface/Textures/SpecialityIconTextures.ndf`,
  specialtyIcons: "GameData/Assets/2D/Interface/Common/UnitsIcons/Specialties",
  flags: "GameData/Assets/2D/Interface/Common/Flags",
  unitIcons: "GameData/Assets/2D/Interface/Common/UnitsIcons",
  emblems: "GameData/Assets/2D/Interface/UseOutGame/Division/Emblem",
  localisationRoot: "GameData/Localisation",
};

const CORE_FILES = [
  PATHS.countries,
  PATHS.units,
  PATHS.weapons,
  PATHS.buttons,
  PATHS.acknow,
  PATHS.divisions,
  PATHS.rules,
  PATHS.matrix,
  PATHS.serializer,
  PATHS.divisionTextures,
  PATHS.ammo,
  PATHS.ammoMissiles,
  PATHS.effects,
  PATHS.capacities,
  PATHS.specialties,
  PATHS.specialtyTextures,
  PATHS.depVehicles,
  PATHS.depGhosts,
];

// Dictionaries every generated token is written to. The game looks some tokens up in
// a different dictionary than you'd expect (e.g. the armory resolves division text via
// UNITS), and a missing entry is a fatal error, so each token goes into all of them.
const TARGET_DICOS = ["dico_units", "dico_interface_ingame", "dico_interface_outgame"];
const DICO_DEFAULT_FILES = {
  dico_units: "UNITS.csv",
  dico_interface_ingame: "INTERFACE_INGAME.csv",
  dico_interface_outgame: "INTERFACE_OUTGAME.csv",
};

/**
 * Find the mod's localisation setup. CreateNewMod.bat names the folder after the mod, and
 * LocalisationDicos.ndf says which CSV backs each dictionary, so we read the paths from it.
 * Returns { folder, dicos: { dico_units: 'GameData/Localisation/<mod>/UNITS.csv', ... } } or null.
 */
export async function findLocalisation(source) {
  const candidates = [];
  if (source.name) candidates.push(source.name);
  if (source.listDir) {
    const entries = (await source.listDir(PATHS.localisationRoot)) || [];
    for (const e of entries) if (e.kind === "directory" && e.name !== "Database") candidates.push(e.name);
  }
  for (const name of candidates) {
    const folder = `${PATHS.localisationRoot}/${name}`;
    const text = await source.readText(`${folder}/LocalisationDicos.ndf`);
    if (text == null) continue;
    const dicos = {};
    for (const m of text.matchAll(/DicoToken\s*=\s*~\/LocalisationConstantes\/(\w+)\s+FileName\s*=\s*['"]GameData:\/([^'"]+)['"]/g)) {
      dicos[m[1]] = `GameData/${m[2]}`;
    }
    for (const [dico, file] of Object.entries(DICO_DEFAULT_FILES)) dicos[dico] ||= `${folder}/${file}`;
    return { folder, dicos };
  }
  return null;
}

/** Text-format command names already used by the UI in this mod folder (see tagProblem). */
const TEXT_FORMAT_FILES = [
  "GameData/UserInterface/Style/DefaultStyle/DefaultTextFormatScript.ndf",
  "GameData/UserInterface/Use/Common/UIChatTextFormatScript.ndf",
  "GameData/UserInterface/Use/OutGame/UISpecificOutGameFriendListView.ndf",
];
async function readTextFormatKeys(source) {
  const keys = new Set();
  for (const path of TEXT_FORMAT_FILES) {
    const text = await source.readText(path);
    if (!text) continue;
    for (const m of text.matchAll(/\(\s*"([A-Za-z0-9_]+)"\s*,\s*(?:TTFSCommand_\w+|TemplateTFS_\w+)/g)) keys.add(m[1].toUpperCase());
  }
  return keys;
}

/**
 * @param {object} args
 * @param {object} args.project
 * @param {object} args.game     catalog from loadGameData()
 * @param {object} args.source   { name, readText(path) -> string|null, listDir?(path) }
 * @returns {Promise<{errors, warnings, files: Array<{path, data, kind, notes}>}>}
 */
export async function buildModFiles({ project, game, source }) {
  const { errors, warnings } = validateProject(project, game);
  if (errors.length) return { errors, warnings, files: [] };

  const pid = project.id.slice(0, 8);
  const working = new Map(); // path -> { raw, text (LF, stripped), eol, notes[] }
  const newFiles = [];

  async function open(path) {
    if (!working.has(path)) {
      const raw = await source.readText(path);
      if (raw == null) throw new Error(`Not found in mod folder: ${path}`);
      working.set(path, { raw, text: stripRegions(toLf(raw), pid), eol: detectEol(raw), notes: [] });
    }
    return working.get(path);
  }
  async function edit(path, note, fn) {
    const w = await open(path);
    w.text = fn(w.text);
    w.notes.push(note);
  }
  function addFile(path, data, note) {
    newFiles.push({ path, data, kind: "new", notes: [note] });
  }
  const appendBlocks = (text, blocks) =>
    blocks.length ? `${text.replace(/\s*$/, "")}\n\n${wrapRegion(pid, blocks.join("\n"))}\n` : text;

  for (const path of CORE_FILES) await open(path);
  const loc = await findLocalisation(source);
  if (!loc) throw new Error("Couldn't find GameData/Localisation/<mod>/LocalisationDicos.ndf. Is this a mod source folder?");

  // Re-check tags against this folder's own UI files, in case they differ from the catalog.
  const usedKeys = await readTextFormatKeys(source);
  const clashes = project.nations.filter((n) => usedKeys.has(n.tag));
  if (clashes.length) {
    return {
      errors: clashes.map((n) => ({
        scope: "nation",
        id: n.id,
        message: `${n.name}: tag "${n.tag}" is already a text icon (#${n.tag}) in your mod's UI files. Pick another tag.`,
      })),
      warnings,
      files: [],
    };
  }

  const textRows = []; // every token we generate; written to all TARGET_DICOS

  // ── Nations ────────────────────────────────────────────────────────────────
  const nations = project.nations.map((n) => {
    const side = allianceById(project, n.allianceId).side;
    const custom = Boolean(n.flagAssetId);
    return {
      ...n,
      side,
      nameToken: `Ctr${n.tag}`,
      flagTexture: custom
        ? `CommonTexture_MotherCountryFlag_${n.tag}`
        : game.countriesByTag.get(n.baseFlagCountry).flagTexture,
      flagFile: `${n.tag}_FLAG.png`,
    };
  });

  if (nations.length) {
    await edit(PATHS.countries, `${nations.length} countr${nations.length > 1 ? "ies" : "y"}`, (t) => {
      const info = nations.map(
        (n) => `        ("${n.tag}", TUISpecificCountryInfos
            (
                FlagTexture = "${n.flagTexture}"
                Country = "${n.tag}"
                NameToken = "${n.nameToken}"
                Coalition = TWargameCoalition/${n.side}
            )
        ),`,
      );
      t = appendToList(t, "CountriesInfos = MAP", wrapRegion(pid, info.join("\n")));
      const textures = nations
        .filter((n) => n.flagAssetId)
        .map(
          (n) =>
            `        ("${n.flagTexture}",  MAP [(~/ComponentState/Normal, TUIResourceTexture_Common(FileName = "GameData:/Assets/2D/Interface/Common/Flags/${n.flagFile}"))]),`,
        );
      if (textures.length) t = appendToList(t, /\bTextures\s*=\s*MAP/, wrapRegion(pid, textures.join("\n")));
      const formats = nations.map(
        (n) => `    (\n        "${n.tag}",\n        TemplateTFS_Flag(TextureToken = "${n.flagTexture}")\n    ),`,
      );
      return appendToList(t, "CountriesTextFormatScriptMap is MAP", wrapRegion(pid, formats.join("\n")));
    });

    for (const n of nations) {
      addFile(
        `${PATHS.unitNamesDir}/UnitNames_${n.tag}.ndf`,
        `// Generated by Waranon\n\nunnamed TUnitNameNationToDicoToken\n(\n    Nation = "${n.tag}"\n    DicoToken = "${n.unitNamesDico}"\n)\n`,
        `Random unit names from ${n.unitNamesDico}`,
      );
      if (n.flagAssetId) addFile(`${PATHS.flags}/${n.flagFile}`, project.assets[n.flagAssetId].blob, "Flag image");
      textRows.push({ token: n.nameToken, text: n.name });
    }

    // Voice lines: clone the acknowledgement sounds of a vanilla country.
    const voiced = nations.filter((n) => n.voiceCountry);
    if (voiced.length) {
      await edit(PATHS.acknow, "Voice lines for new countries", (t) => cloneAcknowledgements(t, pid, voiced, warnings));
    }
  }

  // ── Custom abilities ───────────────────────────────────────────────────────
  // Each becomes an effect pack + a capacity + a specialty icon entry.
  const customNames = new Map(); // ability id -> { capacity, specialty }
  const abilities = project.abilities || [];
  if (abilities.length) {
    const capText = working.get(PATHS.capacities).text;
    const taken = new Set();
    const packs = [];
    const capacities = [];
    const specialties = [];
    const textures = [];
    for (const a of abilities) {
      let slug = slugify(a.name);
      for (let i = 2; taken.has(slug) || hasTopLevelName(capText, `Capacite_WR_${slug}`); i++) slug = `${slugify(a.name)}_${i}`;
      taken.add(slug);
      const pack = `UnitEffect_WR_${slug}`;
      const capacity = `Capacite_WR_${slug}`;
      const specialty = `_wr_${slug.toLowerCase()}`;
      const texture = a.iconAssetId ? `Texture_Speciality_Icon_wr_${slug.toLowerCase()}` : a.iconTexture;
      customNames.set(a.id, { capacity, specialty });
      packs.push(serializeEffectPack(pack, a.packGuid, a));
      capacities.push(serializeCapacity(capacity, a.guid, pack, a));
      specialties.push(serializeSpecialty(specialty, texture, a.titleToken, a.bodyToken));
      if (a.iconAssetId) textures.push({ texture, file: `wr_${slug.toLowerCase()}.png`, blob: project.assets[a.iconAssetId].blob });
      textRows.push({ token: a.titleToken, text: a.name });
      textRows.push({ token: a.bodyToken, text: a.description || a.name });
    }
    await edit(PATHS.effects, `${packs.length} ability effect pack(s)`, (t) => appendBlocks(t, packs));
    await edit(PATHS.capacities, `${capacities.length} abilit${capacities.length > 1 ? "ies" : "y"}`, (t) => appendBlocks(t, capacities));
    await edit(PATHS.specialties, "Ability icons & tooltips", (t) => appendToList(t, /\bDescriptors\s*=\s*MAP/, wrapRegion(pid, specialties.join("\n"))));
    if (textures.length) {
      await edit(PATHS.specialtyTextures, `${textures.length} ability icon texture(s)`, (t) => {
        const decl = textures
          .map((x) => `${x.texture} is TUIResourceTexture_Common\n(\n    FileName = "GameData:/Assets/2D/Interface/Common/UnitsIcons/Specialties/${x.file}"\n)`)
          .join("\n");
        const bankAt = t.search(/^UnitSpecialityAdditionalTextureBank\s+is/m);
        if (bankAt < 0) throw new Error("UnitSpecialityAdditionalTextureBank not found in SpecialityIconTextures.ndf");
        t = `${t.slice(0, bankAt)}${wrapRegion(pid, decl)}\n${t.slice(bankAt)}`;
        const entries = textures.map((x) => `        ("${x.texture}", MAP [(~/ComponentState/Normal, ~/${x.texture})]),`);
        return appendToList(t, /^UnitSpecialityAdditionalTextureBank\s+is/m, wrapRegion(pid, entries.join("\n")));
      });
      for (const x of textures) addFile(`${PATHS.specialtyIcons}/${x.file}`, x.blob, "Ability icon");
    }
  }

  // ── Units ──────────────────────────────────────────────────────────────────
  const unitsText = working.get(PATHS.units).text;
  const takenUnitNames = new Set();
  const unitIds = new Map(); // custom ref -> descriptor name
  const resolvedUnits = project.units.map((u) => {
    const base = game.unitsById.get(u.baseUnitId);
    const tag = u.nationTag;
    const side = nationSide(game, project, tag);
    let stem = `${slugify(u.name)}_${tag}`;
    for (let i = 2; takenUnitNames.has(stem) || hasTopLevelName(unitsText, `Descriptor_Unit_${stem}`); i++) {
      stem = `${slugify(u.name)}_${i}_${tag}`;
    }
    takenUnitNames.add(stem);
    const r = {
      unit: u,
      base,
      tag,
      side,
      stem,
      descriptor: `Descriptor_Unit_${stem}`,
      weapon: base.weapon ? `WeaponDescriptor_${stem}` : null,
      buttonTexture: u.iconAssetId ? `Texture_Button_Unit_${stem}` : base.buttonTexture,
      iconFile: `${side}/${stem}.png`,
    };
    unitIds.set(customRef(u.id), r.descriptor);
    return r;
  });
  const refToDescriptor = (ref) => (isCustomRef(ref) ? unitIds.get(ref) : ref);

  if (resolvedUnits.length) {
    const unitBlocks = [];
    const weaponBlocks = [];
    const ammoBlocks = { [PATHS.ammo]: [], [PATHS.ammoMissiles]: [] };
    const ammoFile = (id) => (game.ammo[id]?.file === "AmmunitionMissiles" ? PATHS.ammoMissiles : PATHS.ammo);
    const depictionJobs = []; // units with added weapons get their own copy of the vehicle depiction
    for (const r of resolvedUnits) {
      const span = findTopLevelBlock(unitsText, r.base.id);
      if (!span) throw new Error(`Base unit ${r.base.id} not found in your UniteDescriptor.ndf (different game version?)`);
      const loadout = r.base.weapon && game.weapons[r.base.weapon];
      const added = (loadout && normalizeWeapons(loadout, r.unit.weapons || {}).added) || [];
      const depKey = added.length && r.base.blackHoleKey ? `WR_${r.stem}` : null;
      let unitBlock = cloneUnitBlock(unitsText.slice(span.start, span.end), r, warnings, customNames);
      if (depKey) unitBlock = setUnitBlackHoleKey(unitBlock, depKey);
      unitBlocks.push(unitBlock);

      if (r.weapon) {
        const wText = working.get(PATHS.weapons).text;
        const wSpan = findTopLevelBlock(wText, r.base.weapon);
        if (!wSpan) throw new Error(`Weapon ${r.base.weapon} not found in your WeaponDescriptor.ndf`);
        const renamed = wText.slice(wSpan.start, wSpan.end).replace(
          new RegExp(`^(export\\s+)?${escapeRegExp(r.base.weapon)}\\b`),
          `export ${r.weapon}`,
        );
        const ov = r.unit.weapons || {};
        const fail = (what) => warnings.push({ scope: "unit", id: r.unit.id, message: `${r.unit.name}: couldn't apply ${what}.` });
        let weaponBlock = patchWeaponBlock(renamed, ov, (ti, mi, current) => {
            const mo = ov.mounted?.[`${ti}.${mi}`];
            const src = mo?.ammo || current;
            const stats = mo?.stats && Object.keys(mo.stats).length ? mo.stats : null;
            const look = mo?.look && Object.keys(mo.look).length ? mo.look : null;
            if (!stats && !look) return src;
            // Edited ammo: clone it under a unit-specific name so other units keep the original.
            const cloneId = `Ammo_${r.stem}_T${ti + 1}W${mi + 1}`;
            const file = ammoFile(src);
            const aText = working.get(file).text;
            const aSpan = findTopLevelBlock(aText, src);
            if (!aSpan) {
              fail(`edited ammo for weapon ${ti + 1}.${mi + 1} (${src} not found)`);
              return src;
            }
            ammoBlocks[file].push(
              cloneAmmoBlock(aText.slice(aSpan.start, aSpan.end), src, cloneId, guidFrom(`${r.unit.guid}:${cloneId}`), stats || {}, game.ammo[src]?.stats, (key) =>
                fail(`ammo ${key} on weapon ${ti + 1}.${mi + 1}`), look || {},
              ),
            );
            return cloneId;
          }, fail, boxPlan(loadout, ov));
        if (added.length) {
          // new weapons take the slot numbers after the highest existing one
          const maxSlot = Math.max(0, ...loadout.turrets.flatMap((t) => t.mounted.map((m) => m.slot || 0)));
          const plan = added.map((a, i) => ({ a, n: maxSlot + i + 1 }));
          weaponBlock = addWeaponsToBlock(weaponBlock, loadout, plan);
          if (depKey) depictionJobs.push({ r, key: r.base.blackHoleKey, newKey: depKey, plan });
        }
        weaponBlocks.push(weaponBlock);
      }
      textRows.push({ token: r.unit.nameToken, text: r.unit.name });
    }
    await edit(PATHS.units, `${unitBlocks.length} unit(s)`, (t) => appendBlocks(t, unitBlocks));
    if (weaponBlocks.length) await edit(PATHS.weapons, `${weaponBlocks.length} weapon loadout(s)`, (t) => appendBlocks(t, weaponBlocks));
    for (const [file, blocks] of Object.entries(ammoBlocks)) {
      if (blocks.length) await edit(file, `${blocks.length} customised ammunition type(s)`, (t) => appendBlocks(t, blocks));
    }

    if (depictionJobs.length) {
      const dvText = working.get(PATHS.depVehicles).text;
      const ghostText = working.get(PATHS.depGhosts).text;
      const dvBlocks = [];
      const ghostBlocks = [];
      for (const j of depictionJobs) {
        const operators = [];
        const actions = [];
        for (const { a, n } of j.plan) {
          const anchors = turretAnchors(game, j.r.base, a.turret);
          const fx = a.fx || defaultFiringEffect(game, j.r.base, a.turret, a.ammo);
          const name = `DepictionOperator_${j.newKey}_Weapon${n}`;
          dvBlocks.push(fireOperator(name, fireKind(game.ammo[a.ammo]), anchors, n));
          operators.push(name);
          if (fx) actions.push([n, fx]);
        }
        const registration = cloneTacticRegistration(dvText, j.key, j.newKey, operators, actions);
        if (!registration) throw new Error(`Depiction ${j.key} not found in your DepictionVehicles.ndf (different game version?)`);
        dvBlocks.push(registration);
        const ghost = cloneGhostRegistration(ghostText, j.key, j.newKey);
        if (ghost) ghostBlocks.push(ghost);
        else warnings.push({ scope: "unit", id: j.r.unit.id, message: `${j.r.unit.name}: no placement ghost found for ${j.key}.` });
      }
      await edit(PATHS.depVehicles, `${depictionJobs.length} unit depiction(s) for added weapons`, (t) => appendBlocks(t, dvBlocks));
      if (ghostBlocks.length) await edit(PATHS.depGhosts, `${ghostBlocks.length} placement ghost(s)`, (t) => appendBlocks(t, ghostBlocks));
    }

    const iconUnits = resolvedUnits.filter((r) => r.unit.iconAssetId);
    if (iconUnits.length) {
      await edit(PATHS.buttons, `${iconUnits.length} unit icon(s)`, (t) => {
        const entries = iconUnits.map(
          (r) =>
            `        ("${r.buttonTexture}", MAP [( ~/ComponentState/Normal, TUIResourceTexture( FileName = "GameData:/Assets/2D/Interface/Common/UnitsIcons/${r.iconFile}"))]),`,
        );
        return appendToList(t, /\bTextures\s*=\s*MAP/, wrapRegion(pid, entries.join("\n")));
      });
      for (const r of iconUnits) addFile(`${PATHS.unitIcons}/${r.iconFile}`, project.assets[r.unit.iconAssetId].blob, "Unit icon");
    }

    await edit(PATHS.serializer, "Deck-code IDs for units", (t) => {
      let next = maxPairNumber(t, "UnitIds = MAP") + 1;
      const lines = resolvedUnits.map((r) => `        ($/GFX/Unit/${r.descriptor}, ${next++}),`);
      return appendToList(t, "UnitIds = MAP", wrapRegion(pid, lines.join("\n")));
    });
  }

  // ── Divisions ──────────────────────────────────────────────────────────────
  if (project.divisions.length) {
    const divText = working.get(PATHS.divisions).text;
    let order = Math.max(0, ...[...divText.matchAll(/InterfaceOrder\s*=\s*(-?[\d.]+)/g)].map((m) => Number(m[1])));
    const taken = new Set();
    const divBlocks = [];
    const ruleBlocks = [];
    const matrixBlocks = [];
    const emblems = [];

    for (const d of project.divisions) {
      const side = nationSide(game, project, d.nationTag);
      let cfg = `${d.nationTag}_${slugify(d.name)}_multi`;
      for (let i = 2; taken.has(cfg) || hasTopLevelName(divText, `Descriptor_Deck_Division_${cfg}`); i++) {
        cfg = `${d.nationTag}_${slugify(d.name)}_${i}_multi`;
      }
      taken.add(cfg);
      const desc = `Descriptor_Deck_Division_${cfg}`;
      const rule = `${desc}_Rule`;
      const matrix = `MatrixCostName_${cfg}`;
      const emblem = d.emblemAssetId ? `Texture_Division_Emblem_${cfg}` : fallbackEmblem(game, d);
      if (d.emblemAssetId) emblems.push({ texture: emblem, file: `${cfg}.png`, blob: project.assets[d.emblemAssetId].blob });

      const roster = d.roster.map((r) => ({ ...r, unit: refToDescriptor(r.unit), transports: (r.transports || []).map(refToDescriptor) }));
      const standout = pickStandoutUnits(d.roster, refToDescriptor);
      order += 1;

      divBlocks.push(`export ${desc} is TDeckDivisionDescriptor
(
    DescriptorId = GUID:{${d.guid}}
    CfgName = '${cfg}'
    DivisionName = '${d.nameToken}'
    InterfaceOrder = ${order}.0
    DivisionCoalition = TWargameCoalition/${side}
    DivisionTags = ['DEFAULT', '${d.nationTag}', '${side}', '${d.typeToken}']
    DescriptionHintTitleToken = '${d.nameToken}'
    MaxActivationPoints = ${Math.round(d.activationPoints)}
    DivisionRule = ${rule}
    CostMatrix = ${matrix}
    EmblemTexture     = "${emblem}"
    TypeToken        = "${d.typeToken}"
    SummaryTextToken = "${d.summaryToken}"
    HistoryTextToken = "${d.historyToken}"
    CountryId = "${d.nationTag}"
    StandoutUnits =
    [
${standout.map((u) => `        $/GFX/Unit/${u},`).join("\n")}
    ]
)`);
      ruleBlocks.push(serializeRule(rule, roster));
      matrixBlocks.push(serializeMatrix(matrix, d.costMatrix));

      textRows.push({ token: d.nameToken, text: d.name });
      textRows.push({ token: d.summaryToken, text: d.summary || d.name });
      textRows.push({ token: d.historyToken, text: d.history || d.summary || d.name });
    }

    await edit(PATHS.divisions, `${divBlocks.length} division(s)`, (t) => appendBlocks(t, divBlocks));
    await edit(PATHS.rules, "Division rosters", (t) => appendBlocks(t, ruleBlocks));
    await edit(PATHS.matrix, "Division cost matrices", (t) => appendBlocks(t, matrixBlocks));
    await edit(PATHS.serializer, "Deck-code IDs for divisions", (t) => {
      let next = maxPairNumber(t, "DivisionIds = MAP") + 1;
      const lines = divBlocks.map((b) => `        (${/^export (\S+)/.exec(b)[1]}, ${next++}),`);
      return appendToList(t, "DivisionIds = MAP", wrapRegion(pid, lines.join("\n")));
    });

    if (emblems.length) {
      await edit(PATHS.divisionTextures, `${emblems.length} division emblem(s)`, (t) => {
        const decl = emblems
          .map((e) => `${e.texture} is TUIResourceTexture_Common\n(\n    FileName = "GameData:/Assets/2D/Interface/UseOutGame/Division/Emblem/${e.file}"\n)`)
          .join("\n");
        const bankAt = t.search(/^DivisionAdditionalTextureBank\s+is/m);
        if (bankAt < 0) throw new Error("DivisionAdditionalTextureBank not found in DivisionTextures.ndf");
        t = `${t.slice(0, bankAt)}${wrapRegion(pid, decl)}\n${t.slice(bankAt)}`;
        const entries = emblems.map((e) => `        ("${e.texture}", MAP [(~/ComponentState/Normal, ~/${e.texture})]),`);
        return appendToList(t, /^DivisionAdditionalTextureBank\s+is/m, wrapRegion(pid, entries.join("\n")));
      });
      for (const e of emblems) addFile(`${PATHS.emblems}/${e.file}`, e.blob, "Division emblem");
    }
  }

  // ── Localisation ───────────────────────────────────────────────────────────
  const csvPaths = [...new Set(TARGET_DICOS.map((d) => loc.dicos[d]).filter(Boolean))];
  for (const path of csvPaths) {
    const raw = await source.readText(path);
    if (!textRows.length && raw == null) continue;
    working.set(path, {
      raw: raw ?? "",
      text: toLf(upsertCsvRows(raw, textRows)),
      eol: raw ? detectEol(raw) : "\r\n",
      notes: textRows.length ? [`${textRows.length} text entr${textRows.length > 1 ? "ies" : "y"}`] : [],
    });
  }

  // ── Collect ────────────────────────────────────────────────────────────────
  const files = [];
  for (const [path, w] of working) {
    const data = fromLf(w.text, w.eol);
    if (data === w.raw) continue;
    files.push({ path, data, kind: "modified", notes: w.notes.length ? w.notes : ["Removed previous Waranon output"] });
  }
  files.push(...newFiles);
  return { errors, warnings, files, localisationFolder: loc.folder };
}

// ── Voice lines ──────────────────────────────────────────────────────────────

function cloneAcknowledgements(text, pid, nations, warnings) {
  const blocks = [];
  const re = /\bTAcknowDescriptor\s*\(/g;
  let m;
  while ((m = re.exec(text))) {
    const open = m.index + m[0].length - 1;
    const close = matchClose(text, open);
    if (close < 0) break;
    const country = /MotherCountry\s*=\s*'([^']*)'/.exec(text.slice(open, close))?.[1];
    if (country) blocks.push({ start: m.index, end: close + 1, country });
    re.lastIndex = close;
  }
  if (!blocks.length) return text;

  const clones = [];
  for (const n of nations) {
    const src = blocks.filter((b) => b.country === n.voiceCountry);
    if (!src.length) {
      warnings.push({ scope: "nation", id: n.id, message: `${n.name}: no voice lines found for ${n.voiceCountry}.` });
      continue;
    }
    for (const b of src) {
      clones.push(
        `        ${text.slice(b.start, b.end).replace(/(MotherCountry\s*=\s*)'[^']*'/, `$1'${n.tag}'`)},`,
      );
    }
  }
  if (!clones.length) return text;

  let at = blocks[blocks.length - 1].end;
  const comma = /^\s*,/.exec(text.slice(at));
  if (comma) at += comma[0].length;
  return `${text.slice(0, at)}\n${wrapRegion(pid, clones.join("\n"))}${text.slice(at)}`;
}

// ── Serializers ──────────────────────────────────────────────────────────────

const ndfFloat = (x) => (Number.isInteger(x) ? x.toFixed(1) : String(x));

export function serializeRule(ruleName, roster) {
  const entries = roster.map((r) => {
    const lines = [
      `            UnitDescriptor = $/GFX/Unit/${r.unit}`,
      `            AvailableWithoutTransport = ${r.noTransport ? "True" : "False"}`,
    ];
    if (r.transports?.length) {
      lines.push(`            AvailableTransportList = [ ${r.transports.map((t) => `$/GFX/Unit/${t}`).join(", ")} ]`);
    }
    lines.push(
      `            MaxPackNumber = ${Math.round(r.cards)}`,
      `            NumberOfUnitInPack = ${Math.round(r.perCard)}`,
      `            NumberOfUnitInPackXPMultiplier = [${(r.xp || [0, 1, 0.5, 0]).map(ndfFloat).join(", ")}]`,
    );
    return `        TDeckUniteRule\n        (\n${lines.join("\n")}\n        ),`;
  });
  return `${ruleName} is TDeckDivisionRule\n(\n    UnitRuleList =\n    [\n${entries.join("\n")}\n    ]\n)`;
}

export function serializeMatrix(name, matrix) {
  const rows = Object.entries(matrix).map(([factory, slots]) => `    (Factory/${factory}, [${slots.join(", ")}]),`);
  return `${name} is MAP\n[\n${rows.join("\n")}\n]`;
}

function pickStandoutUnits(roster, toDescriptor) {
  const custom = roster.filter((r) => isCustomRef(r.unit));
  const rest = roster.filter((r) => !isCustomRef(r.unit));
  return [...custom, ...rest].slice(0, 3).map((r) => toDescriptor(r.unit));
}

function fallbackEmblem(game, d) {
  const base = d.baseDivisionId && game.divisionsById.get(d.baseDivisionId);
  return (base || game.divisions[0]).emblemTexture;
}
