import json
import sqlite3
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
FLEET_FILE = ROOT / 'data' / 'fleet.json'
MANIFEST_FILE = ROOT / 'data' / 'media-manifest.json'
CROPPED_DIR = ROOT / 'public' / 'whatsapp_images_cropped'
CARS_DIR = ROOT / 'public' / 'media' / 'cars'
DB_FILE = ROOT / 'showroom.db'
THUMB_WIDTH = 640

def save_webp(image, path, max_width=None, quality=88):
    if max_width and image.width > max_width:
        image = image.resize((max_width, round(image.height * max_width / image.width)), Image.LANCZOS)
    image.save(path, 'WEBP', quality=quality, method=6)

def main():
    fleet = json.loads(FLEET_FILE.read_text(encoding='utf-8'))
    manifest = json.loads(MANIFEST_FILE.read_text(encoding='utf-8')) if MANIFEST_FILE.exists() else {}

    updated_count = 0
    for car in fleet:
        slug = car['slug']
        target = CARS_DIR / slug
        target.mkdir(parents=True, exist_ok=True)
        web_base = f'/media/cars/{slug}'

        cover_path = f'{web_base}/cover.webp'
        car_images = [cover_path]

        for p in car.get('posters', []):
            f = p['file']
            
            # Interior photo
            int_file = CROPPED_DIR / 'interior' / f
            if int_file.exists():
                try:
                    im = Image.open(int_file).convert('RGB')
                    save_webp(im, target / 'interior.webp', max_width=1200, quality=88)
                    save_webp(im, target / f'interior-{THUMB_WIDTH}.webp', max_width=THUMB_WIDTH, quality=80)
                    car_images.append(f'{web_base}/interior.webp')
                except Exception as e:
                    print(f"Error processing interior for {slug}: {e}")

            # Rear photo
            rear_file = CROPPED_DIR / 'rear' / f
            if rear_file.exists():
                try:
                    im = Image.open(rear_file).convert('RGB')
                    save_webp(im, target / 'rear.webp', max_width=1200, quality=88)
                    save_webp(im, target / f'rear-{THUMB_WIDTH}.webp', max_width=THUMB_WIDTH, quality=80)
                    car_images.append(f'{web_base}/rear.webp')
                except Exception as e:
                    print(f"Error processing rear for {slug}: {e}")

            # Detail photo
            det_file = CROPPED_DIR / 'detail' / f
            if det_file.exists():
                try:
                    im = Image.open(det_file).convert('RGB')
                    save_webp(im, target / 'detail.webp', max_width=1200, quality=88)
                    save_webp(im, target / f'detail-{THUMB_WIDTH}.webp', max_width=THUMB_WIDTH, quality=80)
                    car_images.append(f'{web_base}/detail.webp')
                except Exception as e:
                    print(f"Error processing detail for {slug}: {e}")

        # Deduplicate while preserving order
        seen = set()
        deduped = []
        for img in car_images:
            if img not in seen:
                seen.add(img)
                deduped.append(img)

        manifest[slug] = {'images': deduped}
        updated_count += 1
        print(f"[{updated_count}/{len(fleet)}] {slug}: {len(deduped)} images")

    # Save manifest
    MANIFEST_FILE.write_text(json.dumps(manifest, indent=2), encoding='utf-8')
    print(f"\nUpdated {len(manifest)} cars in {MANIFEST_FILE}")

    # Update SQLite database if cars table exists
    if DB_FILE.exists():
        conn = sqlite3.connect(str(DB_FILE))
        cur = conn.cursor()
        for slug, data in manifest.items():
            imgs_json = json.dumps(data['images'])
            cur.execute("UPDATE cars SET images = ? WHERE slug = ?", (imgs_json, slug))
        conn.commit()
        conn.close()
        print("Updated cars table in showroom.db with new image galleries!")

if __name__ == '__main__':
    main()
