"""
Real terrain for the Field interface backdrop.

Downloads elevation tiles (AWS Open Data "Terrain Tiles", terrarium encoding: height in metres =
R*256 + G + B/256 - 32768; sources include NASA SRTM, see
https://github.com/tilezen/joerd/blob/master/docs/attribution.md) once, crops each region and writes a
compact height grid to public/data/topo/<id>.json. The app only reads those files: nothing is fetched
from AWS at runtime.

    python scripts/build_topo.py            (needs: pip install pillow)
"""
import base64
import io
import json
import math
import struct
import urllib.request
from pathlib import Path

from PIL import Image

ZOOM = 11
GRID_W, GRID_H = 320, 200  # samples across / down (about 125 m apart over a 40 x 25 km sheet)
OUT = Path("public/data/topo")

# Cold War flashpoints; centre lat/lon, sheet width x height in km.
REGIONS = [
    {"id": "kabul", "name": "Kabul basin", "place": "Afghanistan", "lat": 34.53, "lon": 69.17, "w": 44, "h": 27.5},
    {"id": "ashau", "name": "A Shau Valley", "place": "Vietnam", "lat": 16.22, "lon": 107.22, "w": 40, "h": 25},
    {"id": "maestra", "name": "Sierra Maestra", "place": "Cuba", "lat": 20.03, "lon": -76.86, "w": 40, "h": 25},
    {"id": "fulda", "name": "Fulda Gap", "place": "Inner German border", "lat": 50.58, "lon": 9.92, "w": 40, "h": 25},
    {"id": "harz", "name": "Harz / Brocken", "place": "Inner German border", "lat": 51.79, "lon": 10.62, "w": 36, "h": 22.5},
]


def tile_xy(lat, lon, z):
    """Fractional tile coordinates (Web Mercator)."""
    n = 2**z
    x = (lon + 180) / 360 * n
    lat_r = math.radians(lat)
    y = (1 - math.asinh(math.tan(lat_r)) / math.pi) / 2 * n
    return x, y


_cache = {}


def tile(z, x, y):
    key = (z, x, y)
    if key not in _cache:
        url = f"https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"
        with urllib.request.urlopen(url, timeout=30) as r:
            _cache[key] = Image.open(io.BytesIO(r.read())).convert("RGB").load()
    return _cache[key]


def elevation(z, fx, fy):
    """Bilinear-sampled height (m) at fractional tile coords."""
    px, py = fx * 256, fy * 256

    def at(ix, iy):
        t = tile(z, ix // 256, iy // 256)
        r, g, b = t[ix % 256, iy % 256]
        return r * 256 + g + b / 256 - 32768

    x0, y0 = int(math.floor(px)), int(math.floor(py))
    dx, dy = px - x0, py - y0
    return (
        at(x0, y0) * (1 - dx) * (1 - dy)
        + at(x0 + 1, y0) * dx * (1 - dy)
        + at(x0, y0 + 1) * (1 - dx) * dy
        + at(x0 + 1, y0 + 1) * dx * dy
    )


def nice_interval(span_m):
    """Contour interval giving roughly 25-40 lines, from the usual map series."""
    for step in (10, 20, 25, 50, 100, 200, 250, 500):
        if span_m / step <= 40:
            return step
    return 1000


def build(region):
    lat, lon = region["lat"], region["lon"]
    km_per_deg_lat = 110.57
    km_per_deg_lon = 111.32 * math.cos(math.radians(lat))
    north, south = lat + region["h"] / 2 / km_per_deg_lat, lat - region["h"] / 2 / km_per_deg_lat
    west, east = lon - region["w"] / 2 / km_per_deg_lon, lon + region["w"] / 2 / km_per_deg_lon
    heights = []
    for j in range(GRID_H):
        la = north + (south - north) * j / (GRID_H - 1)
        for i in range(GRID_W):
            lo = west + (east - west) * i / (GRID_W - 1)
            fx, fy = tile_xy(la, lo, ZOOM)
            heights.append(max(0, round(elevation(ZOOM, fx, fy))))  # sea level and below -> 0 (coastline contour)
    lo_h, hi_h = min(heights), max(heights)
    packed = struct.pack(f"<{len(heights)}H", *heights)
    return {
        **{k: region[k] for k in ("id", "name", "place", "lat", "lon")},
        "widthKm": region["w"],
        "heightKm": region["h"],
        "cols": GRID_W,
        "rows": GRID_H,
        "min": lo_h,
        "max": hi_h,
        "interval": nice_interval(hi_h - lo_h),
        "heights": base64.b64encode(packed).decode("ascii"),  # uint16 little-endian, row-major, metres
    }


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    index = []
    for region in REGIONS:
        data = build(region)
        (OUT / f"{region['id']}.json").write_text(json.dumps(data), encoding="utf-8")
        index.append({k: data[k] for k in ("id", "name", "place", "lat", "lon", "min", "max", "interval")})
        print(f"{region['id']:8} {data['min']:5}-{data['max']:5} m, contours every {data['interval']} m")
    (OUT / "index.json").write_text(json.dumps(index, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()
