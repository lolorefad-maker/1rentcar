import os
import json
import sqlite3
from PIL import Image

BRAIN_DIR = r'C:\Users\LENOVO\.gemini\antigravity\brain\8a218dd6-a490-4fb9-96b2-0ba4caf0b576'
CARS_DIR = r'c:\Users\LENOVO\Desktop\threejsproject\public\media\cars'
MANIFEST_PATH = r'c:\Users\LENOVO\Desktop\threejsproject\data\media-manifest.json'
DB_PATH = r'c:\Users\LENOVO\Desktop\threejsproject\showroom.db'

DEPLOYMENTS = [
    {
        'src': os.path.join(BRAIN_DIR, 'rolls_royce_ghost_1789416405137.jpg'),
        'targets': [
            ('rolls-royce-ghost-2021', 'cover'),
            ('rolls-royce-ghost-two-tone', 'cover'),
        ]
    },
    {
        'src': os.path.join(BRAIN_DIR, 'rr_ghost_interior_1789416437591.jpg'),
        'targets': [
            ('rolls-royce-ghost-2021', 'interior'),
            ('rolls-royce-ghost-two-tone', 'interior'),
        ]
    },
    {
        'src': os.path.join(BRAIN_DIR, 'maybach_s580_ext_1789416456084.jpg'),
        'targets': [
            ('mercedes-maybach-s580', 'cover'),
            ('mercedes-maybach-s560-2018', 'cover'),
        ]
    },
    {
        'src': os.path.join(BRAIN_DIR, 'maybach_s580_int_1789416472705.jpg'),
        'targets': [
            ('mercedes-maybach-s580', 'interior'),
            ('mercedes-maybach-s560-2018', 'interior'),
        ]
    },
    {
        'src': os.path.join(BRAIN_DIR, 'amg_g63_ext_1789416494172.jpg'),
        'targets': [
            ('mercedes-amg-g63-2024', 'cover'),
            ('mercedes-amg-g63-2022', 'cover'),
            ('mercedes-amg-g63-2021', 'cover'),
        ]
    },
    {
        'src': os.path.join(BRAIN_DIR, 'brabus_g800_ext_1789416532415.jpg'),
        'targets': [
            ('brabus-g800-2021', 'cover'),
            ('brabus-g700-2021', 'cover'),
            ('brabus-800-cabriolet-2021', 'cover'),
        ]
    }
]

def save_webp_variants(im, target_dir, role):
    full_path = os.path.join(target_dir, f'{role}.webp')
    thumb_path = os.path.join(target_dir, f'{role}-640.webp')
    im.save(full_path, 'WEBP', quality=90, method=6)
    w, h = im.size
    aspect = h / w
    thumb = im.resize((640, int(640 * aspect)), Image.Resampling.LANCZOS)
    thumb.save(thumb_path, 'WEBP', quality=85, method=6)
    print(f'  -> Saved {full_path}')

def run():
    print('Deploying AI images...')
    for item in DEPLOYMENTS:
        src = item['src']
        if not os.path.exists(src):
            print(f'Warning: source file {src} not found!')
            continue
        with Image.open(src) as im:
            im = im.convert('RGB')
            for slug, role in item['targets']:
                target_dir = os.path.join(CARS_DIR, slug)
                os.makedirs(target_dir, exist_ok=True)
                print(f'Updating {slug} [{role}] from {os.path.basename(src)}')
                save_webp_variants(im, target_dir, role)

    with open(MANIFEST_PATH, 'r', encoding='utf-8') as f:
        manifest = json.load(f)

    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    for item in DEPLOYMENTS:
        for slug, role in item['targets']:
            rel_path = f'/media/cars/{slug}/{role}.webp'
            if slug in manifest:
                manifest[slug][role] = rel_path
            cur.execute('SELECT images FROM cars WHERE slug = ?', (slug,))
            row = cur.fetchone()
            if row and row[0]:
                try:
                    imgs = json.loads(row[0])
                    if role == 'cover':
                        if rel_path in imgs:
                            imgs.remove(rel_path)
                        imgs.insert(0, rel_path)
                    else:
                        if rel_path not in imgs:
                            imgs.append(rel_path)
                    cur.execute('UPDATE cars SET images = ? WHERE slug = ?', (json.dumps(imgs), slug))
                except Exception as e:
                    print(f'Error updating images for {slug}: {e}')

    conn.commit()
    conn.close()

    with open(MANIFEST_PATH, 'w', encoding='utf-8') as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)

    print('Deploy finished successfully!')

if __name__ == '__main__':
    run()
