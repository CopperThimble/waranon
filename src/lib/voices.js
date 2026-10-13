// Custom voice lines ("acknowledgements") for nations.
//
// In game, each unit lists voice categories (UniteDescriptor > AcknowUnitTypes, e.g. Command,
// Command_SK, Command) and plays a random clip from the entry in Sound/AcknowDescriptors.ndf matching
// (MotherCountry, TypeSpecific, Action). The engine applies the radio filter named in the entry, so
// clips should be recorded clean. Proven in game: an .ogg under GameData/Assets/Sons/... is cooked by
// GenerateMod and played.
//
// Data: nation.voice = { clips: [{ id, category, action, name, assetId, sourceAssetId, edit, duration }],
//                        keepVanilla: { "Inf|Select": true } }   // add to copied lines instead of replacing
// `category` is a base category (no _SK / _QUE / _Marine country suffix); clips apply to its variants too.

/** What each event is, when the game plays it, and lines to read out loud. */
export const VOICE_ACTIONS = {
  Select: {
    label: "Selected",
    when: "You click the unit.",
    prompts: ["Ready.", "Awaiting orders.", "Go ahead.", "Standing by.", "What's the plan?", "Yes, sir?"],
  },
  Move: {
    label: "Move order",
    when: "You order a normal move.",
    prompts: ["Moving out.", "On our way.", "Roger, moving.", "Copy that, relocating.", "Let's go, let's go!"],
  },
  QuickMove: {
    label: "Fast move order",
    when: "You order a fast move (road speed).",
    prompts: ["Double time!", "Moving fast.", "Step on it!", "Full speed ahead."],
  },
  Reverse: {
    label: "Reverse order",
    when: "You order the vehicle to back up.",
    prompts: ["Backing up.", "Reversing.", "Pulling back, keeping our front to them."],
  },
  Attack: {
    label: "Attack order",
    when: "You order it to attack a unit.",
    prompts: ["Engaging!", "Target in sight, firing.", "Light 'em up.", "Copy, attacking.", "They won't know what hit them."],
  },
  MoveAndAttackOrder: {
    label: "Attack-move order",
    when: "You order it to move and engage anything on the way.",
    prompts: ["Advancing, weapons free.", "Moving up, engaging targets of opportunity.", "Pushing forward!"],
  },
  ShootOnPosition: {
    label: "Fire on position",
    when: "You order fire on a ground position.",
    prompts: ["Firing on that position.", "Coordinates received, firing.", "Saturating the area."],
  },
  Smoke: {
    label: "Smoke order",
    when: "You order a smoke screen.",
    prompts: ["Popping smoke!", "Smoke out!", "Laying smoke on that position."],
  },
  Stop: {
    label: "Stop order",
    when: "You order it to stop.",
    prompts: ["Holding.", "Halting.", "Stopping here.", "Copy, holding position."],
  },
  WithdrawOrder: {
    label: "Withdraw order",
    when: "You order it to fall back.",
    prompts: ["Falling back!", "Pulling out.", "Withdrawing, cover us!"],
  },
  PositionForbidden: {
    label: "Can't go there",
    when: "The order is impossible (unreachable or blocked spot).",
    prompts: ["Negative, can't get there.", "No way through.", "That's not possible."],
  },
  LoadIntoTransport: {
    label: "Boarding",
    when: "You order infantry into a transport.",
    prompts: ["Mounting up.", "Everybody in!", "Getting on board."],
  },
  Unload: {
    label: "Unload order",
    when: "You order the transport to unload.",
    prompts: ["Everybody out!", "Dismount!", "Unloading."],
  },
  UnloadAtPosition: {
    label: "Unload at position",
    when: "You order a transport to drop troops at a point.",
    prompts: ["Dropping them off there.", "Taking them to the drop point."],
  },
  EnemyUnitContact: {
    label: "Enemy spotted",
    when: "The unit spots an enemy.",
    prompts: ["Contact!", "Enemy spotted!", "Hostiles ahead!", "Eyes on enemy forces."],
  },
  EnemyAirplaneContact: {
    label: "Enemy aircraft",
    when: "The unit spots an enemy plane.",
    prompts: ["Bandits!", "Enemy aircraft inbound!", "Bogeys on radar."],
  },
  TargetDestroyed: {
    label: "Target destroyed",
    when: "The unit destroys a target.",
    prompts: ["Target down!", "Got him!", "Scratch one.", "Splash one!", "That's a kill."],
  },
  DamageReceived: {
    label: "Under fire",
    when: "The unit takes damage.",
    prompts: ["We're hit!", "Taking fire!", "Damn, that was close!", "Need support here!"],
  },
  OutOfAmmo: {
    label: "Out of ammo",
    when: "The unit runs out of ammunition.",
    prompts: ["We're out of ammo!", "Winchester!", "Need resupply!", "Dry, we're dry!"],
  },
  Panicking: {
    label: "Panicking",
    when: "The unit is suppressed and breaking.",
    prompts: ["We can't hold!", "Get us out of here!", "They're everywhere!", "Fall back, fall back!"],
  },
  Surrender: {
    label: "Surrender",
    when: "The unit gives up.",
    prompts: ["We surrender!", "Don't shoot!", "It's over, we give up."],
  },
  Evacuate: {
    label: "Leaving the map",
    when: "An aircraft or unit is ordered off the battlefield.",
    prompts: ["Heading home.", "RTB.", "Leaving the area."],
  },
  CriticEvacuate: {
    label: "Badly hit, evacuating",
    when: "A badly damaged aircraft leaves.",
    prompts: ["I'm hit bad, heading out!", "Mayday, mayday, going home!", "Can't stay up, breaking off!"],
  },
  AirplaneOutOfFuel: {
    label: "Out of fuel",
    when: "An aircraft runs low on fuel.",
    prompts: ["Bingo fuel, RTB.", "Running on fumes, heading home."],
  },
  Assault: {
    label: "Assault",
    when: "Infantry assault order.",
    prompts: ["Charge!", "Go, go, go!", "Take that position!"],
  },
  Event: { label: "Event", when: "Scripted event.", prompts: [] },
};

/** Readable names for base voice categories. */
export const VOICE_CATEGORY_LABELS = {
  Inf: "Infantry",
  Inf2: "Infantry (alt.)",
  Inf_AA: "MANPADS teams",
  Inf_AT: "Anti-tank teams",
  Inf_Elite: "Elite infantry",
  Inf_Militia: "Militia",
  Engineer: "Engineers",
  Engineer2: "Engineers (alt.)",
  Command: "Command",
  Command_Infantry: "Command (infantry)",
  CommandVehicle: "Command vehicles",
  Recon_INF: "Recon infantry",
  ReconInfantry: "Recon infantry (alt.)",
  Reco: "Recon",
  Recon_Vehicle: "Recon vehicles",
  Seals: "Navy SEALs",
  Gendarme: "Gendarmes",
  Tank: "Tanks",
  TankDestroyer: "Tank destroyers",
  TankDestroyerMissile: "ATGM vehicles",
  Transport: "Transports",
  Transport2: "Transports (alt.)",
  Transport3: "Transports (alt. 2)",
  Vehicle: "Vehicles",
  Logistic: "Logistics",
  ArtShell: "Artillery",
  GunArtillery: "Towed guns",
  MLRS: "Rocket artillery",
  CanonAA: "AA guns",
  SAM: "SAM launchers",
  HeliAttack: "Attack helicopters",
  HeliTransport: "Transport helicopters",
  AirSup: "Fighters",
  Air_CAS: "Close air support",
  GroundAtk: "Ground attack planes",
  GroundAtk2: "Ground attack planes (alt.)",
  Multirole: "Multirole planes",
};

export const voiceCategoryLabel = (base) => VOICE_CATEGORY_LABELS[base] || base.replace(/_/g, " ");

const FILTER_LABELS = { RadioOutside: "radio (on foot)", RadioVehicule: "radio (vehicle)", RadioAirplane: "radio (aircraft)" };
export const filterLabel = (f) => FILTER_LABELS[f] || f;

/** Base categories with their variants, events (union) and default filter. */
export function voiceCategories(game) {
  const out = new Map();
  for (const [type, t] of Object.entries(game.acknow || {})) {
    const c = out.get(t.base) || { base: t.base, types: [], actions: new Set(), countries: new Set(), filter: null };
    c.types.push(type);
    t.actions.forEach((a) => c.actions.add(a));
    t.countries.forEach((x) => c.countries.add(x));
    if (type === t.base || !c.filter) c.filter = t.filter;
    out.set(t.base, c);
  }
  return out;
}

/** The base category a unit actually speaks with: its first listed type that exists in vanilla. */
export function unitVoiceCategory(game, base) {
  for (const t of base.acknow || []) if (game.acknow?.[t]) return game.acknow[t].base;
  return null;
}

export const lineKey = (category, action) => `${category}|${action}`;

/** Path of a clip inside the mod (GameData/...). */
export function clipPath(tag, clip, index) {
  const safe = (s) => String(s).replace(/[^A-Za-z0-9_]/g, "");
  return `GameData/Assets/Sons/Acknows/${safe(tag)}/WR_${safe(clip.category)}_${safe(clip.action)}_${index + 1}.ogg`;
}

/** Clips grouped by "category|action", in order, with their export paths. */
export function plannedClips(nation) {
  const groups = new Map();
  for (const c of nation.voice?.clips || []) {
    const k = lineKey(c.category, c.action);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(c);
  }
  const out = new Map();
  for (const [k, clips] of groups) out.set(k, clips.map((c, i) => ({ clip: c, path: clipPath(nation.tag, c, i) })));
  return out;
}

const soundLine = (path, filter) =>
  `                Template_UnitAcknow( FileName = 'GameData:/${path.replace(/^GameData\//, "")}' Filter = TSoundFilter_${filter} ),`;

/**
 * Apply a nation's clips to its acknowledgement blocks.
 * cloned: [{ type, action, text }] (vanilla blocks already re-tagged for the nation).
 * Returns the final block texts: cloned ones with Sounds replaced/extended, plus new blocks for
 * events the copied country has no entry for (or every event when no country is copied).
 */
export function voiceBlocks(game, nation, cloned) {
  const planned = plannedClips(nation);
  const keep = nation.voice?.keepVanilla || {};
  const used = new Set();
  const out = cloned.map((b) => {
    const base = game.acknow?.[b.type]?.base || b.type;
    const k = lineKey(base, b.action);
    const clips = planned.get(k);
    if (!clips) return b.text;
    used.add(k);
    const filter = /Filter\s*=\s*TSoundFilter_(\w+)/.exec(b.text)?.[1] || game.acknow?.[b.type]?.filter || "RadioOutside";
    const ours = clips.map((p) => soundLine(p.path, filter));
    return b.text.replace(/(Sounds\s*=\s*\[)([\s\S]*?)(\n\s*\])/, (m, open, existing, close) => {
      const kept = keep[k] ? existing.replace(/\s+$/, "") : "";
      return `${open}${kept}\n${ours.join("\n")}${close}`;
    });
  });
  const cats = voiceCategories(game);
  for (const [k, clips] of planned) {
    if (used.has(k)) continue;
    const [base, action] = k.split("|");
    const filter = cats.get(base)?.filter || "RadioOutside";
    out.push(
      [
        "TAcknowDescriptor",
        "        (",
        `            MotherCountry = '${nation.tag}'`,
        `            TypeSpecific  = TAcknowUnitType_${base}`,
        `            Action        = TAcknowUnitAction_${action}`,
        "            Sounds        =",
        "            [",
        ...clips.map((p) => soundLine(p.path, filter)),
        "            ]",
        "        )",
      ].join("\n"),
    );
  }
  return out;
}

/** Recorded/uploaded lines per category for a nation: Map(category -> count). */
export function clipCounts(nation) {
  const m = new Map();
  for (const c of nation.voice?.clips || []) m.set(c.category, (m.get(c.category) || 0) + 1);
  return m;
}
