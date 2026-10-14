#!/usr/bin/env python3
"""
Build the compact game catalog the web app loads at runtime.

Reads vanilla NDF from a WARNO mod source folder (default SampleMods/modexample)
and writes public/data/game-data.json with:
  countries, unitNameDicos, divisionTypes, units (identity + editable stats),
  weapons (per unit, ammo summary), divisions (multiplayer), rules, costMatrices,
  unitDefaults (most common deck-rule entry per unit), ranges (per category),
  hardLimits (armor/damage table sizes).

The output is committed, so CI (GitHub Pages) does not need the game files.

Usage:
  python scripts/build_game_data.py [MOD_ROOT] [OUT_JSON] [LOCALISATION_CSV]
"""

import csv
import json
import math
import re
import statistics
import sys
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from extract_stat_ranges import get_field as _get_field, key_label, parse_file  # noqa: E402


def get_field(obj, name):
    return _get_field(obj, name) if obj and obj[0] == "obj" else None

# Vanilla country tags -> display names (country names are not in the shipped CSVs)
COUNTRY_NAMES = {
    "BEL": "Belgium", "CAN": "Canada", "DDR": "East Germany", "DK": "Denmark",
    "ESP": "Spain", "FR": "France", "LUX": "Luxembourg", "NL": "Netherlands",
    "POL": "Poland", "RFA": "West Germany", "SOV": "Soviet Union",
    "TCH": "Czechoslovakia", "UK": "United Kingdom", "US": "United States",
}

# Editable unit stats: key -> label. Order = UI order.
STAT_KEYS = ["cp", "health", "speed", "roadSpeed", "stealth", "optics", "fuel", "autonomy",
             "armorFront", "armorSides", "armorRear", "armorTop", "ecm", "soldiers", "supply",
             "accel", "decel", "turnTime", "roadFactor",
             "turnRadius", "altitude", "altitudeMin", "rollAngle", "rollSpeed", "pitchAngle", "evacTime", "travelTime",
             "climb", "torque", "cyclic", "gLimit", "inclination", "deployTime", "packTime"]


def sym(v):
    return v[1] if v and v[0] in ("sym", "str") else None


def num(v):
    return v[1] if v and v[0] == "num" else None


def tail(s):
    return s.split("/")[-1] if s else s


def exact_num(x):
    """Full precision (turret angles are compared against exact pi/2 by the engine; never round them)."""
    if x is None:
        return None
    return int(x) if float(x).is_integer() else x


def clean_num(x):
    if x is None:
        return None
    return int(x) if float(x).is_integer() else round(x, 4)


def clean_text(text):
    """Strip in-game markup: '#CMD M1A1' -> 'CMD M1A1', '#RECO2 BRDM' -> 'BRDM', '#medium{x}' -> 'x'."""
    text = re.sub(r"#\w+\{([^}]*)\}", lambda m: m.group(1), text)
    text = re.sub(r"#CMD\s*", "CMD ", text)
    text = re.sub(r"#\w+\s*", "", text)
    return re.sub(r"\s+", " ", text).strip()


def load_localisation(path):
    names = {}
    if not path or not Path(path).exists():
        return names
    with open(path, encoding="utf-8", errors="replace", newline="") as f:
        for row in csv.reader(f, delimiter=";"):
            if len(row) >= 2 and row[0] != "TOKEN":
                names[row[0]] = clean_text(row[1])
    return names


def map_lookup(m, key):
    if not m or m[0] != "map":
        return None
    for k, v in m[1]:
        if key_label(k) == key:
            return v
    return None


def modules_by_type(unit):
    mods = get_field(unit, "ModulesDescriptors")
    out, refs = {}, []
    for m in mods[1] if mods else []:
        if m[0] == "obj":
            out.setdefault(m[1], m)
        elif m[0] == "sym":
            refs.append(m[1])
    return out, refs


EMPTY = ("obj", "", [])

# TagSet entries that are on (nearly) every unit or are engine plumbing; useless as filters.
NOISE_TAGS = {
    "AllUnits", "Unite", "AllowedForMissileRoE", "GroundUnits", "Inf_quartier_ok", "Inf_instructed",
    "InfmapCommander", "Steelman_infanterie_autoresolve", "noSIGINT", "Crew",
}


def useful_tags(tag_list):
    tags = [sym(t) for t in tag_list[1]] if tag_list else []
    return sorted(t for t in tags if t and t not in NOISE_TAGS and not t.startswith(("UNITE_", "SM_")))


def acknow_types(tu):
    v = get_field(tu, "AcknowUnitTypes")
    items = v[1] if v and v[0] == "list" else []
    return [tail(sym(x)).replace("TAcknowUnitType_", "") for x in items]


def extract_acknow(path):
    """Voice lines: for each voice category (TAcknowUnitType_*), the events it has lines for, the radio
    filter vanilla uses with it, and which countries have it. Base categories drop the country-variant
    suffix (_SK, _QUE, _Marine)."""
    text = path.read_text(encoding="utf-8")
    ents = re.findall(
        r"MotherCountry\s*=\s*'(\w+)'\s*TypeSpecific\s*=\s*TAcknowUnitType_(\w+)\s*Action\s*=\s*TAcknowUnitAction_(\w+)\s*Sounds\s*=\s*\[(.*?)\]",
        text,
        re.S,
    )
    types = {}
    for country, typ, action, sounds in ents:
        t = types.setdefault(typ, {"actions": set(), "countries": set(), "filters": {}})
        t["actions"].add(action)
        t["countries"].add(country)
        for f in re.findall(r"Filter\s*=\s*TSoundFilter_(\w+)", sounds):
            t["filters"][f] = t["filters"].get(f, 0) + 1
    out = {}
    for typ, t in sorted(types.items()):
        out[typ] = {
            "base": re.sub(r"_(SK|QUE|Marine)$", "", typ),
            "actions": sorted(t["actions"]),
            "countries": sorted(t["countries"]),
            "filter": max(t["filters"], key=t["filters"].get) if t["filters"] else "RadioOutside",
        }
    return out


def extract_units(path, loc, building=False):
    units = []
    for name, val in parse_file(path):
        if val[0] != "obj" or val[1] != "TEntityDescriptor":
            continue
        mods, refs = modules_by_type(val)
        tu = mods.get("TTypeUnitModuleDescriptor")
        prod = mods.get("TProductionModuleDescriptor")
        ui = mods.get("TUnitUIModuleDescriptor") or EMPTY
        if not (tu and prod):
            continue
        dmg = mods.get("TDamageModuleDescriptor")
        bl = get_field(dmg, "BlindageProperties") if dmg else None

        def armor(side):
            r = get_field(bl, f"Resistance{side}") if bl else None
            if not r:
                return None
            return {"family": tail(sym(get_field(r, "Family"))), "index": clean_num(num(get_field(r, "Index")))}

        scanner = mods.get("TScannerConfigurationDescriptor")
        fuel = mods.get("TFuelModuleDescriptor")
        land = mods.get("TLandMovementModuleDescriptor")
        plane = mods.get("AirplaneMovementDescriptor")
        apparence = mods.get("VehicleApparenceModuleDescriptor")
        plane_mod = mods.get("TAirplaneModuleDescriptor")
        heli = mods.get("THelicopterMovementModuleDescriptor")
        deploy = mods.get("TWeaponDeploymentModuleDescriptor")
        xp = mods.get("TExperienceModuleDescriptor")
        caps = get_field(mods.get("TCapaciteModuleDescriptor"), "DefaultSkillList")
        squad = mods.get("TInfantrySquadModuleDescriptor")
        n = lambda obj, field: clean_num(num(get_field(obj, field))) if obj else None
        weapon = next((tail(r) for r in refs if r.startswith("$/GFX/Weapon/WeaponDescriptor_")), None)
        tags = useful_tags(get_field(mods.get("TTagsModuleDescriptor"), "TagSet"))
        name_token = sym(get_field(ui, "NameToken"))
        specialties = get_field(ui, "SpecialtiesList")

        a = {s: armor(s) for s in ("Front", "Sides", "Rear", "Top")}
        units.append({
            "id": name,
            "building": building,
            "className": sym(get_field(val, "ClassNameForDebug")),
            "name": loc.get(name_token) or name.replace("Descriptor_Unit_", "").replace("_", " "),
            "nameToken": name_token,
            "country": sym(get_field(tu, "MotherCountry")),
            "coalition": tail(sym(get_field(tu, "Coalition"))),
            "factory": tail(sym(get_field(prod, "FactoryType"))),
            "role": sym(get_field(ui, "UnitRole")),
            "buttonTexture": sym(get_field(ui, "ButtonTexture")),
            "specialties": [sym(s) for s in specialties[1]] if specialties else [],
            # voice categories in priority order (TAcknowUnitType_Inf -> "Inf"); see extract_acknow
            "acknow": acknow_types(tu),
            "tags": tags,
            "movingType": tail(sym(get_field(land, "UnitMovingType"))) if land else None,
            "weapon": weapon,
            "armorFamily": a["Front"]["family"] if a["Front"] else None,
            "era": sym(get_field(bl, "ExplosiveReactiveArmor")) == "True" if bl else False,
            "xpPack": tail(sym(get_field(xp, "ExperienceLevelsPackDescriptor"))) if xp else None,
            "capacities": [tail(sym(c)) for c in caps[1]] if caps else [],
            "hasCapaciteModule": "TCapaciteModuleDescriptor" in mods,
            "blackHoleKey": sym(get_field(apparence, "BlackHoleKey")) if apparence else None,
            "squadKey": sym(get_field(mods.get("TInfantrySquadModuleDescriptor"), "SoldierBlackHoleKey")) if mods.get("TInfantrySquadModuleDescriptor") else None,
            "stats": {
                "cp": clean_num(num(map_lookup(get_field(prod, "ProductionRessourcesNeeded"), "Resource_CommandPoints"))),
                "health": clean_num(num(get_field(mods.get("TBaseDamageModuleDescriptor"), "MaxPhysicalDamages"))),
                "speed": clean_num(num(get_field(mods.get("TGenericMovementModuleDescriptor"), "MaxSpeedInKmph"))),
                "roadSpeed": clean_num(num(get_field(ui, "DisplayRoadSpeedInKmph"))),
                "stealth": clean_num(num(get_field(mods.get("TVisibilityModuleDescriptor"), "UnitConcealmentBonus"))),
                "optics": clean_num(num(map_lookup(get_field(scanner, "OpticalStrengths"), "Standard"))) if scanner else None,
                "fuel": clean_num(num(get_field(fuel, "FuelCapacity"))) if fuel else None,
                "autonomy": clean_num(num(get_field(fuel, "FuelMoveDuration"))) if fuel else None,
                "armorFront": a["Front"]["index"] if a["Front"] else None,
                "armorSides": a["Sides"]["index"] if a["Sides"] else None,
                "armorRear": a["Rear"]["index"] if a["Rear"] else None,
                "armorTop": a["Top"]["index"] if a["Top"] else None,
                "ecm": n(dmg, "HitRollECM"),
                "soldiers": n(squad, "SoldierCount"),
                "supply": n(mods.get("TSupplyModuleDescriptor"), "SupplyCapacity"),
                # ground mobility
                "accel": n(land, "MaxAccelerationGRU"),
                "decel": n(land, "MaxDecelerationGRU"),
                "turnTime": n(land, "TempsDemiTour"),
                "roadFactor": n(land, "SpeedBonusFactorOnRoad"),
                # aircraft
                "turnRadius": n(plane, "AgilityRadiusGRU"),
                "altitude": n(plane, "AltitudeGRU"),
                "altitudeMin": n(plane, "AltitudeMinGRU"),
                "rollAngle": n(plane, "RollAngleDegree"),
                "rollSpeed": n(plane, "RollSpeedDegreePerSecond"),
                "pitchAngle": n(plane, "PitchAngleDegree"),
                "evacTime": n(plane_mod, "EvacuationTime"),
                "travelTime": n(plane_mod, "TravelDuration"),
                # helicopters
                "climb": n(heli, "UpwardSpeedInKmph"),
                "torque": n(heli, "TorqueManoeuvrability"),
                "cyclic": n(heli, "CyclicManoeuvrability"),
                "gLimit": n(heli, "GFactorLimit"),
                "inclination": n(heli, "MaxInclination"),
                # deployable weapons (artillery, ATGM teams)
                "deployTime": n(deploy, "TimeForWeaponDeployment"),
                "packTime": n(deploy, "TimeForWeaponPacking"),
            },
        })
    return units


def hit_modifier(val, key):
    """BaseHitValueModifiers is a list of (EBaseHitValueModifier/X, n) pairs."""
    hr = get_field(val, "HitRollRuleDescriptor")
    lst = get_field(hr, "BaseHitValueModifiers")
    for t in lst[1] if lst else []:
        if t[0] == "tuple" and len(t[1]) == 2 and key_label(t[1][0]) == key:
            return clean_num(num(t[1][1]))
    return None


def extract_ammo(paths, loc):
    ammo = {}
    for p in paths:
        for name, val in parse_file(p):
            if val[0] != "obj" or val[1] != "TAmmunitionDescriptor":
                continue
            arme = get_field(val, "Arme")
            n = lambda field: clean_num(num(get_field(val, field)))
            ammo[name] = {
                "name": loc.get(sym(get_field(val, "Name"))) or name.replace("Ammo_", "").replace("_", " "),
                "file": p.stem,  # Ammunition or AmmunitionMissiles — clones go back to the same file
                "category": tail(sym(get_field(val, "MinMaxCategory"))),
                "family": tail(sym(get_field(arme, "Family"))) if arme else None,
                "indirect": sym(get_field(val, "TirIndirect")) == "True",
                # smoke cloud left where the round lands (SmokeDescriptor.ndf), or None
                "smoke": tail(sym(get_field(val, "SmokeDescriptor"))) if sym(get_field(val, "SmokeDescriptor")) not in (None, "nil") else None,
                "projectile": tail(sym(get_field(val, "ProjectileType"))),
                "impact": sym(get_field(val, "ImpactHappening")),  # key in MimeticImpactMapping (impact FX + sound)
                "icon": sym(get_field(val, "InterfaceWeaponTexture")),  # weapon picture in the unit panel
                # must match across all ammo sharing one ammo box (engine check / vanilla invariant)
                "salvoDisplay": n("AffichageMunitionParSalve"),
                "simultaneous": n("SimultaneousShotsCount"),
                "stats": {
                    "power": clean_num(num(get_field(arme, "Index"))) if arme else None,
                    "damage": n("PhysicalDamages"),
                    "suppress": n("SuppressDamages"),
                    "splash": n("RadiusSplashPhysicalDamagesGRU"),
                    "range": n("MaximumRangeGRU"),
                    "rangeMin": n("MinimumRangeGRU"),
                    "rangeHeli": n("MaximumRangeHelicopterGRU"),
                    "rangeAir": n("MaximumRangeAirplaneGRU"),
                    "accuracy": hit_modifier(val, "Idling"),
                    "accuracyMoving": hit_modifier(val, "Moving"),
                    "aimTime": n("AimingTime"),
                    "reload": n("TimeBetweenTwoSalvos"),
                    "shotsPerSalvo": n("ShotsCountPerSalvo"),
                    "shotInterval": n("TimeBetweenTwoShots"),
                    "projectileSpeed": n("ProjectileSpeedGRU"),
                    "arcAngle": round(math.degrees(num(get_field(val, "PitchForParabolic"))), 1) if get_field(val, "PitchForParabolic") else None,
                    "supplyCost": n("SupplyCost"),
                },
            }
    return ammo


def extract_smoke_clouds(path):
    """Smoke clouds an ammo can leave: { Descriptor_Smoke_Fumi81mm: { radius: GRU, seconds } }."""
    text = path.read_text(encoding="utf-8")
    clouds = {}
    for m in re.finditer(r"export (Descriptor_Smoke_\w+) is TEntityDescriptor(.*?)(?=\nexport |\Z)", text, re.S):
        radius = re.search(r"RadiusGRU\s*=\s*(\d+)", m.group(2))
        life = re.search(r"TimeToLive\s*=\s*(\d+)", m.group(2))
        clouds[m.group(1)] = {"radius": int(radius.group(1)) if radius else None, "seconds": int(life.group(1)) if life else None}
    return clouds


def extract_weapons(path):
    """Full turret -> mounted weapon tree, in document order (the exporter patches by position)."""
    weapons = {}
    for name, val in parse_file(path):
        if val[0] != "obj" or val[1] != "TWeaponManagerModuleDescriptor":
            continue
        salves = get_field(val, "Salves")
        turrets = []
        tlist = get_field(val, "TurretDescriptorList")
        for t in tlist[1] if tlist else []:
            if t[0] != "obj":
                continue
            mounted = []
            mlist = get_field(t, "MountedWeaponDescriptorList")
            for mw in mlist[1] if mlist else []:
                if mw[0] != "obj":
                    continue
                mounted.append({
                    "ammo": tail(sym(get_field(mw, "Ammunition"))),
                    "count": clean_num(num(get_field(mw, "NbWeapons"))),
                    "box": clean_num(num(get_field(mw, "AmmoBoxIndex"))),
                    "hidden": sym(get_field(mw, "HideInInterface")) == "True",
                    "slot": slot_number(mw),
                    "hand": sym(get_field(mw, "HandheldEquipmentKey")),  # infantry: WeaponAlternative_N
                    "effectTag": sym(get_field(mw, "EffectTag")),  # infantry: FireEffect_*
                    "animOne": sym(get_field(mw, "AnimateOnlyOneSoldier")) == "True",
                })
            turrets.append({
                "type": t[1].replace("TTurret", "").replace("Descriptor", ""),
                "rotationSpeed": exact_num(num(get_field(t, "VitesseRotation"))),  # rad/s
                "traverse": exact_num(num(get_field(t, "AngleRotationMax"))),  # rad, half-arc
                "facing": exact_num(num(get_field(t, "AngleRotationBase"))),  # rad, 0 = forward
                "elevation": exact_num(num(get_field(t, "AngleRotationMaxPitch"))),  # rad
                "depression": exact_num(num(get_field(t, "AngleRotationMinPitch"))),  # rad, negative = below horizon
                "bone": clean_num(num(get_field(t, "YulBoneOrdinal"))),
                "tag": sym(get_field(t, "Tag")),
                "master": clean_num(num(get_field(t, "MasterTurretYulBoneOrdinal"))),
                "mounted": mounted,
            })
        weapons[name] = {
            "hasMainSalvo": get_field(val, "SalvoIsMainSalvo") is not None,
            "salves": [clean_num(num(s)) for s in salves[1]] if salves else [],
            "turrets": turrets,
        }
    return weapons


def build_power_ranges(ammo):
    """Power is an index into a per-damage-type table, so its vanilla range is per family, not per weapon class."""
    groups = defaultdict(list)
    for a in ammo.values():
        if a["family"] and a["stats"].get("power") is not None:
            groups[a["family"]].append(a["stats"]["power"])
    return {f: {"min": min(v), "max": max(v), "median": clean_num(statistics.median(v))} for f, v in groups.items()}


def build_ammo_ranges(ammo):
    """Per MinMaxCategory (cannon AP, ATGM, SAM…): vanilla min/max/median for each ammo stat."""
    groups = defaultdict(list)
    for a in ammo.values():
        groups[a["category"] or "Other"].append(a)
    out = {}
    for cat, items in groups.items():
        out[cat] = {}
        for key in items[0]["stats"]:
            vals = [a["stats"][key] for a in items if a["stats"].get(key) is not None]
            if vals:
                out[cat][key] = {"min": min(vals), "max": max(vals), "median": clean_num(statistics.median(vals))}
    return out


def summarize_effects(pack):
    out = []
    lst = get_field(pack, "EffectsDescriptors")
    for e in lst[1] if lst else []:
        if e[0] != "obj":
            continue
        params = {}
        for k, v in e[2]:
            if v[0] in ("num", "sym", "str"):
                params[k] = clean_num(v[1]) if v[0] == "num" else v[1]
            elif v[0] == "list":
                params[k] = [x[1] for x in v[1] if x[0] in ("sym", "str")]
        out.append({"type": e[1], "params": params})
    return out


def extract_capacities(gfx, effects_path):
    packs = {name: v for name, v in parse_file(effects_path) if v[0] == "obj"}
    out = {}
    for name, v in parse_file(gfx / "CapaciteList.ndf"):
        if v[0] != "obj" or v[1] != "TCapaciteDescriptor":
            continue
        f = {k: x for k, x in v[2]}
        self_fx = tail(sym(f.get("SelfEffect"))) if f.get("SelfEffect", ("", ""))[0] == "sym" else None
        target_fx = tail(sym(f.get("TargetEffect"))) if f.get("TargetEffect", ("", ""))[0] == "sym" else None
        tags = f.get("AllowedTargetTags")
        out[name] = {
            "team": tail(sym(f.get("TargetTeamFilter"))).replace("CapaciteTargetFilter_", ""),
            "range": clean_num(num(f.get("RangeGRU"))),
            "self": summarize_effects(packs.get(self_fx)) if self_fx not in (None, "nil") else [],
            "target": summarize_effects(packs.get(target_fx)) if target_fx not in (None, "nil") else [],
            "targetMyself": sym(f.get("TargetMySelf")) == "True",
            "tags": [sym(t) for t in tags[1]] if tags else [],
        }
    return out


def extract_impact_presets(path):
    """Impact presets: name -> which surfaces have their own effect (all include sound/FX per surface)."""
    text = path.read_text(encoding="utf-8")
    return sorted(set(re.findall(r"\('(\w+)', TImpactHappening", text)))


def slot_number(mounted):
    """Weapon slot N, from WeaponActiveAndCanShootPropertyName = "WeaponActiveAndCanShoot_N"."""
    name = sym(get_field(mounted, "WeaponActiveAndCanShootPropertyName")) or ""
    m = re.search(r"_(\d+)$", name)
    return int(m.group(1)) if m else None


def matching_paren(text, open_idx):
    depth = 0
    for i in range(open_idx, len(text)):
        c = text[i]
        if c == "(":
            depth += 1
        elif c == ")":
            depth -= 1
            if depth == 0:
                return i
    return -1


def extract_depictions(path, reg_type, op_pattern, kind_name):
    """
    Unit depictions keyed by BlackHoleKey, from DepictionVehicles.ndf (TacticVehicleDepictionRegistration,
    operators DepictionOperator_<unit>_WeaponN) or DepictionAerialUnits.ndf (TacticAerialDepictionRegistration,
    operators Op_<unit>_WeaponN):
    {key: {"file": kind_name, "slots": {N: {"kind", "anchors", "fx", "carriage", "weaponIndex"}}}}
    Each weapon slot N has a fire operator (muzzle anchors, or missile pylons for MissileCarriageFire)
    and an Actions entry "weapon_effet_tagN" -> Weapon_X (firing FX + sound) in the registration.
    """
    text = path.read_text(encoding="utf-8")
    ops = {}
    for name, kind, body in re.findall(op_pattern, text, re.M):
        tag = re.search(r'FireEffectTag\s*=\s*"weapon_effet_tag(\d+)"', body)
        anchors = re.search(r"Anchors\s*=\s*\[([^\]]*)\]", body)
        carriage = re.search(r"Connoisseur\s*=\s*([\w/$~]+)", body)
        widx = re.search(r"WeaponIndex\s*=\s*(\d+)", body)
        ops[name] = {
            "slot": int(tag.group(1)) if tag else None,
            "kind": kind,
            "anchors": re.findall(r'"([^"]+)"', anchors.group(1)) if anchors else [],
            "carriage": carriage.group(1) if carriage else None,
            "weaponIndex": int(widx.group(1)) if widx else None,
        }
    out = {}
    for m in re.finditer(r"unnamed " + reg_type + r"\s*\(", text):
        close = matching_paren(text, m.end() - 1)
        block = text[m.start():close + 1]
        key = re.search(r"BlackHoleKey\s*=\s*'([^']+)'", block)
        if not key:
            continue
        actions = dict(re.findall(r'\(\s*"weapon_effet_tag(\d+)"\s*,\s*(\w+)\s*\)', block))
        slots = {}
        for op in re.findall(r"\b(\w+_Weapon\d+)\b", block):
            o = ops.get(op)
            if o and o["slot"] is not None:
                slot = {"kind": o["kind"], "anchors": o["anchors"], "fx": actions.get(str(o["slot"]))}
                if o["carriage"]:
                    slot["carriage"] = o["carriage"]
                    slot["weaponIndex"] = o["weaponIndex"]
                slots[o["slot"]] = slot
        out[key.group(1)] = {"file": kind_name, "slots": slots}
    return out


def extract_vehicle_depictions(path):
    return extract_depictions(
        path, "TacticVehicleDepictionRegistration",
        r"^(DepictionOperator_\w+?_Weapon\d+) is DepictionOperator_Weapon(\w+)\s*\(([\s\S]*?)\n\)", "vehicles")


def extract_aerial_depictions(path):
    return extract_depictions(
        path, "TacticAerialDepictionRegistration",
        r"^(Op_\w+?_Weapon\d+) is DepictionOperator_Weapon(\w+)\s*\(([\s\S]*?)\n\)", "aerial")


def extract_infantry_depictions(path):
    """
    Infantry squads (Infanterie/DepictionInfantry.ndf), keyed by SoldierBlackHoleKey:
    {key: {"soldier": TacticDepiction_X_Soldier, "meshes": {"WeaponAlternative_N": mesh}, "anim": {"WeaponAlternative_N": tag}}}
    A soldier holds the mesh of his WeaponAlternative_N; the animation tag (smg / mmg / bazooka / grenade,
    none = rifle) picks the pose; fire operators link FireEffect_* tags to WeaponShootData_0_N.
    """
    text = path.read_text(encoding="utf-8")
    alts = {}
    for name, body in re.findall(r"^AllWeaponAlternatives_(\w+) is \[([\s\S]*?)^\]", text, re.M):
        alts[name] = dict(re.findall(r"SelectorId = \['(WeaponAlternative_\d+)'\] MeshDescriptor = \$/GFX/DepictionResources/(\w+)", body))
    soldiers = {}
    for name, body in re.findall(r"^TacticDepiction_(\w+)_Soldier is TemplateInfantryDepictionFactoryTactic\s*\(([\s\S]*?)^\)", text, re.M):
        sub = re.search(r"AllWeaponSubDepiction_(\w+)", body)
        soldiers[name] = {
            "weapons": sub.group(1) if sub else None,
            "anim": {alt: tag for tag, alt in re.findall(r"\('(\w+)',\s*'(WeaponAlternative_\d+)'\)", body)},
        }
    out = {}
    for ident, soldier in re.findall(r'Identifier = "(\w+)"[\s\S]*?UnitMimetic = TacticDepiction_(\w+)_Soldier', text):
        sd = soldiers.get(soldier)
        if not sd or sd["weapons"] not in alts:
            continue
        out[ident] = {"soldier": soldier, "meshes": alts[sd["weapons"]], "anim": sd["anim"]}
    return out


def extract_firing_effects(path):
    """Firing FX + sound pairs (DepictionWeaponBlock.ndf): Weapon_X is TCompositeHappening(...)."""
    return sorted(re.findall(r"^(Weapon_\w+) is TCompositeHappening", path.read_text(encoding="utf-8"), re.M))


def extract_unit_portraits(path):
    """Unit button textures -> portrait path under UnitsIcons, e.g. 'NATO/M1A1_Abrams_US' (matches images/unit-icons/)."""
    text = path.read_text(encoding="utf-8")
    pat = r'\("(Texture_Button_Unit_\w+)",\s*MAP\s*\[\(\s*~/ComponentState/Normal,\s*TUIResourceTexture\(\s*FileName\s*=\s*"GameData:/Assets/2D/Interface/Common/UnitsIcons/([^"]+)\.png"'
    return dict(re.findall(pat, text))


def extract_weapon_icons(path):
    """Weapon panel textures: texture name -> image file basename (matches images/weapons/*.png)."""
    text = path.read_text(encoding="utf-8")
    pat = r'^(Texture_Interface_Weapon_\w+) is TUIResourceTexture_Common\s*\(\s*FileName\s*=\s*"[^"]*/([^"/]+)\.png"'
    return dict(re.findall(pat, text, re.M))


def extract_specialty_icons(ui):
    text = (ui / "UnitSpecialties.ndf").read_text(encoding="utf-8")
    return dict(re.findall(r'\(\s*"([^"]+)",\s*TUnitSpecialtyDescriptor\s*\(\s*SpecialtyTextureName\s*=\s*"([^"]+)"', text))


def extract_divisions(path, loc):
    divs = []
    for name, val in parse_file(path):
        if val[0] != "obj" or val[1] != "TDeckDivisionDescriptor":
            continue
        f = {k: v for k, v in val[2]}
        cfg = sym(f.get("CfgName")) or ""
        tags = [sym(t) for t in f["DivisionTags"][1]] if "DivisionTags" in f else []
        if not cfg.endswith("_multi"):
            continue  # solo / challenge / strategic divisions aren't useful bases
        divs.append({
            "id": name,
            "cfgName": cfg,
            "name": loc.get(sym(f.get("DivisionName"))) or cfg.removesuffix("_multi").replace("_", " "),
            "country": sym(f.get("CountryId")),
            "coalition": tail(sym(f.get("DivisionCoalition"))),
            "tags": tags,
            "typeToken": sym(f.get("TypeToken")),
            "activationPoints": clean_num(num(f.get("MaxActivationPoints"))),
            "rule": sym(f.get("DivisionRule")),
            "costMatrix": sym(f.get("CostMatrix")),
            "emblemTexture": sym(f.get("EmblemTexture")),
            "standoutUnits": [tail(sym(u)) for u in f["StandoutUnits"][1]] if "StandoutUnits" in f else [],
        })
    divs.sort(key=lambda d: (d["coalition"], d["country"] or "", d["name"]))
    return divs


def rule_entry(r):
    f = {k: v for k, v in r[2]}
    xp = f.get("NumberOfUnitInPackXPMultiplier")
    tr = f.get("AvailableTransportList")
    return {
        "unit": tail(sym(f.get("UnitDescriptor"))),
        "noTransport": sym(f.get("AvailableWithoutTransport")) == "True",
        "transports": [tail(sym(t)) for t in tr[1]] if tr else [],
        "cards": clean_num(num(f.get("MaxPackNumber"))),
        "perCard": clean_num(num(f.get("NumberOfUnitInPack"))),
        "xp": [clean_num(num(x)) for x in xp[1]] if xp else [1, 0.68, 0.49, 0],
    }


def extract_rules(path):
    rules = {}
    for name, val in parse_file(path):
        if val[0] != "obj" or val[1] != "TDeckDivisionRule":
            continue
        lst = get_field(val, "UnitRuleList")
        rules[name] = [rule_entry(r) for r in lst[1]] if lst else []
    return rules


def extract_cost_matrices(path):
    out = {}
    for name, val in parse_file(path):
        if val[0] == "map":
            out[name] = {tail(key_label(k)): [clean_num(num(x)) for x in v[1]] for k, v in val[1] if v[0] == "list"}
    return out


def extract_hard_limits(gfx):
    """Table sizes from DamageResistance.ndf: armor levels per resistance family, power levels per damage family."""
    out = {}
    for name, val in parse_file(gfx / "DamageResistance.ndf"):
        if val[0] != "obj":
            continue
        for field in ("ResistanceFamilyCounts", "DamageFamilyCounts"):
            lst = get_field(val, field)
            if lst:
                out.update({tail(key_label(t[1][0])): int(t[1][1][1]) for t in lst[1] if t[0] == "tuple"})
    return out


def extract_country_infos(path):
    countries, textures, dicos = [], {}, {}
    for name, val in parse_file(path):
        if val[0] != "obj":
            continue
        infos = get_field(val, "CountriesInfos")
        if infos:
            for k, v in infos[1]:
                countries.append({
                    "tag": sym(k),
                    "coalition": tail(sym(get_field(v, "Coalition"))),
                    "flagTexture": sym(get_field(v, "FlagTexture")),
                    "nameToken": sym(get_field(v, "NameToken")),
                })
        tex = get_field(val, "Textures")
        if tex:
            for k, v in tex[1]:
                # MAP [(~/ComponentState/Normal, TUIResourceTexture_Common(FileName = "..."))]
                inner = v[1][0][1] if v[0] == "map" and v[1] else None
                fn = sym(get_field(inner, "FileName")) if inner and inner[0] == "obj" else None
                textures[sym(k)] = fn
    for c in countries:
        c["flagFile"] = (textures.get(c["flagTexture"]) or "").split("/")[-1] or None
        c["name"] = COUNTRY_NAMES.get(c["tag"], c["tag"])
    return countries


TEXT_FORMAT_KEY_RE = re.compile(r'\(\s*"([A-Za-z0-9_]+)"\s*,\s*(?:TTFSCommand_\w+|TemplateTFS_\w+)')


def extract_reserved_text_keys(root):
    """
    Every country tag is registered as a '#TAG' inline text command in the UI's
    TextFormatScript banks, so a tag can't reuse an existing command name (e.g. 'INF',
    the infantry icon) — GenerateMod fails with "TextFormatScript already added to bank".
    """
    keys = set()
    for folder in ("GameData/UserInterface", "CommonData/UserInterface"):
        for f in (root / folder).rglob("*.ndf"):
            keys.update(TEXT_FORMAT_KEY_RE.findall(f.read_text(encoding="utf-8", errors="replace")))
    return sorted(keys)


def build_ranges(units):
    """Per factory: vanilla min/max/median for each editable stat."""
    out = defaultdict(dict)
    groups = defaultdict(list)
    for u in units:
        groups[u["factory"]].append(u)
        groups["All"].append(u)
    for fac, us in groups.items():
        for key in STAT_KEYS:
            vals = [u["stats"][key] for u in us if u["stats"].get(key) is not None]
            if vals:
                out[fac][key] = {"min": min(vals), "max": max(vals), "median": clean_num(statistics.median(vals))}
    return out


def build_unit_defaults(rules):
    """Most common deck-rule entry for each unit, used when adding it to a new division."""
    per_unit = defaultdict(Counter)
    for entries in rules.values():
        for e in entries:
            key = json.dumps({k: e[k] for k in ("noTransport", "transports", "cards", "perCard", "xp")}, sort_keys=True)
            per_unit[e["unit"]][key] += 1
    return {u: json.loads(c.most_common(1)[0][0]) for u, c in per_unit.items()}


def main():
    root = Path(sys.argv[1] if len(sys.argv) > 1 else "SampleMods/modexample")
    out_path = Path(sys.argv[2] if len(sys.argv) > 2 else "public/data/game-data.json")
    loc_path = sys.argv[3] if len(sys.argv) > 3 else "data/vanilla_localisation.csv"

    gen = root / "GameData" / "Generated"
    gfx, decks, ui = gen / "Gameplay" / "Gfx", gen / "Gameplay" / "Decks", gen / "UserInterface"
    loc = load_localisation(loc_path)

    version = None
    vf = root / "Gen" / "Version.ndf"
    if vf.exists():
        m = re.search(r"'(\d+)'", vf.read_text())
        version = m.group(1) if m else None

    print("units...", file=sys.stderr)
    units = extract_units(gfx / "UniteDescriptor.ndf", loc)
    units += extract_units(gfx / "BuildingDescriptors.ndf", loc, building=True)
    print("weapons...", file=sys.stderr)
    ammo = extract_ammo([gfx / "Ammunition.ndf", gfx / "AmmunitionMissiles.ndf"], loc)
    weapons = extract_weapons(gfx / "WeaponDescriptor.ndf")
    print("decks...", file=sys.stderr)
    rules = extract_rules(decks / "DivisionRules.ndf")
    divisions = extract_divisions(decks / "Divisions.ndf", loc)
    used_rules = {d["rule"] for d in divisions}
    transports = {t for entries in rules.values() for e in entries for t in e["transports"]}
    for u in units:
        u["isTransport"] = u["id"] in transports
    matrices = extract_cost_matrices(decks / "DivisionCostMatrix.ndf")
    used_matrices = {d["costMatrix"] for d in divisions}

    dico_dir = gfx / "UnitNamesDico"
    dicos = sorted(p.stem.replace("Dico_", "") for p in dico_dir.glob("Dico_*.ndf")) if dico_dir.exists() else []
    div_types = re.findall(r"\('(\w+)',\s*'Texture_Division_Type_", (ui / "DivisionTypes.ndf").read_text())

    used_weapons = {u["weapon"] for u in units if u["weapon"]}
    depictions = extract_vehicle_depictions(gfx / "Depictions" / "DepictionVehicles.ndf")
    depictions.update(extract_aerial_depictions(gfx / "Depictions" / "DepictionAerialUnits.ndf"))
    for u in units:
        if u.get("blackHoleKey") not in depictions:
            u["blackHoleKey"] = None  # no cloneable depiction (infantry use squadKey instead)
    infantry = extract_infantry_depictions(gfx / "Infanterie" / "DepictionInfantry.ndf")
    for u in units:
        if u.get("squadKey") not in infantry:
            u["squadKey"] = None
    # what a soldier needs to carry each hand-held ammo: taken from a vanilla squad that carries it
    # (most common setup across all squads that carry it, so one odd squad doesn't decide)
    candidates = {}
    for u in units:
        dep = infantry.get(u.get("squadKey"))
        if not dep or not u.get("weapon") or u["weapon"] not in weapons:
            continue
        for t in weapons[u["weapon"]]["turrets"]:
            for m in t["mounted"]:
                mesh = dep["meshes"].get(m.get("hand"))
                if mesh:
                    combo = (mesh, m.get("effectTag"), dep["anim"].get(m["hand"]), m.get("animOne", False))
                    candidates.setdefault(m["ammo"], {}).setdefault(combo, []).append(u["id"])
    infantry_weapons = {}
    for ammo_id, combos in sorted(candidates.items()):
        (mesh, effect, anim, one), users = max(combos.items(), key=lambda kv: len(kv[1]))
        infantry_weapons[ammo_id] = {"mesh": mesh, "effectTag": effect, "anim": anim, "animOne": one, "from": users[0], "squads": sum(map(len, combos.values()))}
    used_keys = {u["blackHoleKey"] for u in units if u["blackHoleKey"]}
    portraits = extract_unit_portraits(ui / "Textures" / "ButtonTexturesUnites.ndf")
    for u in units:
        u["portrait"] = portraits.get(u["buttonTexture"])
    for u in units:  # drop stats a unit type doesn't have (planes have no acceleration, etc.)
        u["stats"] = {k: v for k, v in u["stats"].items() if v is not None}
    data = {
        "gameVersion": version,
        "countries": extract_country_infos(ui / "UISpecificCountriesInfos.ndf"),
        "reservedTextKeys": extract_reserved_text_keys(root),
        "unitNameDicos": dicos,
        "divisionTypes": div_types,
        "hardLimits": extract_hard_limits(gfx),
        "units": units,
        "weapons": {k: v for k, v in weapons.items() if k in used_weapons},
        "ammo": ammo,
        "smokeClouds": extract_smoke_clouds(gfx / "SmokeDescriptor.ndf"),
        "ammoRanges": build_ammo_ranges(ammo),
        "powerRanges": build_power_ranges(ammo),
        "capacities": extract_capacities(gfx, gen / "Gameplay" / "Effects" / "EffetsSurUnite.ndf"),
        "specialtyIcons": extract_specialty_icons(ui),
        "impactPresets": extract_impact_presets(gfx / "MimeticImpactMapping.ndf"),
        "acknow": extract_acknow(gen / "Sound" / "AcknowDescriptors.ndf"),
        "depictions": {k: v for k, v in depictions.items() if k in used_keys},
        "infantryWeapons": infantry_weapons,
        "firingEffects": extract_firing_effects(gfx / "DepictionWeaponBlock.ndf"),
        "weaponIcons": extract_weapon_icons(ui / "Textures" / "WeaponTextures.ndf"),
        "divisions": divisions,
        "rules": {k: v for k, v in rules.items() if k in used_rules},
        "costMatrices": {k: v for k, v in matrices.items() if k in used_matrices},
        "unitDefaults": build_unit_defaults(rules),
        "ranges": build_ranges(units),
    }
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(data, separators=(",", ":")), encoding="utf-8")
    print(f"Wrote {out_path}: {out_path.stat().st_size // 1024} KB, {len(units)} units, "
          f"{len(divisions)} divisions, {len(data['countries'])} countries", file=sys.stderr)


if __name__ == "__main__":
    main()
