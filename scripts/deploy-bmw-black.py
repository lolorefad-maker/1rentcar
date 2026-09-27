import os, sqlite3, json
from PIL import Image

BRAIN = r'C:\Users\LENOVO\.gemini\antigravity\brain\8a218dd6-a490-4fb9-96b2-0ba4caf0b576'
X5_IMG = os.path.join(BRAIN, 'bmw_x5_black_showroom_1790539633758.jpg')
B3_IMG = os.path.join(BRAIN, 'bmw_3series_black_showroom_1790539655540.jpg')

targets = [
    ('bmw-x5-xdrive40i-2024', X5_IMG),
    ('bmw-3-series-2024', B3_IMG),
]

for slug, src_path in targets:
    dest_dir = os.path.join(r'c:\Users\LENOVO\Desktop\threejsproject\public\media\cars', slug)
    os.makedirs(dest_dir, exist_ok=True)
    
    with Image.open(src_path) as im:
        im = im.convert('RGB')
        im.save(os.path.join(dest_dir, 'cover.webp'), 'WEBP', quality=88)
        w, h = im.size
        ratio = 1200 / float(w)
        im_1200 = im.resize((1200, int(h * ratio)), Image.Resampling.LANCZOS)
        im_1200.save(os.path.join(dest_dir, 'cover-1200.webp'), 'WEBP', quality=85)
        ratio_640 = 640 / float(w)
        im_640 = im.resize((640, int(h * ratio_640)), Image.Resampling.LANCZOS)
        im_640.save(os.path.join(dest_dir, 'cover-640.webp'), 'WEBP', quality=82)
    print(f'Processed WebP covers for {slug}')

conn = sqlite3.connect('showroom.db')
cur = conn.cursor()
cur.execute('UPDATE cars SET color = ? WHERE slug = ?', ('Black', 'bmw-3-series-2024'))
conn.commit()
conn.close()
print('Updated BMW 3 Series color to Black in showroom.db')

with open('data/fleet.json', 'r', encoding='utf-8') as f:
    fleet = json.load(f)
for c in fleet:
    if c['slug'] == 'bmw-3-series-2024':
        c['color'] = 'Black'
with open('data/fleet.json', 'w', encoding='utf-8') as f:
    json.dump(fleet, f, indent=2, ensure_ascii=False)
print('Updated data/fleet.json')
