#!/usr/bin/env python3
"""
Convert extracted unit portraits (PNG) to compact WebP for the app.

    pip install pillow
    python scripts/convert_portraits.py [SRC] [DST] [--quality 82]

defaults: SRC = images/unit-icons (the raw extraction, kept locally, gitignored)
          DST = images/portraits  (what the app bundles: {NATO,PACT}/<name>.webp)

Keeps the game's folder layout (NATO/, PACT/) and file names, so lookups by the game's
texture path still work. Files already converted and newer than their source are skipped.
"""

import argparse
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    sys.exit("Pillow is required: pip install pillow")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("src", nargs="?", default="images/unit-icons")
    ap.add_argument("dst", nargs="?", default="images/portraits")
    ap.add_argument("--quality", type=int, default=82)
    args = ap.parse_args()

    src, dst = Path(args.src), Path(args.dst)
    files = sorted(src.glob("*/*.png"))
    if not files:
        sys.exit(f"No PNGs found under {src}/<side>/")

    done = skipped = before = after = 0
    for f in files:
        out = dst / f.relative_to(src).with_suffix(".webp")
        before += f.stat().st_size
        if out.exists() and out.stat().st_mtime >= f.stat().st_mtime:
            skipped += 1
            after += out.stat().st_size
            continue
        out.parent.mkdir(parents=True, exist_ok=True)
        with Image.open(f) as im:
            im.save(out, "WEBP", quality=args.quality, method=6)
        after += out.stat().st_size
        done += 1

    print(f"{done} converted, {skipped} up to date: {before / 1e6:.0f} MB PNG -> {after / 1e6:.0f} MB WebP ({dst})")


if __name__ == "__main__":
    main()
