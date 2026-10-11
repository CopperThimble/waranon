#!/usr/bin/env python3
"""
Extract observed stat ranges from WARNO game data (NDF).

Parses the real NDF files shipped in a mod folder (e.g. SampleMods/modexample)
into a tree, then walks every descriptor and records, per field path:
  - numeric fields: count, min, max, median, and which descriptor holds min/max
  - enum / reference / string fields: the set of distinct values (if small)

Unit stats are reported overall AND per FactoryType (tanks vs planes etc.),
because "max speed" across all units mixes 30 km/h infantry and 1000 km/h jets.

Also extracts:
  - hard table limits from DamageResistance.ndf (armor / damage index bounds)
  - the game's own UI min/max reference from WeaponsMinMax.ndf

Usage:
  python scripts/extract_stat_ranges.py [MOD_ROOT] [OUT_JSON]
  defaults: SampleMods/modexample  data/stat_ranges.json
"""

import json
import re
import statistics
import sys
from collections import defaultdict
from pathlib import Path

MAX_ENUM_VALUES = 60

# ── Tokenizer ────────────────────────────────────────────────────────────────

TOKEN_RE = re.compile(
    r"""
    (?P<ws>\s+)
  | (?P<comment>//[^\n]*|\(\*.*?\*\))
  | (?P<guid>GUID:\{[^}]*\})
  | (?P<rgba>RGBA\[[^\]]*\])
  | (?P<str>'[^']*'|"[^"]*")
  | (?P<num>-?\d+\.\d*(?:[eE][-+]?\d+)?|-?\d+(?:[eE][-+]?\d+)?)
  | (?P<ident>[~$]?/?[A-Za-z_][\w/]*|[~$]/[\w/]*)
  | (?P<punct>[()\[\],=|+*-])
    """,
    re.VERBOSE | re.DOTALL,
)


def tokenize(text):
    out = []
    pos = 0
    n = len(text)
    while pos < n:
        m = TOKEN_RE.match(text, pos)
        if not m:
            pos += 1  # skip unknown char
            continue
        pos = m.end()
        kind = m.lastgroup
        if kind in ("ws", "comment"):
            continue
        out.append((kind, m.group(kind)))
    return out


# ── Parser ───────────────────────────────────────────────────────────────────
# Values:
#   ("obj", type_name, [(field, value), ...])
#   ("list", [values])
#   ("map", [(key, value), ...])
#   ("tuple", [values])
#   ("num", float) | ("sym", str) | ("str", str)


class Parser:
    def __init__(self, tokens):
        self.t = tokens
        self.i = 0

    def peek(self, k=0):
        j = self.i + k
        return self.t[j] if j < len(self.t) else (None, None)

    def next(self):
        tok = self.t[self.i]
        self.i += 1
        return tok

    def accept(self, val):
        if self.peek()[1] == val:
            self.i += 1
            return True
        return False

    def parse_top(self):
        """Yield (name, value) for each top-level `[export|private] NAME is VALUE`."""
        while self.i < len(self.t):
            kind, val = self.peek()
            if val in ("export", "private", "unnamed"):
                self.next()
                if val == "unnamed":
                    yield ("<unnamed>", self.parse_value())
                    continue
                kind, val = self.peek()
            if kind == "ident" and self.peek(1)[1] == "is":
                name = self.next()[1]
                self.next()  # is
                try:
                    yield (name, self.parse_value())
                except (IndexError, ValueError):
                    return
            else:
                self.next()

    def parse_value(self):
        v = self.parse_atom()
        # binary operators: flags (A | B), arithmetic (a * b) — keep as symbol
        while self.peek()[1] in ("|", "+", "*", "-"):
            op = self.next()[1]
            rhs = self.parse_atom()
            v = ("sym", f"{render(v)} {op} {render(rhs)}")
        return v

    def parse_atom(self):
        kind, val = self.next()
        if kind == "num":
            return ("num", float(val))
        if kind == "str":
            return ("str", val[1:-1])
        if kind in ("guid", "rgba"):
            return ("sym", val)
        if val == "[":
            return self.parse_list()
        if val == "(":
            return self.parse_paren_contents()
        if kind == "ident":
            if val == "MAP" and self.peek()[1] == "[":
                self.next()
                return self.parse_map()
            if self.peek()[1] == "(":
                self.next()
                fields = self.parse_fields()
                return ("obj", val, fields)
            return ("sym", val)
        raise ValueError(f"unexpected token {val!r}")

    def parse_list(self):
        items = []
        while not self.accept("]"):
            items.append(self.parse_value())
            self.accept(",")
        return ("list", items)

    def parse_map(self):
        pairs = []
        while not self.accept("]"):
            self.next()  # (
            k = self.parse_value()
            self.accept(",")
            v = self.parse_value()
            self.accept(")")
            pairs.append((k, v))
            self.accept(",")
        return ("map", pairs)

    def parse_paren_contents(self):
        items = []
        while not self.accept(")"):
            items.append(self.parse_value())
            self.accept(",")
        return ("tuple", items)

    def parse_fields(self):
        fields = []
        while not self.accept(")"):
            kind, val = self.peek()
            if kind == "ident" and self.peek(1)[1] == "=":
                self.next()
                self.next()
                fields.append((val, self.parse_value()))
            else:
                # positional arg, e.g. TFoo(x)
                fields.append(("_", self.parse_value()))
            self.accept(",")
        return fields


def render(v):
    kind = v[0]
    if kind in ("num",):
        return repr(v[1])
    if kind in ("sym", "str"):
        return v[1]
    if kind == "obj":
        return v[1]
    return kind


def parse_file(path):
    text = Path(path).read_text(encoding="utf-8", errors="replace")
    return list(Parser(tokenize(text)).parse_top())


# ── Stats collection ─────────────────────────────────────────────────────────


class FieldStats:
    __slots__ = ("nums", "min_by", "max_by", "values")

    def __init__(self):
        self.nums = []
        self.min_by = None
        self.max_by = None
        self.values = defaultdict(int)

    def add_num(self, x, owner):
        if not self.nums or x < min(self.nums):
            self.min_by = owner
        if not self.nums or x > max(self.nums):
            self.max_by = owner
        self.nums.append(x)

    def add_val(self, s):
        self.values[s] += 1

    def to_dict(self):
        d = {}
        if self.nums:
            nums = self.nums
            d.update(
                type="number",
                count=len(nums),
                min=min(nums),
                max=max(nums),
                median=statistics.median(nums),
                integer=all(float(x).is_integer() for x in nums),
                distinct=len(set(nums)),
                min_example=self.min_by,
                max_example=self.max_by,
            )
        if self.values:
            d.setdefault("type", "enum")
            if d["type"] == "number":
                d["type"] = "number|symbol"
            d["value_count"] = len(self.values)
            if len(self.values) <= MAX_ENUM_VALUES:
                d["values"] = dict(sorted(self.values.items(), key=lambda kv: -kv[1]))
        return d


def short(sym):
    return sym


def key_label(k):
    if k[0] in ("sym", "str"):
        return k[1].split("/")[-1] if "/" in k[1] else k[1]
    if k[0] == "num":
        return repr(k[1])
    return render(k)


def walk(value, path, owner, sink):
    """Record every leaf under `value` into sink[path]."""
    kind = value[0]
    if kind == "num":
        sink[path].add_num(value[1], owner)
    elif kind in ("sym", "str"):
        sink[path].add_val(value[1])
    elif kind == "obj":
        _, tname, fields = value
        if path:
            sink[path + "#type"].add_val(tname)
        for fname, fval in fields:
            if fname == "_":
                walk(fval, f"{path}(_)", owner, sink)
            else:
                walk(fval, f"{path}.{fname}" if path else fname, owner, sink)
    elif kind == "list":
        items = value[1]
        sink[path + "#len"].add_num(len(items), owner)
        # list of (Key, value) pairs, e.g. BaseHitValueModifiers — treat like a MAP
        if items and all(
            it[0] == "tuple" and len(it[1]) == 2 and it[1][0][0] == "sym" for it in items
        ):
            for k, v in (it[1] for it in items):
                walk(v, f"{path}[{key_label(k)}]", owner, sink)
            return
        all_num = items and all(it[0] == "num" for it in items)
        for idx, it in enumerate(items):
            # positional number arrays (Salves, XP multipliers) keep index
            sub = f"{path}[{idx}]" if all_num and len(items) <= 8 else f"{path}[]"
            walk(it, sub, owner, sink)
    elif kind == "map":
        for k, v in value[1]:
            walk(v, f"{path}[{key_label(k)}]", owner, sink)
    elif kind == "tuple":
        for idx, it in enumerate(value[1]):
            walk(it, f"{path}({idx})", owner, sink)


def finalize(sink):
    return {p: s.to_dict() for p, s in sorted(sink.items())}


# ── Per-file extractors ──────────────────────────────────────────────────────


def module_key(mod):
    """Units hold a flat list of modules; key each by its type name."""
    if mod[0] == "obj":
        return mod[1]
    if mod[0] == "sym":
        return None  # shared reference like ~/SelectionModuleDescriptor
    return None


def get_field(obj, name):
    for f, v in obj[2]:
        if f == name:
            return v
    return None


def extract_units(path):
    overall = defaultdict(FieldStats)
    by_factory = defaultdict(lambda: defaultdict(FieldStats))
    shared_refs = defaultdict(int)
    module_presence = defaultdict(lambda: defaultdict(int))
    unit_count = defaultdict(int)

    for name, val in parse_file(path):
        if val[0] != "obj" or val[1] != "TEntityDescriptor":
            continue
        mods = get_field(val, "ModulesDescriptors")
        if not mods or mods[0] != "list":
            continue

        factory = "None"
        for m in mods[1]:
            if m[0] == "obj" and m[1] == "TProductionModuleDescriptor":
                ft = get_field(m, "FactoryType")
                if ft:
                    factory = ft[1].split("/")[-1]
        unit_count[factory] += 1

        for m in mods[1]:
            mk = module_key(m)
            if mk is None:
                shared_refs[render(m)] += 1
                continue
            module_presence[factory][mk] += 1
            walk(m, mk, name, overall)
            walk(m, mk, name, by_factory[factory])

    return {
        "unit_count_by_factory": dict(unit_count),
        "module_presence_by_factory": {f: dict(sorted(d.items())) for f, d in module_presence.items()},
        "shared_module_references": dict(sorted(shared_refs.items(), key=lambda kv: -kv[1])),
        "fields": finalize(overall),
        "fields_by_factory": {f: finalize(s) for f, s in sorted(by_factory.items())},
    }


def extract_generic(paths, type_filter=None):
    sink = defaultdict(FieldStats)
    count = 0
    for path in paths:
        for name, val in parse_file(path):
            if val[0] != "obj":
                continue
            if type_filter and val[1] not in type_filter:
                continue
            count += 1
            walk(val, val[1], name, sink)
    return {"descriptor_count": count, "fields": finalize(sink)}


def extract_division_rules(path):
    sink = defaultdict(FieldStats)
    per_division_units = []
    for name, val in parse_file(path):
        if val[0] != "obj" or val[1] != "TDeckDivisionRule":
            continue
        lst = get_field(val, "UnitRuleList")
        if not lst:
            continue
        per_division_units.append(len(lst[1]))
        for rule in lst[1]:
            walk(rule, "TDeckUniteRule", name, sink)
        for fname, fval in val[2]:
            if fname != "UnitRuleList":
                walk(fval, f"TDeckDivisionRule.{fname}", name, sink)
    out = {"rule_count": len(per_division_units), "fields": finalize(sink)}
    if per_division_units:
        out["units_per_division"] = {
            "min": min(per_division_units),
            "max": max(per_division_units),
            "median": statistics.median(per_division_units),
        }
    return out


def extract_cost_matrix(path):
    lengths = defaultdict(list)
    values = defaultdict(list)
    for name, val in parse_file(path):
        if val[0] != "map":
            continue
        for k, v in val[1]:
            fac = key_label(k)
            if v[0] == "list":
                lengths[fac].append(len(v[1]))
                values[fac].extend(x[1] for x in v[1] if x[0] == "num")
    return {
        fac: {
            "slots_min": min(lengths[fac]),
            "slots_max": max(lengths[fac]),
            "slot_cost_values": sorted(set(values[fac])),
        }
        for fac in sorted(lengths)
    }


def extract_resistance_limits(gfx_dir):
    out = {}
    for name, val in parse_file(gfx_dir / "DamageResistance.ndf"):
        if val[0] != "obj":
            continue
        for fname in ("ResistanceFamilyCounts", "DamageFamilyCounts"):
            lst = get_field(val, fname)
            if lst and lst[0] == "list":
                out[fname] = {
                    key_label(t[1][0]): int(t[1][1][1])
                    for t in lst[1]
                    if t[0] == "tuple" and len(t[1]) == 2 and t[1][1][0] == "num"
                }
    return out


def extract_weapons_minmax(path):
    out = {}
    for name, val in parse_file(path):
        if val[0] != "obj":
            continue
        mp = get_field(val, "WeaponsMinMaxValues")
        if not mp:
            continue
        for k, v in mp[1]:
            cat = key_label(k)
            out[cat] = {}
            for fname, fval in v[2]:
                if fval[0] == "obj":
                    lo, hi = get_field(fval, "Min"), get_field(fval, "Max")
                    out[cat][fname] = {
                        "min": lo[1] if lo else None,
                        "max": hi[1] if hi else None,
                    }
    return out


# ── Main ─────────────────────────────────────────────────────────────────────


def main():
    root = Path(sys.argv[1] if len(sys.argv) > 1 else "SampleMods/modexample")
    out_path = Path(sys.argv[2] if len(sys.argv) > 2 else "data/stat_ranges.json")
    gen = root / "GameData" / "Generated"
    gfx = gen / "Gameplay" / "Gfx"
    decks = gen / "Gameplay" / "Decks"

    version_file = root / "Gen" / "Version.ndf"
    version = None
    if version_file.exists():
        m = re.search(r"'(\d+)'", version_file.read_text())
        version = m.group(1) if m else None

    def step(label, fn):
        print(f"  {label} ...", file=sys.stderr, flush=True)
        return fn()

    result = {
        "source": str(root),
        "game_data_version": version,
        "notes": [
            "Observed ranges are what vanilla WARNO uses, NOT engine limits.",
            "Hard limits known from data tables are under 'hard_limits'.",
            "GRU = game range units; the conversion to displayed metres should be verified in-game before showing metres in the UI.",
        ],
        "hard_limits": step("damage resistance tables", lambda: extract_resistance_limits(gfx)),
        "ui_weapon_minmax": step("WeaponsMinMax", lambda: extract_weapons_minmax(gen / "UserInterface" / "WeaponsMinMax.ndf")),
        "units": step("UniteDescriptor (big)", lambda: extract_units(gfx / "UniteDescriptor.ndf")),
        "weapon_managers": step("WeaponDescriptor", lambda: extract_generic([gfx / "WeaponDescriptor.ndf"], {"TWeaponManagerModuleDescriptor"})),
        "ammunition": step("Ammunition", lambda: extract_generic([gfx / "Ammunition.ndf", gfx / "AmmunitionMissiles.ndf"], {"TAmmunitionDescriptor"})),
        "divisions": step("Divisions", lambda: extract_generic([decks / "Divisions.ndf"], {"TDeckDivisionDescriptor"})),
        "division_rules": step("DivisionRules", lambda: extract_division_rules(decks / "DivisionRules.ndf")),
        "cost_matrix": step("DivisionCostMatrix", lambda: extract_cost_matrix(decks / "DivisionCostMatrix.ndf")),
    }

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(result, indent=1), encoding="utf-8")
    print(f"Wrote {out_path} ({out_path.stat().st_size // 1024} KB)", file=sys.stderr)


if __name__ == "__main__":
    main()
