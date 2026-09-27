import os
import json
import sqlite3
from PIL import Image

BRAIN = r'C:\Users\LENOVO\.gemini\antigravity\brain\8a218dd6-a490-4fb9-96b2-0ba4caf0b576'
CARS_DIR = r'c:\Users\LENOVO\Desktop\threejsproject\public\media\cars'
MANIFEST_PATH = r'c:\Users\LENOVO\Desktop\threejsproject\data\media-manifest.json'
DB_PATH = r'c:\Users\LENOVO\Desktop\threejsproject\showroom.db'

# The 13 Unified VIP Luxury Showroom Images
SHOWROOM_ASSETS = {
    'rr_ghost': os.path.join(BRAIN, 'rr_ghost_showroom_1790245299543.jpg'),
    'gle_coupe': os.path.join(BRAIN, 'gle_coupe_showroom_1790245320646.jpg'),
    'defender': os.path.join(BRAIN, 'defender_showroom_1790245343507.jpg'),
    'landcruiser': os.path.join(BRAIN, 'landcruiser_showroom_1790245364816.jpg'),
    'rangerover': os.path.join(BRAIN, 'rangerover_showroom_1790245386241.jpg'),
    'g63': os.path.join(BRAIN, 'g63_showroom_1790245408075.jpg'),
    'bmw7': os.path.join(BRAIN, 'bmw7_showroom_1790245442293.jpg'),
    'bmwx6': os.path.join(BRAIN, 'bmwx6_showroom_1790245490591.jpg'),
    'maybach': os.path.join(BRAIN, 'maybach_showroom_1790245520803.jpg'),
    'sclass': os.path.join(BRAIN, 'sclass_showroom_1790245544622.jpg'),
    'sl43': os.path.join(BRAIN, 'sl43_showroom_1790245574783.jpg'),
    'bmw3': os.path.join(BRAIN, 'bmw3_showroom_1790245636521.jpg'),
    'cls53': os.path.join(BRAIN, 'cls53_showroom_1790245661191.jpg'),
}

# Interior / detail supplementary assets
INTERIOR_ASSETS = {
    'rr_ghost_int': os.path.join(BRAIN, 'rr_ghost_interior_1789416437591.jpg'),
    'maybach_int': os.path.join(BRAIN, 'maybach_s580_int_1789416472705.jpg'),
}

# Curated Fleet Definition - ONLY the requested luxury vehicles
CURATED_MAPPING = {
    # 1. Rolls-Royce Ghost
    'rolls-royce-ghost-2021': ('rr_ghost', 'rr_ghost_int'),
    'rolls-royce-ghost-two-tone': ('rr_ghost', 'rr_ghost_int'),

    # 2. Mercedes-AMG GLE Coupe (Explicitly requested by user: جلي اي كوبيه)
    'mercedes-gle350-2024': ('gle_coupe', 'maybach_int'),
    'mercedes-gle350e-2023': ('gle_coupe', 'maybach_int'),

    # 3. Land Rover Defender (الدفندر)
    'land-rover-defender-2025': ('defender', 'rangerover'),
    'land-rover-defender-2021': ('defender', 'rangerover'),
    'land-rover-defender-grey': ('defender', 'rangerover'),

    # 4. Toyota Land Cruiser (اللااند)
    'toyota-land-cruiser-lc300': ('landcruiser', 'rangerover'),
    'toyota-land-cruiser-2022': ('landcruiser', 'rangerover'),

    # 5. Land Rover Range Rover (الرنج)
    'range-rover-autobiography-2024': ('rangerover', 'defender'),
    'range-rover-vogue-2025': ('rangerover', 'defender'),
    'range-rover-sport-2025': ('rangerover', 'defender'),
    'range-rover-sport-hse-dynamic-2022': ('rangerover', 'defender'),
    'range-rover-sport-hse-2021': ('rangerover', 'defender'),
    'range-rover-sport-2019': ('rangerover', 'defender'),

    # 6. BMW (بي ام)
    'bmw-7-series': ('bmw7', 'bmwx6'),
    'bmw-730li': ('bmw7', 'bmwx6'),
    'bmw-x6-2025': ('bmwx6', 'bmw7'),
    'bmw-x6-grey': ('bmwx6', 'bmw7'),
    'bmw-x5-xdrive40i-2024': ('bmwx6', 'bmw7'),
    'bmw-3-series-2024': ('bmw3', 'bmwx6'),

    # 7. Mercedes-Benz & Brabus (مرسيدس وبرافوس)
    'mercedes-maybach-s580': ('maybach', 'maybach_int'),
    'mercedes-maybach-s560-2018': ('maybach', 'maybach_int'),
    'mercedes-amg-g63-2024': ('g63', 'defender'),
    'mercedes-amg-g63-2022': ('g63', 'defender'),
    'mercedes-amg-g63-2021': ('g63', 'defender'),
    'mercedes-amg-g63-white': ('g63', 'defender'),
    'brabus-g800-2021': ('g63', 'defender'),
    'brabus-g700-2021': ('g63', 'defender'),
    'brabus-800-cabriolet-2021': ('g63', 'defender'),
    'mercedes-amg-sl43-2024': ('sl43', 'maybach_int'),
    'mercedes-e200-cabriolet-2024': ('sl43', 'maybach_int'),
    'mercedes-amg-cls53': ('cls53', 'maybach_int'),
    'mercedes-cls350-white': ('cls53', 'maybach_int'),
    'mercedes-cls350-black': ('cls53', 'maybach_int'),
    'mercedes-s-class-2025-grey': ('sclass', 'maybach_int'),
    'mercedes-s-class-2025-black': ('sclass', 'maybach_int'),
    'mercedes-s550-2015': ('sclass', 'maybach_int'),
    'mercedes-s63-brabus-2016': ('sclass', 'maybach_int'),
    'mercedes-e-class-2025-white': ('sclass', 'maybach_int'),
    'mercedes-e-class-black': ('sclass', 'maybach_int'),
    'mercedes-e-class-amg-line-black': ('sclass', 'maybach_int'),
    'mercedes-e-class-amg-line-white': ('sclass', 'maybach_int'),
    'mercedes-e-class-amg-line-silver': ('sclass', 'maybach_int'),
    'mercedes-e200-avantgarde-2022': ('sclass', 'maybach_int'),
    'mercedes-amg-e53-2021': ('sclass', 'maybach_int'),
    'mercedes-amg-e53-2020': ('sclass', 'maybach_int'),
}

def save_variant(im, dest_full, dest_thumb):
    im.save(dest_full, 'WEBP', quality=90, method=4)
    w, h = im.size
    aspect = h / w
    thumb = im.resize((640, int(640 * aspect)), Image.Resampling.LANCZOS)
    thumb.save(dest_thumb, 'WEBP', quality=88, method=6)

def run():
    print("Loading unified VIP luxury showroom source images...")
    loaded = {}
    for key, path in SHOWROOM_ASSETS.items():
        if os.path.exists(path):
            loaded[key] = Image.open(path).convert('RGB')
            print(f"  [OK] Showroom asset {key}: {loaded[key].size}")
        else:
            print(f"  [MISSING] {key}: {path}")

    for key, path in INTERIOR_ASSETS.items():
        if os.path.exists(path):
            loaded[key] = Image.open(path).convert('RGB')
            print(f"  [OK] Interior asset {key}: {loaded[key].size}")

    print("\nReading manifest and database...")
    with open(MANIFEST_PATH, 'r', encoding='utf-8') as f:
        manifest = json.load(f)

    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    # Step 1: Deactivate ALL cars first
    cur.execute("UPDATE cars SET isActive = 0")
    print("Deactivated all cars as baseline.")

    # Step 2: Activate and update curated cars
    active_count = 0
    for slug, (cover_key, int_key) in CURATED_MAPPING.items():
        cover_img = loaded.get(cover_key)
        int_img = loaded.get(int_key) or cover_img

        if not cover_img:
            print(f"Skipping {slug}: cover image not loaded")
            continue

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

        cur.execute(
            "UPDATE cars SET isActive = 1, images = ? WHERE slug = ?",
            (json.dumps(images_list), slug)
        )

        manifest[slug] = {
            'images': images_list,
            'cover': images_list[0],
            'interior': images_list[1],
            'rear': images_list[2],
            'detail': images_list[3],
        }
        active_count += 1

    # Step 3: Polish the GLE Coupe titles specifically
    cur.execute("""
        UPDATE cars 
        SET model = 'GLE Coupe 4MATIC',
            trim = 'AMG Line',
            taglineEn = 'Athletic luxury coupe SUV with dynamic VIP presence',
            taglineAr = 'مرسيدس GLE كوبيه الرياضية الفخمة بحضور استثنائي'
        WHERE slug = 'mercedes-gle350-2024'
    """)

    cur.execute("""
        UPDATE cars 
        SET model = 'GLE Coupe Plug-in Hybrid',
            trim = 'AMG Styling',
            taglineEn = 'Luxury coupe SUV combining hybrid performance with executive prestige',
            taglineAr = 'مرسيدس GLE كوبيه هايبرد فاخرة تجمع بين الأداء والهيبة'
        WHERE slug = 'mercedes-gle350e-2023'
    """)

    conn.commit()

    # Query summary of active fleet
    active_summary = cur.execute(
        "SELECT brand, COUNT(*) FROM cars WHERE isActive = 1 GROUP BY brand ORDER BY brand"
    ).fetchall()
    print("\nCurated Active Showroom Fleet Summary:")
    for brand, count in active_summary:
        print(f"  - {brand}: {count} vehicles")

    total_active = cur.execute("SELECT COUNT(*) FROM cars WHERE isActive = 1").fetchone()[0]
    total_deactivated = cur.execute("SELECT COUNT(*) FROM cars WHERE isActive = 0").fetchone()[0]
    print(f"\nTotal Active Curated Vehicles: {total_active}")
    print(f"Total Excluded Deactivated Vehicles: {total_deactivated}")

    conn.close()

    with open(MANIFEST_PATH, 'w', encoding='utf-8') as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)

    print("\nDeployment complete! Unified VIP Showroom assets and fleet curation applied successfully.")

if __name__ == '__main__':
    run()
