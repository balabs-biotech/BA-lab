#!/usr/bin/env python3
"""Optimize downloaded BA Labs public-site raster assets without changing their URLs."""
import argparse
from pathlib import Path
from PIL import Image, ImageOps

RASTER = {".jpg", ".jpeg", ".png", ".webp"}

def optimize(path: Path, max_edge: int, jpeg_quality: int):
    before = path.stat().st_size
    with Image.open(path) as source:
        image = ImageOps.exif_transpose(source)
        image.load()
        if max(image.size) > max_edge:
            image.thumbnail((max_edge, max_edge), Image.Resampling.LANCZOS)
        suffix = path.suffix.lower()
        if suffix in {".jpg", ".jpeg"}:
            if image.mode not in ("RGB", "L"):
                image = image.convert("RGB")
            image.save(path, "JPEG", quality=jpeg_quality, optimize=True, progressive=True)
        elif suffix == ".png":
            if image.mode not in ("RGB", "RGBA", "P", "L"):
                image = image.convert("RGBA" if "A" in image.getbands() else "RGB")
            image.save(path, "PNG", optimize=True, compress_level=9)
        elif suffix == ".webp":
            image.save(path, "WEBP", quality=jpeg_quality, method=6)
    after = path.stat().st_size
    return before, after

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--directory", required=True)
    parser.add_argument("--max-edge", type=int, default=1800)
    parser.add_argument("--jpeg-quality", type=int, default=84)
    args = parser.parse_args()
    root = Path(args.directory)
    total_before = total_after = count = 0
    for path in sorted(root.rglob("*")):
        if not path.is_file() or path.suffix.lower() not in RASTER:
            continue
        before, after = optimize(path, args.max_edge, args.jpeg_quality)
        total_before += before
        total_after += after
        count += 1
        print(f"{path.name}: {before:,} -> {after:,} bytes")
    saved = total_before - total_after
    pct = (saved / total_before * 100) if total_before else 0
    print(f"Optimized {count} images: {total_before:,} -> {total_after:,} bytes ({pct:.1f}% reduction).")

if __name__ == "__main__":
    main()
