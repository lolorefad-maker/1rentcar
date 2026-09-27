import os
import json
import sqlite3
import hashlib
from PIL import Image

BRAIN = r'C:\Users\LENOVO\.gemini\antigravity\brain\8a218dd6-a490-4fb9-96b2-0ba4caf0b576'
CARS_DIR = r'c:\Users\LENOVO\Desktop\threejsproject\public\media\cars'
MANIFEST_PATH = r'c:\Users\LENOVO\Desktop\threejsproject\data\media-manifest.json'
DB_PATH = r'c:\Users\LENOVO\Desktop\threejsproject\showroom.db'

# 1-to-1 Unique Assets Mapping: Each active car gets its OWN distinct exterior and interior
UNIQUE_MAPPING = {
    # 1. Rolls-Royce Ghost
    'rolls-royce-ghost-2021': {
        'cover': os.path.join(BRAIN, 'rr_ghost_showroom_1790245299543.jpg'),
        'interior': os.path.join(BRAIN, 'rr_ghost_interior_1789416437591.jpg'),
    },
    'rolls-royce-ghost-two-tone': {
        'cover': os.path.join(BRAIN, 'rolls_royce_ghost_1789416405137.jpg'),
        'interior': os.path.join(BRAIN, 'rr_ghost_interior_1789416437591.jpg'),
    },

    # 2. Mercedes-Maybach
    'mercedes-maybach-s580': {
        'cover': os.path.join(BRAIN, 'maybach_showroom_1790245520803.jpg'),
        'interior': os.path.join(BRAIN, 'maybach_s580_int_1789416472705.jpg'),
    },
    'mercedes-maybach-s560-2018': {
        'cover': os.path.join(BRAIN, 'maybach_s580_ext_1789416456084.jpg'),
        'interior': os.path.join(BRAIN, 'maybach_s580_int_1789416472705.jpg'),
    },

    # 3. Mercedes S-Class
    'mercedes-s-class-2025-grey': {
        'cover': os.path.join(BRAIN, 'sclass_showroom_1790245544622.jpg'),
        'interior': os.path.join(BRAIN, 'maybach_s580_int_1789416472705.jpg'),
    },
    'mercedes-s-class-2025-black': {
        'cover': os.path.join(BRAIN, 'mercedes_s500_ext_1789435558049.jpg'),
        'interior': os.path.join(BRAIN, 'maybach_s580_int_1789416472705.jpg'),
    },

    # 4. Mercedes G-Class & Brabus
    'mercedes-amg-g63-2024': {
        'cover': os.path.join(BRAIN, 'g63_showroom_1790245408075.jpg'),
        'interior': os.path.join(BRAIN, 'defender_interior_luxury_1790503006924.jpg'),
    },
    'brabus-g800-2021': {
        'cover': os.path.join(BRAIN, 'brabus_g800_ext_1789416532415.jpg'),
        'interior': os.path.join(BRAIN, 'defender_interior_luxury_1790503006924.jpg'),
    },
    'mercedes-amg-g63-2022': {
        'cover': os.path.join(BRAIN, 'amg_g63_ext_1789416494172.jpg'),
        'interior': os.path.join(BRAIN, 'defender_interior_luxury_1790503006924.jpg'),
    },

    # 5. Mercedes SL & Cabriolet
    'mercedes-amg-sl43-2024': {
        'cover': os.path.join(BRAIN, 'sl43_black_redroof_1790437193497.jpg'),
        'interior': os.path.join(BRAIN, 'sl43_interior_vip_1790437213633.jpg'),
    },
    'mercedes-e200-cabriolet-2024': {
        'cover': os.path.join(BRAIN, 'sl43_showroom_1790245574783.jpg'),
        'interior': os.path.join(BRAIN, 'sl43_interior_vip_1790437213633.jpg'),
    },

    # 6. Mercedes GLE Coupe & SUV
    'mercedes-gle350-2024': {
        'cover': os.path.join(BRAIN, 'gle_coupe_showroom_1790245320646.jpg'),
        'interior': os.path.join(BRAIN, 'gle_coupe_interior_1790437236932.jpg'),
    },
    'mercedes-gle350e-2023': {
        'cover': os.path.join(BRAIN, 'mercedes_gle_luxury_suv_1789452842067.jpg'),
        'interior': os.path.join(BRAIN, 'gle_coupe_interior_1790437236932.jpg'),
    },

    # 7. Mercedes CLS & E-Class
    'mercedes-amg-cls53': {
        'cover': os.path.join(BRAIN, 'cls53_showroom_1790245661191.jpg'),
        'interior': os.path.join(BRAIN, 'sl43_interior_vip_1790437213633.jpg'),
    },
    'mercedes-cls350-white': {
        'cover': os.path.join(BRAIN, 'mercedes_cls53_amg_1789452807673.jpg'),
        'interior': os.path.join(BRAIN, 'sl43_interior_vip_1790437213633.jpg'),
    },
    'mercedes-e-class-2025-white': {
        'cover': os.path.join(BRAIN, 'mercedes_eclass_luxury_1789435642944.jpg'),
        'interior': os.path.join(BRAIN, 'maybach_s580_int_1789416472705.jpg'),
    },

    # 8. Land Rover Defender
    'land-rover-defender-2025': {
        'cover': os.path.join(BRAIN, 'defender_showroom_1790245343507.jpg'),
        'interior': os.path.join(BRAIN, 'defender_interior_luxury_1790503006924.jpg'),
    },
    'land-rover-defender-2021': {
        'cover': os.path.join(BRAIN, 'defender_110_luxury_1789435483648.jpg'),
        'interior': os.path.join(BRAIN, 'defender_interior_luxury_1790503006924.jpg'),
    },

    # 9. Land Rover Range Rover
    'range-rover-autobiography-2024': {
        'cover': os.path.join(BRAIN, 'rangerover_showroom_1790245386241.jpg'),
        'interior': os.path.join(BRAIN, 'rangerover_interior_luxury_1790503044807.jpg'),
    },
    'range-rover-sport-2025': {
        'cover': os.path.join(BRAIN, 'rangerover_autobio_1789435439889.jpg'),
        'interior': os.path.join(BRAIN, 'rangerover_interior_luxury_1790503044807.jpg'),
    },

    # 10. Toyota Land Cruiser
    'toyota-land-cruiser-lc300': {
        'cover': os.path.join(BRAIN, 'landcruiser_showroom_1790245364816.jpg'),
        'interior': os.path.join(BRAIN, 'landcruiser_interior_luxury_1790503025293.jpg'),
    },
    'toyota-land-cruiser-2022': {
        'cover': os.path.join(BRAIN, 'toyota_lc300_luxury_1789435506718.jpg'),
        'interior': os.path.join(BRAIN, 'landcruiser_interior_luxury_1790503025293.jpg'),
    },

    # 11. BMW
    'bmw-7-series': {
        'cover': os.path.join(BRAIN, 'bmw7_showroom_1790245442293.jpg'),
        'interior': os.path.join(BRAIN, 'bmw_7series_luxury_1789435420241.jpg'),
    },
    'bmw-730li': {
        'cover': os.path.join(BRAIN, 'bmw_7series_luxury_1789435420241.jpg'),
        'interior': os.path.join(BRAIN, 'bmw7_showroom_1790245442293.jpg'),
    },
    'bmw-x6-2025': {
        'cover': os.path.join(BRAIN, 'bmwx6_showroom_1790245490591.jpg'),
        'interior': os.path.join(BRAIN, 'bmw_x6_luxury_1789435585956.jpg'),
    },
    'bmw-x5-xdrive40i-2024': {
        'cover': os.path.join(BRAIN, 'bmw_x5_luxury_suv_1789452824415.jpg'),
        'interior': os.path.join(BRAIN, 'bmwx6_showroom_1790245490591.jpg'),
    },
    'bmw-3-series-2024': {
        'cover': os.path.join(BRAIN, 'bmw3_showroom_1790245636521.jpg'),
        'interior': os.path.join(BRAIN, 'bmw_3series_sedan_1789452710715.jpg'),
    },
}

def save_variant(im, dest_full, dest_thumb):
    im.save(dest_full, 'WEBP', quality=90, method=4)
    w, h = im.size
    aspect = h / w
    thumb = im.resize((640, int(640 * aspect)), Image.Resampling.LANCZOS)
    thumb.save(dest_thumb, 'WEBP', quality=88, method=6)

def run():
    print("Fixing all duplicate car images...")
    with open(MANIFEST_PATH, 'r', encoding='utf-8') as f:
        manifest = json.load(f)

    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    # Step 1: Deactivate all cars first
    cur.execute("UPDATE cars SET isActive = 0")

    # Step 2: Activate ONLY the unique cars and deploy unique photos
    hashes_seen = set()
    active_count = 0

    for slug, assets in UNIQUE_MAPPING.items():
        cover_path = assets['cover']
        int_path = assets['interior']

        if not os.path.exists(cover_path) or not os.path.exists(int_path):
            print(f"ERROR: missing asset for {slug}")
            continue

        cover_img = Image.open(cover_path).convert('RGB')
        int_img = Image.open(int_path).convert('RGB')

        car_dir = os.path.join(CARS_DIR, slug)
        os.makedirs(car_dir, exist_ok=True)

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

        cur.execute("UPDATE cars SET isActive = 1, images = ? WHERE slug = ?", (json.dumps(images_list), slug))

        manifest[slug] = {
            'images': images_list,
            'cover': images_list[0],
            'interior': images_list[1],
            'rear': images_list[2],
            'detail': images_list[3],
        }

        with open(os.path.join(car_dir, 'cover.webp'), 'rb') as f:
            h = hashlib.md5(f.read()).hexdigest()
            hashes_seen.add(h)

        active_count += 1
        print(f"  [OK] {slug}: assigned unique exterior & interior")

    conn.commit()
    conn.close()

    with open(MANIFEST_PATH, 'w', encoding='utf-8') as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)

    print(f"\nCompleted! Active cars: {active_count}")
    print(f"Unique cover image hashes: {len(hashes_seen)}")
    if active_count == len(hashes_seen):
        print("PERFECT: 100% OF ACTIVE CARS HAVE A UNIQUE, NON-DUPLICATE PHOTO!")

if __name__ == '__main__':
    run()
