"""
Real-world map features for the terrain backdrop: roads, railways, rivers, lakes, built-up areas and
place names from OpenStreetMap (© OpenStreetMap contributors, ODbL), fetched once through the Overpass
API for each region in build_topo.py and written to public/data/topo/<id>.features.json in the same
grid units as the height grid. The app only reads those files.

    python scripts/build_osm.py            (skips regions already built; --force refetches)
"""
import json
import math
import re
import sys
import time
import urllib.parse
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from build_topo import GRID_H, GRID_W, OUT, REGIONS  # noqa: E402

OVERPASS = [  # tried in turn; the main instance is often overloaded
    "https://lz4.overpass-api.de/api/interpreter",
    "https://overpass-api.de/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
]
TOLERANCE = 0.25  # simplification tolerance in grid cells (~30 m)
SCALE = 10  # coordinates stored as integers in tenths of a grid cell

QUERY = """[out:json][timeout:180];
(
  way["highway"~"^(motorway|trunk|primary|secondary|tertiary)$"]({bbox});
  way["railway"="rail"]({bbox});
  way["waterway"~"^(river|canal|stream)$"]({bbox});
  way["natural"="water"]({bbox});
  way["landuse"~"^(residential|commercial|industrial|retail)$"]({bbox});
  node["place"~"^(city|town|village)$"]({bbox});
);
out geom qt;"""


def bbox(region):
    lat, lon = region["lat"], region["lon"]
    dlat = region["h"] / 2 / 110.57
    dlon = region["w"] / 2 / (111.32 * math.cos(math.radians(lat)))
    return lat + dlat, lat - dlat, lon - dlon, lon + dlon  # north, south, west, east


def to_grid(region, lat, lon):
    north, south, west, east = bbox(region)
    return (lon - west) / (east - west) * (GRID_W - 1), (north - lat) / (north - south) * (GRID_H - 1)


def simplify(points, tol):
    """Douglas-Peucker."""
    if len(points) < 3:
        return points
    (x1, y1), (x2, y2) = points[0], points[-1]
    dx, dy = x2 - x1, y2 - y1
    norm = math.hypot(dx, dy) or 1e-9
    worst, index = 0, 0
    for i in range(1, len(points) - 1):
        px, py = points[i]
        d = abs(dy * px - dx * py + x2 * y1 - y2 * x1) / norm
        if d > worst:
            worst, index = d, i
    if worst <= tol:
        return [points[0], points[-1]]
    return simplify(points[: index + 1], tol)[:-1] + simplify(points[index:], tol)


def simplify_shape(points, tol):
    """Simplify a line, or a closed ring: a ring's start and end coincide, which gives Douglas-Peucker a
    zero-length baseline and collapses it to two points, so split it at its farthest vertex first."""
    if len(points) > 3 and points[0] == points[-1]:
        x0, y0 = points[0]
        k = max(range(len(points)), key=lambda i: (points[i][0] - x0) ** 2 + (points[i][1] - y0) ** 2)
        return simplify(points[: k + 1], tol)[:-1] + simplify(points[k:], tol)
    return simplify(points, tol)


def inside(points, margin=5):
    return any(-margin <= x <= GRID_W + margin and -margin <= y <= GRID_H + margin for x, y in points)


def pack(points):
    return [v for x, y in points for v in (round(x * SCALE), round(y * SCALE))]


def latin_name(tags):
    """An English/Latin-script name: name:en, int_name, then the Latin part of name."""
    for key in ("name:en", "int_name", "name:latin"):
        if tags.get(key):
            return tags[key]
    name = tags.get("name", "")
    latin = re.sub(r"[^\u0000-ɏḀ-ỿ ’'\-\.]", "", name).strip(" -")
    return latin if len(latin) >= 2 else None


def fetch(region):
    north, south, west, east = bbox(region)
    q = QUERY.format(bbox=f"{south:.5f},{west:.5f},{north:.5f},{east:.5f}")
    body = urllib.parse.urlencode({"data": q}).encode()
    headers = {"User-Agent": "waranon-mod-builder/1.0 (one-off build script; github.com/CopperThimble/waranon)"}
    for attempt in range(3 * len(OVERPASS)):  # public servers answer 429/504 when busy: try the next one, then wait
        url = OVERPASS[attempt % len(OVERPASS)]
        host = urllib.parse.urlparse(url).netloc
        started = time.time()
        try:
            with urllib.request.urlopen(urllib.request.Request(url, data=body, headers=headers), timeout=240) as r:
                data = json.loads(r.read())
            if "remark" in data:  # 200 with a runtime error: the result is partial, so don't keep it
                raise RuntimeError(data["remark"].strip())
            print(f"  {region['id']}: {len(data['elements'])} elements from {host} in {time.time() - started:.0f}s")
            return data["elements"]
        except (urllib.error.URLError, TimeoutError, RuntimeError, json.JSONDecodeError) as err:
            if isinstance(err, urllib.error.HTTPError) and err.code not in (429, 502, 503, 504):
                raise
            print(f"  {region['id']}: {host} failed after {time.time() - started:.0f}s ({getattr(err, 'code', None) or err})")
            if attempt % len(OVERPASS) == len(OVERPASS) - 1:
                time.sleep(30)
    raise RuntimeError(f"{region['id']}: every Overpass server failed")


def build(region):
    out = {"major": [], "minor": [], "rail": [], "rivers": [], "streams": [], "water": [], "built": [], "places": []}
    for el in fetch(region):
        tags = el.get("tags", {})
        if el["type"] == "node":
            name = latin_name(tags)
            if name:
                x, y = to_grid(region, el["lat"], el["lon"])
                if 0 <= x <= GRID_W and 0 <= y <= GRID_H:
                    out["places"].append({"n": name, "t": tags["place"], "x": round(x, 1), "y": round(y, 1), "pop": int(re.sub(r"\D", "", tags.get("population", "")) or 0)})
            continue
        pts = [to_grid(region, p["lat"], p["lon"]) for p in el.get("geometry", [])]
        if len(pts) < 2 or not inside(pts):
            continue
        hw, ww = tags.get("highway"), tags.get("waterway")
        if hw in ("motorway", "trunk", "primary"):
            kind = "major"
        elif hw in ("secondary", "tertiary"):
            kind = "minor"
        elif tags.get("railway") == "rail":
            kind = "rail"
        elif ww in ("river", "canal"):
            kind = "rivers"
        elif ww == "stream":
            kind = "streams"
        elif tags.get("natural") == "water":
            kind = "water"
        elif tags.get("landuse"):
            kind = "built"
        else:
            continue
        simple = simplify_shape(pts, TOLERANCE)
        if kind in ("water", "built") and len(simple) < 4:
            continue  # too small to see
        out[kind].append(pack(simple))
    # biggest places first, so they win label collisions
    rank = {"city": 0, "town": 1, "village": 2}
    out["places"].sort(key=lambda p: (rank.get(p["t"], 3), -p["pop"]))
    out["scale"] = SCALE
    return out


def main():
    force = "--force" in sys.argv
    for region in REGIONS:
        path = OUT / f"{region['id']}.features.json"
        if path.exists() and not force:
            print(f"{region['id']:8} already built (use --force to refetch)")
            continue
        time.sleep(5)  # be polite to the public Overpass server
        data = build(region)
        path.write_text(json.dumps(data, separators=(",", ":")), encoding="utf-8")
        counts = ", ".join(f"{k} {len(v)}" for k, v in data.items() if isinstance(v, list))
        print(f"{region['id']:8} {path.stat().st_size // 1024:4} KB  {counts}")


if __name__ == "__main__":
    main()
