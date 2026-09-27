#!/usr/bin/env python3
"""Builds web-ready car imagery from the WhatsApp marketing posters.

For every vehicle in data/fleet.json this writes to public/media/cars/<slug>/:
  cover.webp          hero photo panel, with the poster's baked-in title faded out
  cover-640.webp      card-sized version of the cover
  gallery-N.webp      detail photos cut from the poster's right-hand column
and records the web paths in data/media-manifest.json (consumed by the DB seed).

Usage:  python scripts/build-media.py [--preview <dir>]
"""
import json
import shutil
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / 'public' / 'whatsapp_images'
OUTPUT_DIR = ROOT / 'public' / 'media' / 'cars'
FLEET_FILE = ROOT / 'data' / 'fleet.json'
MANIFEST_FILE = ROOT / 'data' / 'media-manifest.json'

# Poster templates, as fractions of the poster size:
#   top     header strip trimmed off the cover
#   bottom  lowest the cover may reach (the services band starts below it)
#   right   widest the cover may reach (the thumbnail column starts after it)
#   fades   (width, height) rectangles anchored top-left whose baked-in title text is faded out
LAYOUTS = {
    'A': {'top': 0.04, 'bottom': 0.655, 'right': 0.655, 'fades': [(0.58, 0.13), (0.42, 0.22)]},
    'A-wide': {'top': 0.02, 'bottom': 0.64, 'right': 0.64, 'fades': [(0.64, 0.20), (0.36, 0.33)]},
    'B': {'top': 0.08, 'bottom': 0.675, 'right': 0.66, 'fades': [(0.36, 0.19), (0.29, 0.28)]},
    'C': {'top': 0.05, 'bottom': 0.69, 'right': 0.72, 'fades': [(0.62, 0.15), (0.30, 0.44)]},
}

THUMB_WIDTH = 640


def gold_mask(pixels):
    r, g, b = (pixels[..., i].astype(np.int16) for i in range(3))
    return (r > 120) & (g > 80) & (r - b > 50) & (r >= g)


def thin_line_positions(profile, lo, hi, threshold, contrast, reach):
    """Indices in [lo, hi) where `profile` spikes above `threshold` as a thin line."""
    hits = []
    for i in range(lo, hi):
        around = min(profile[max(0, i - reach)], profile[min(len(profile) - 1, i + reach)])
        if profile[i] > threshold and profile[i] - around > contrast:
            hits.append(i)
    return hits


def find_panel_column(pixels, max_right):
    """x of the gold border that separates the main photo from the thumbnail column."""
    h, w, _ = pixels.shape
    profile = gold_mask(pixels[int(h * 0.08):int(h * 0.92)]).mean(axis=0)
    hits = thin_line_positions(profile, int(w * 0.55), int(w * 0.85), 0.5, 0.25, 8)
    return min(hits[0], max_right) if hits else max_right


def find_band_top(pixels, right, max_bottom):
    """y of the gold rule that starts the poster's services band under the photo."""
    h, w, _ = pixels.shape
    region = pixels[:, int(w * 0.05):max(int(w * 0.10), right - int(w * 0.05))]
    profile = gold_mask(region).mean(axis=1)
    hits = thin_line_positions(profile, int(h * 0.5), int(h * 0.9), 0.45, 0.25, 6)
    return min(hits[0], max_bottom) if hits else max_bottom


def looks_like_photo(region):
    """Rejects empty frames and text-only areas such as the poster's "BOOK NOW" block."""
    luminance = region.mean(axis=2)
    return luminance.mean() > 28 and luminance.std() > 22 and (luminance < 18).mean() < 0.5


def split_tall(pixels, box):
    """Two stacked photos whose divider went undetected come out portrait — cut them apart."""
    x0, y0, x1, y1 = box
    if (y1 - y0) <= (x1 - x0) * 0.95:
        return [box]
    region = pixels[y0:y1, x0:x1]
    rows = len(region)
    score = gold_mask(region).mean(axis=1) * 255 - region.mean(axis=2).mean(axis=1)
    lo, hi = int(rows * 0.3), int(rows * 0.7)
    cut = y0 + lo + int(np.argmax(score[lo:hi]))
    return [(x0, y0, x1, cut - 4), (x0, cut + 4, x1, y1)]


def find_panels(pixels, left):
    """Boxes of the framed detail photos stacked in the right-hand column."""
    h, w, _ = pixels.shape
    x0, x1 = left + int(w * 0.012), w - int(w * 0.008)
    column = pixels[:, x0:x1]
    separator = (gold_mask(column).mean(axis=1) > 0.5) | (column.mean(axis=2).mean(axis=1) < 14)

    bounds = [(-1, -1)]
    rows = np.flatnonzero(separator)
    if rows.size:
        start = prev = rows[0]
        for y in rows[1:]:
            if y - prev > 12:
                bounds.append((start, prev))
                start = y
            prev = y
        bounds.append((start, prev))
    bounds.append((h, h))

    panels = []
    for (_, top_end), (bottom_start, _) in zip(bounds, bounds[1:]):
        top, bottom = top_end + 5, bottom_start - 5
        if bottom - top < h * 0.12:
            continue
        box = (left + 8, top, w - 6, bottom)
        if looks_like_photo(pixels[top:bottom, box[0]:box[2]]):
            panels.extend(split_tall(pixels, box))
    return panels


def fade_title(image, fades):
    w, h = image.size
    mask = Image.new('L', image.size, 0)
    draw = ImageDraw.Draw(mask)
    for fw, fh in fades:
        draw.rectangle([0, 0, int(w * fw), int(h * fh)], fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(radius=max(12, int(w * 0.02))))
    softened = ImageEnhance.Brightness(image.filter(ImageFilter.GaussianBlur(radius=28))).enhance(0.06)
    return Image.composite(softened, image, mask)


def save_webp(image, path, max_width=None, quality=84):
    if max_width and image.width > max_width:
        image = image.resize((max_width, round(image.height * max_width / image.width)), Image.LANCZOS)
    image.save(path, 'WEBP', quality=quality, method=6)


def process_poster(poster):
    """Returns (cover_image, [gallery_images]) for one poster."""
    image = Image.open(SOURCE_DIR / poster['file']).convert('RGB')
    if poster['layout'] == 'full':
        return image, []

    # Per-poster overrides in fleet.json (top/bottom/right/fades) win over the template defaults.
    layout = {**LAYOUTS[poster['layout']], **{k: poster[k] for k in ('top', 'bottom', 'right', 'fades') if k in poster}}
    pixels = np.asarray(image)
    h, w, _ = pixels.shape
    column = find_panel_column(pixels, int(w * layout['right']))
    band = find_band_top(pixels, column, int(h * layout['bottom']))

    faded = fade_title(image, layout['fades'])
    cover = faded.crop((2, int(h * layout['top']), column - 6, band - 6))
    gallery = [image.crop(box) for box in find_panels(pixels, column)]
    gallery = [g for g in gallery if g.width >= 160 and g.height >= 110]
    return cover, gallery


def build(preview_dir=None):
    fleet = json.loads(FLEET_FILE.read_text(encoding='utf-8'))
    if OUTPUT_DIR.exists():
        shutil.rmtree(OUTPUT_DIR)
    manifest = {}

    for car in fleet:
        slug = car['slug']
        target = OUTPUT_DIR / slug
        target.mkdir(parents=True)
        web = f'/media/cars/{slug}'

        covers, gallery = [], []
        for poster in car['posters']:
            cover, panels = process_poster(poster)
            covers.append(cover)
            gallery.extend(panels)

        images = []
        for index, cover in enumerate(covers):
            name = 'cover' if index == 0 else f'alt-{index}'
            save_webp(cover, target / f'{name}.webp', max_width=1400)
            save_webp(cover, target / f'{name}-{THUMB_WIDTH}.webp', max_width=THUMB_WIDTH, quality=80)
            images.append(f'{web}/{name}.webp')
        for index, panel in enumerate(gallery, start=1):
            save_webp(panel, target / f'gallery-{index}.webp', quality=86)
            images.append(f'{web}/gallery-{index}.webp')

        manifest[slug] = {'images': images}
        print(f'{slug:40s} covers={len(covers)} gallery={len(gallery)}')

        if preview_dir:
            covers[0].save(Path(preview_dir) / f'{slug}.jpg', quality=80)

    MANIFEST_FILE.write_text(json.dumps(manifest, indent=2), encoding='utf-8')
    print(f'\nWrote {len(manifest)} vehicles to {MANIFEST_FILE.relative_to(ROOT)}')


if __name__ == '__main__':
    preview = None
    if '--preview' in sys.argv:
        preview = sys.argv[sys.argv.index('--preview') + 1]
        Path(preview).mkdir(parents=True, exist_ok=True)
    build(preview)
