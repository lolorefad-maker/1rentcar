import os
import json
import sqlite3
from PIL import Image

BRAIN = r'C:\Users\LENOVO\.gemini\antigravity\brain\8a218dd6-a490-4fb9-96b2-0ba4caf0b576'
CARS_DIR = r'c:\Users\LENOVO\Desktop\threejsproject\public\media\cars'
MANIFEST_PATH = r'c:\Users\LENOVO\Desktop\threejsproject\data\media-manifest.json'
DB_PATH = r'c:\Users\LENOVO\Desktop\threejsproject\showroom.db'

# Newly generated assets
NEW_ASSETS = {
    'sl43_black_redroof': os.path.join(BRAIN, 'sl43_black_redroof_1790437193497.jpg'),
    'sl43_interior': os.path.join(BRAIN, 'sl43_interior_vip_1790437213633.jpg'),
    'gle_coupe_interior': os.path.join(BRAIN, 'gle_coupe_interior_1790437236932.jpg'),
    'rr_ghost_interior': os.path.join(BRAIN, 'rr_ghost_interior_1789416437591.jpg'),
    'maybach_interior': os.path.join(BRAIN, 'maybach_s580_int_1789416472705.jpg'),
}

def save_variant(im, dest_full, dest_thumb):
    im.save(dest_full, 'WEBP', quality=90, method=4)
    w, h = im.size
    aspect = h / w
    thumb = im.resize((640, int(640 * aspect)), Image.Resampling.LANCZOS)
    thumb.save(dest_thumb, 'WEBP', quality=88, method=6)

def run():
    print("Loading newly generated image assets...")
    loaded = {}
    for key, path in NEW_ASSETS.items():
        if os.path.exists(path):
            loaded[key] = Image.open(path).convert('RGB')
            print(f"  [OK] Asset {key}: {loaded[key].size}")
        else:
            print(f"  [MISSING] Asset {key}: {path}")

    with open(MANIFEST_PATH, 'r', encoding='utf-8') as f:
        manifest = json.load(f)

    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    # 1. Update Mercedes-AMG SL 43 (Black with Red Soft Top)
    sl_cars = ['mercedes-amg-sl43-2024', 'mercedes-e200-cabriolet-2024']
    for slug in sl_cars:
        car_dir = os.path.join(CARS_DIR, slug)
        os.makedirs(car_dir, exist_ok=True)

        cover_img = loaded['sl43_black_redroof']
        int_img = loaded['sl43_interior']

        save_variant(cover_img, os.path.join(car_dir, 'cover.webp'), os.path.join(car_dir, 'cover-640.webp'))
        save_variant(int_img, os.path.join(car_dir, 'interior.webp'), os.path.join(car_dir, 'interior-640.webp'))
        save_variant(cover_img, os.path.join(car_dir, 'rear.webp'), os.path.join(car_dir, 'rear-640.webp'))
        save_variant(int_img, os.path.join(car_dir, 'detail.webp'), os.path.join(car_dir, 'detail-640.webp'))

        images_list = [
            f'/media/cars/{slug}/cover.webp',
            f'/media/cars/{slug}/interior.webp',
            f'/media/cars/{slug}/rear.webp',
            f'/media/cars/{slug}/detail.webp',
        ]

        cur.execute("""
            UPDATE cars 
            SET color = 'Obsidian Black / Red Soft-Top',
                taglineEn = 'Iconic roadster finished in Obsidian Black with dark crimson red fabric soft-top',
                taglineAr = 'رودستر أيقونية بلون أسود ملكي وسقف قماشي أحمر فاخر',
                images = ? 
            WHERE slug = ?
        """, (json.dumps(images_list), slug))

        manifest[slug] = {
            'images': images_list,
            'cover': images_list[0],
            'interior': images_list[1],
            'rear': images_list[2],
            'detail': images_list[3],
        }
        print(f"  [UPDATED] {slug} with black/red exterior and bespoke red/black cockpit!")

    # 2. Update Mercedes-AMG GLE Coupe with the new interior
    gle_cars = ['mercedes-gle350-2024', 'mercedes-gle350e-2023']
    for slug in gle_cars:
        car_dir = os.path.join(CARS_DIR, slug)
        int_img = loaded['gle_coupe_interior']

        save_variant(int_img, os.path.join(car_dir, 'interior.webp'), os.path.join(car_dir, 'interior-640.webp'))
        save_variant(int_img, os.path.join(car_dir, 'detail.webp'), os.path.join(car_dir, 'detail-640.webp'))

        images_list = [
            f'/media/cars/{slug}/cover.webp',
            f'/media/cars/{slug}/interior.webp',
            f'/media/cars/{slug}/rear.webp',
            f'/media/cars/{slug}/detail.webp',
        ]

        cur.execute("UPDATE cars SET images = ? WHERE slug = ?", (json.dumps(images_list), slug))
        manifest[slug]['interior'] = images_list[1]
        manifest[slug]['detail'] = images_list[3]
        print(f"  [UPDATED] {slug} with new bespoke AMG GLE Coupe interior!")

    # 3. Update Rolls-Royce Ghost interior
    rr_cars = ['rolls-royce-ghost-2021', 'rolls-royce-ghost-two-tone']
    for slug in rr_cars:
        car_dir = os.path.join(CARS_DIR, slug)
        int_img = loaded['rr_ghost_interior']

        save_variant(int_img, os.path.join(car_dir, 'interior.webp'), os.path.join(car_dir, 'interior-640.webp'))
        save_variant(int_img, os.path.join(car_dir, 'detail.webp'), os.path.join(car_dir, 'detail-640.webp'))
        print(f"  [UPDATED] {slug} with Rolls-Royce Ghost interior!")

    # 4. Update Maybach & S-Class interior
    mb_cars = ['mercedes-maybach-s580', 'mercedes-maybach-s560-2018', 'mercedes-s-class-2025-grey', 'mercedes-s-class-2025-black']
    for slug in mb_cars:
        car_dir = os.path.join(CARS_DIR, slug)
        int_img = loaded['maybach_interior']

        save_variant(int_img, os.path.join(car_dir, 'interior.webp'), os.path.join(car_dir, 'interior-640.webp'))
        save_variant(int_img, os.path.join(car_dir, 'detail.webp'), os.path.join(car_dir, 'detail-640.webp'))
        print(f"  [UPDATED] {slug} with Maybach executive interior!")

    conn.commit()
    conn.close()

    with open(MANIFEST_PATH, 'w', encoding='utf-8') as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)

    print("\nDeployment of SL 43 and bespoke interiors completed successfully!")

if __name__ == '__main__':
    run()
