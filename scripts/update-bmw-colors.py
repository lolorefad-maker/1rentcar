import sqlite3, json

conn = sqlite3.connect('showroom.db')
cur = conn.cursor()
cur.execute('UPDATE cars SET color = ? WHERE slug = ?', ('Black', 'bmw-730li'))
cur.execute('UPDATE cars SET color = ? WHERE slug = ?', ('Black', 'bmw-3-series-2024'))
conn.commit()
rows = cur.execute('SELECT slug, color FROM cars WHERE slug IN (?, ?)', ('bmw-730li', 'bmw-3-series-2024')).fetchall()
print('DB updated:', rows)
conn.close()

with open('data/fleet.json', 'r', encoding='utf-8') as f:
    fleet = json.load(f)
for c in fleet:
    if c['slug'] in ['bmw-730li', 'bmw-3-series-2024']:
        c['color'] = 'Black'
with open('data/fleet.json', 'w', encoding='utf-8') as f:
    json.dump(fleet, f, indent=2, ensure_ascii=False)
print('fleet.json updated!')
