import os
import json
import sqlite3
from PIL import Image

BRAIN = r'C:\Users\LENOVO\.gemini\antigravity\brain\8a218dd6-a490-4fb9-96b2-0ba4caf0b576'
CARS_DIR = r'c:\Users\LENOVO\Desktop\threejsproject\public\media\cars'
MANIFEST_PATH = r'c:\Users\LENOVO\Desktop\threejsproject\data\media-manifest.json'
DB_PATH = r'c:\Users\LENOVO\Desktop\threejsproject\showroom.db'

SUV_INTERIORS = {
    'defender_interior': os.path.join(BRAIN, 'defender_interior_luxury_1790503006924.jpg'),
    'landcruiser_interior': os.path.join(BRAIN, 'landcruiser_interior_luxury_1790503025293.jpg'),
    'rangerover_interior': os.path.join(BRAIN, 'rangerover_interior_luxury_1790503044807.jpg'),
}

DEFENDER_SLUGS = [
    'land-rover-defender-2025',
    'land-rover-defender-2021',
    'land-rover-defender-grey',
]

LANDCRUISER_SLUGS = [
    'toyota-land-cruiser-lc300',
    'toyota-land-cruiser-2022',
]

RANGEROVER_SLUGS = [
    'range-rover-autobiography-2024',
    'range-rover-vogue-2025',
    'range-rover-sport-2025',
    'range-rover-sport-hse-dynamic-2022',
    'range-rover-sport-hse-2021',
    'range-rover-sport-2019',
]

def save_variant(im, dest_full, dest_thumb):
    im.save(dest_full, 'WEBP', quality=90, method=4)
    w, h = im.size
    aspect = h / w
    thumb = im.resize((640, int(640 * aspect)), Image.Resampling.LANCZOS)
    thumb.save(dest_thumb, 'WEBP', quality=88, method=6)

def run():
    print("Loading newly generated SUV interior images...")
    loaded = {}
    for key, path in SUV_INTERIORS.items():
        if os.path.exists(path):
            loaded[key] = Image.open(path).convert('RGB')
            print(f"  [OK] Asset {key}: {loaded[key].size}")
        else:
            print(f"  [MISSING] Asset {key}: {path}")

    with open(MANIFEST_PATH, 'r', encoding='utf-8') as f:
        manifest = json.load(f)

    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    # 1. Update Defender Fleet
    def_img = loaded['defender_interior']
    for slug in DEFENDER_SLUGS:
        car_dir = os.path.join(CARS_DIR, slug)
        save_variant(def_img, os.path.join(car_dir, 'interior.webp'), os.path.join(car_dir, 'interior-640.webp'))
        save_variant(def_img, os.path.join(car_dir, 'detail.webp'), os.path.join(car_dir, 'detail-640.webp'))
        images_list = [
            f'/media/cars/{slug}/cover.webp',
            f'/media/cars/{slug}/interior.webp',
            f'/media/cars/{slug}/rear.webp',
            f'/media/cars/{slug}/detail.webp',
        ]
        cur.execute("UPDATE cars SET images = ? WHERE slug = ?", (json.dumps(images_list), slug))
        manifest[slug]['interior'] = images_list[1]
        manifest[slug]['detail'] = images_list[3]
        print(f"  [UPDATED] {slug} with bespoke Defender luxury cockpit!")

    # 2. Update Land Cruiser Fleet
    lc_img = loaded['landcruiser_interior']
    for slug in LANDCRUISER_SLUGS:
        car_dir = os.path.join(CARS_DIR, slug)
        save_variant(lc_img, os.path.join(car_dir, 'interior.webp'), os.path.join(car_dir, 'interior-640.webp'))
        save_variant(lc_img, os.path.join(car_dir, 'detail.webp'), os.path.join(car_dir, 'detail-640.webp'))
        images_list = [
            f'/media/cars/{slug}/cover.webp',
            f'/media/cars/{slug}/interior.webp',
            f'/media/cars/{slug}/rear.webp',
            f'/media/cars/{slug}/detail.webp',
        ]
        cur.execute("UPDATE cars SET images = ? WHERE slug = ?", (json.dumps(images_list), slug))
        manifest[slug]['interior'] = images_list[1]
        manifest[slug]['detail'] = images_list[3]
        print(f"  [UPDATED] {slug} with bespoke Land Cruiser LC300 luxury cockpit!")

    # 3. Update Range Rover Fleet
    rr_img = loaded['rangerover_interior']
    for slug in RANGEROVER_SLUGS:
        car_dir = os.path.join(CARS_DIR, slug)
        save_variant(rr_img, os.path.join(car_dir, 'interior.webp'), os.path.join(car_dir, 'interior-640.webp'))
        save_variant(rr_img, os.path.join(car_dir, 'detail.webp'), os.path.join(car_dir, 'detail-640.webp'))
        images_list = [
            f'/media/cars/{slug}/cover.webp',
            f'/media/cars/{slug}/interior.webp',
            f'/media/cars/{slug}/rear.webp',
            f'/media/cars/{slug}/detail.webp',
        ]
        cur.execute("UPDATE cars SET images = ? WHERE slug = ?", (json.dumps(images_list), slug))
        manifest[slug]['interior'] = images_list[1]
        manifest[slug]['detail'] = images_list[3]
        print(f"  [UPDATED] {slug} with bespoke Range Rover Autobiography luxury cockpit!")

    conn.commit()
    conn.close()

    with open(MANIFEST_PATH, 'w', encoding='utf-8') as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)

    print("\nSuccessfully deployed new Defender, Land Cruiser, and Range Rover interiors!")

if __name__ == '__main__':
    run()
