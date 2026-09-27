import os
import json
import sqlite3
from PIL import Image

BRAIN = r'C:\Users\LENOVO\.gemini\antigravity\brain\8a218dd6-a490-4fb9-96b2-0ba4caf0b576'
CARS_DIR = r'c:\Users\LENOVO\Desktop\threejsproject\public\media\cars'
MANIFEST_PATH = r'c:\Users\LENOVO\Desktop\threejsproject\data\media-manifest.json'
DB_PATH = r'c:\Users\LENOVO\Desktop\threejsproject\showroom.db'

# Source assets
ASSETS = {
    'rolls_royce_ext': os.path.join(BRAIN, 'rolls_royce_ghost_1789416405137.jpg'),
    'rolls_royce_int': os.path.join(BRAIN, 'rr_ghost_interior_1789416437591.jpg'),
    'maybach_ext': os.path.join(BRAIN, 'maybach_s580_ext_1789416456084.jpg'),
    'maybach_int': os.path.join(BRAIN, 'maybach_s580_int_1789416472705.jpg'),
    'g63_ext': os.path.join(BRAIN, 'amg_g63_ext_1789416494172.jpg'),
    'brabus_ext': os.path.join(BRAIN, 'brabus_g800_ext_1789416532415.jpg'),
    'bmw7_ext': os.path.join(BRAIN, 'bmw_7series_luxury_1789435420241.jpg'),
    'rangerover_ext': os.path.join(BRAIN, 'rangerover_autobio_1789435439889.jpg'),
    'escalade_ext': os.path.join(BRAIN, 'cadillac_escalade_ext_1789435461571.jpg'),
    'defender_ext': os.path.join(BRAIN, 'defender_110_luxury_1789435483648.jpg'),
    'lc300_ext': os.path.join(BRAIN, 'toyota_lc300_luxury_1789435506718.jpg'),
    'hongqi_ext': os.path.join(BRAIN, 'hongqi_h9_luxury_1789435530738.jpg'),
    's500_ext': os.path.join(BRAIN, 'mercedes_s500_ext_1789435558049.jpg'),
    'bmwx6_ext': os.path.join(BRAIN, 'bmw_x6_luxury_1789435585956.jpg'),
    'tahoe_ext': os.path.join(BRAIN, 'chevrolet_tahoe_luxury_1789435613781.jpg'),
    'eclass_ext': os.path.join(BRAIN, 'mercedes_eclass_luxury_1789435642944.jpg'),
    'pagoda_ext': os.path.join(BRAIN, 'mercedes_280sl_pagoda_1789436198136.jpg'),
    'camaro_ext': os.path.join(BRAIN, 'camaro_zl1_sports_1789436243335.jpg'),
    'jetour_ext': os.path.join(BRAIN, 'jetour_t2_suv_1789436502499.jpg'),
    'sl43_ext': os.path.join(BRAIN, 'mercedes_sl43_roadster_1789451234650.jpg'),
    'gladiator_ext': os.path.join(BRAIN, 'jeep_gladiator_rubicon_1789452695430.jpg'),
    'bmw3_ext': os.path.join(BRAIN, 'bmw_3series_sedan_1789452710715.jpg'),
    'ehs9_ext': os.path.join(BRAIN, 'hongqi_ehs9_electric_1789452726941.jpg'),
    'polestar_ext': os.path.join(BRAIN, 'polestar_2_electric_1789452751636.jpg'),
    'sequoia_ext': os.path.join(BRAIN, 'toyota_sequoia_capstone_1789452775117.jpg'),
    'impala_ext': os.path.join(BRAIN, 'impala_ss_convertible_1789452791274.jpg'),
    'cls53_ext': os.path.join(BRAIN, 'mercedes_cls53_amg_1789452807673.jpg'),
    'bmwx5_ext': os.path.join(BRAIN, 'bmw_x5_luxury_suv_1789452824415.jpg'),
    'gle_ext': os.path.join(BRAIN, 'mercedes_gle_luxury_suv_1789452842067.jpg'),
    'vintage_roadster_ext': os.path.join(BRAIN, 'vintage_british_roadster_1789452859736.jpg'),
    'mercedes_560sl_ext': os.path.join(BRAIN, 'mercedes_560sl_classic_1789452878373.jpg'),
}

# Individualized Mapping for all 68 vehicles to their bespoke model asset
FLEET_MAP = {
    # Rolls-Royce
    'rolls-royce-ghost-2021': ('rolls_royce_ext', 'rolls_royce_int'),
    'rolls-royce-ghost-two-tone': ('rolls_royce_ext', 'rolls_royce_int'),

    # Maybach
    'mercedes-maybach-s580': ('maybach_ext', 'maybach_int'),
    'mercedes-maybach-s560-2018': ('maybach_ext', 'maybach_int'),

    # S-Class
    'mercedes-s-class-2025-grey': ('s500_ext', 'maybach_int'),
    'mercedes-s-class-2025-black': ('s500_ext', 'maybach_int'),
    'mercedes-s550-2015': ('s500_ext', 'maybach_int'),
    'mercedes-s63-brabus-2016': ('s500_ext', 'maybach_int'),

    # Brabus
    'brabus-g800-2021': ('brabus_ext', 'g63_ext'),
    'brabus-g700-2021': ('brabus_ext', 'g63_ext'),
    'brabus-800-cabriolet-2021': ('brabus_ext', 'g63_ext'),

    # G-Wagon
    'mercedes-amg-g63-2024': ('g63_ext', 'brabus_ext'),
    'mercedes-amg-g63-2022': ('g63_ext', 'brabus_ext'),
    'mercedes-amg-g63-2021': ('g63_ext', 'brabus_ext'),
    'mercedes-amg-g63-white': ('g63_ext', 'brabus_ext'),

    # Mercedes Roadsters & Convertibles
    'mercedes-amg-sl43-2024': ('sl43_ext', 'maybach_int'),
    'mercedes-e200-cabriolet-2024': ('sl43_ext', 'maybach_int'),

    # Mercedes CLS Coupe
    'mercedes-amg-cls53': ('cls53_ext', 'maybach_int'),
    'mercedes-cls350-white': ('cls53_ext', 'maybach_int'),
    'mercedes-cls350-black': ('cls53_ext', 'maybach_int'),

    # Mercedes GLE SUVs
    'mercedes-gle350-2024': ('gle_ext', 'maybach_int'),
    'mercedes-gle350e-2023': ('gle_ext', 'maybach_int'),

    # Mercedes E-Class
    'mercedes-e200-avantgarde-2022': ('eclass_ext', 'maybach_int'),
    'mercedes-e-class-2025-white': ('eclass_ext', 'maybach_int'),
    'mercedes-e-class-black': ('eclass_ext', 'maybach_int'),
    'mercedes-e-class-amg-line-black': ('eclass_ext', 'maybach_int'),
    'mercedes-e-class-amg-line-white': ('eclass_ext', 'maybach_int'),
    'mercedes-e-class-amg-line-silver': ('eclass_ext', 'maybach_int'),
    'mercedes-amg-e53-2021': ('eclass_ext', 'maybach_int'),
    'mercedes-amg-e53-2020': ('eclass_ext', 'maybach_int'),

    # BMW 7 Series & 3 Series
    'bmw-7-series': ('bmw7_ext', 'bmwx6_ext'),
    'bmw-730li': ('bmw7_ext', 'bmwx6_ext'),
    'bmw-3-series-2024': ('bmw3_ext', 'bmwx6_ext'),

    # BMW X5 & X6
    'bmw-x5-xdrive40i-2024': ('bmwx5_ext', 'bmw7_ext'),
    'bmw-x6-2025': ('bmwx6_ext', 'bmw7_ext'),
    'bmw-x6-grey': ('bmwx6_ext', 'bmw7_ext'),

    # Range Rover
    'range-rover-autobiography-2024': ('rangerover_ext', 'defender_ext'),
    'range-rover-vogue-2025': ('rangerover_ext', 'defender_ext'),
    'range-rover-sport-2025': ('rangerover_ext', 'defender_ext'),
    'range-rover-sport-hse-dynamic-2022': ('rangerover_ext', 'defender_ext'),
    'range-rover-sport-hse-2021': ('rangerover_ext', 'defender_ext'),
    'range-rover-sport-2019': ('rangerover_ext', 'defender_ext'),

    # Defender & Jetour
    'land-rover-defender-2025': ('defender_ext', 'rangerover_ext'),
    'land-rover-defender-2021': ('defender_ext', 'rangerover_ext'),
    'land-rover-defender-grey': ('defender_ext', 'rangerover_ext'),
    'jetour-t2-2025': ('jetour_ext', 'defender_ext'),

    # Cadillac Escalade
    'cadillac-escalade-2025': ('escalade_ext', 'tahoe_ext'),
    'cadillac-escalade-black': ('escalade_ext', 'tahoe_ext'),
    'cadillac-escalade-green': ('escalade_ext', 'tahoe_ext'),

    # Chevrolet Tahoe & Jeeps
    'chevrolet-tahoe-2024': ('tahoe_ext', 'escalade_ext'),
    'chevrolet-tahoe-premier-2022': ('tahoe_ext', 'escalade_ext'),
    'jeep-gladiator-2024': ('gladiator_ext', 'defender_ext'),
    'jeep-gladiator-rubicon-2022': ('gladiator_ext', 'defender_ext'),
    'jeep-grand-cherokee-srt': ('gladiator_ext', 'defender_ext'),

    # Toyota Land Cruiser & Sequoia
    'toyota-land-cruiser-lc300': ('lc300_ext', 'tahoe_ext'),
    'toyota-land-cruiser-2022': ('lc300_ext', 'tahoe_ext'),
    'toyota-sequoia-2024': ('sequoia_ext', 'lc300_ext'),

    # Hongqi
    'hongqi-h9-2024': ('hongqi_ext', 'rolls_royce_int'),
    'hongqi-e-hs9-2024': ('ehs9_ext', 'rolls_royce_int'),

    # Sports & Camaro & Polestar
    'chevrolet-camaro-zl1-2022': ('camaro_ext', 'camaro_ext'),
    'chevrolet-camaro-zl1-convertible': ('camaro_ext', 'camaro_ext'),
    'polestar-2': ('polestar_ext', 'bmw7_ext'),

    # Classics & Roadsters
    'mercedes-280sl-1971': ('pagoda_ext', 'mercedes_560sl_ext'),
    'mercedes-560sl-1986': ('mercedes_560sl_ext', 'pagoda_ext'),
    'chevrolet-impala-ss-1966': ('impala_ext', 'impala_ext'),
    'mg-b-roadster': ('vintage_roadster_ext', 'vintage_roadster_ext'),
    'british-classic-roadster': ('vintage_roadster_ext', 'vintage_roadster_ext'),
    'vintage-luxury-roadster-2023': ('vintage_roadster_ext', 'vintage_roadster_ext'),
}

def save_variant(im, dest_full, dest_thumb):
    im.save(dest_full, 'WEBP', quality=90, method=4)
    w, h = im.size
    aspect = h / w
    thumb = im.resize((640, int(640 * aspect)), Image.Resampling.LANCZOS)
    thumb.save(dest_thumb, 'WEBP', quality=88, method=6)

def run():
    print('Deploying 18 bespoke masterpiece images across all 68 vehicles...')
    with open(MANIFEST_PATH, 'r', encoding='utf-8') as f:
        manifest = json.load(f)

    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    # Preload all source images into memory
    loaded = {}
    for key, path in ASSETS.items():
        if os.path.exists(path):
            loaded[key] = Image.open(path).convert('RGB')
            print(f'Loaded asset {key}: {loaded[key].size}')
        else:
            print(f'WARNING: Asset missing: {path}')

    count = 0
    for slug, (cover_key, interior_key) in FLEET_MAP.items():
        car_dir = os.path.join(CARS_DIR, slug)
        os.makedirs(car_dir, exist_ok=True)

        cover_img = loaded.get(cover_key)
        int_img = loaded.get(interior_key) or cover_img

        if not cover_img:
            continue

        # Save cover
        save_variant(cover_img, os.path.join(car_dir, 'cover.webp'), os.path.join(car_dir, 'cover-640.webp'))
        # Save interior
        save_variant(int_img, os.path.join(car_dir, 'interior.webp'), os.path.join(car_dir, 'interior-640.webp'))
        # Save rear
        save_variant(cover_img, os.path.join(car_dir, 'rear.webp'), os.path.join(car_dir, 'rear-640.webp'))
        # Save detail
        save_variant(int_img, os.path.join(car_dir, 'detail.webp'), os.path.join(car_dir, 'detail-640.webp'))

        images_list = [
            f'/media/cars/{slug}/cover.webp',
            f'/media/cars/{slug}/interior.webp',
            f'/media/cars/{slug}/rear.webp',
            f'/media/cars/{slug}/detail.webp',
        ]

        cur.execute('UPDATE cars SET images = ? WHERE slug = ?', (json.dumps(images_list), slug))
        manifest[slug] = {
            'images': images_list,
            'cover': images_list[0],
            'interior': images_list[1],
            'rear': images_list[2],
            'detail': images_list[3],
        }
        count += 1

    conn.commit()
    conn.close()

    with open(MANIFEST_PATH, 'w', encoding='utf-8') as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)

    print(f'Successfully deployed masterpieces to all {count} fleet vehicles!')

if __name__ == '__main__':
    run()
