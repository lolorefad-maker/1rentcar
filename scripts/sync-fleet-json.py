import sqlite3
import json

conn = sqlite3.connect('showroom.db')
conn.row_factory = sqlite3.Row
cur = conn.cursor()

rows = cur.execute('''
    SELECT slug, brand, model, trim, year, category, color, seats, transmission, fuel, powerHp,
           dailyRate, isFeatured, isActive, taglineEn, taglineAr, descriptionEn, descriptionAr
    FROM cars
    ORDER BY id ASC
''').fetchall()

cars_list = []
for r in rows:
    cars_list.append({
        'slug': r['slug'],
        'brand': r['brand'],
        'model': r['model'],
        'trim': r['trim'] or '',
        'year': r['year'],
        'category': r['category'],
        'color': r['color'] or '',
        'seats': r['seats'],
        'transmission': r['transmission'],
        'fuel': r['fuel'],
        'powerHp': r['powerHp'],
        'dailyRate': r['dailyRate'],
        'isFeatured': bool(r['isFeatured']),
        'isActive': bool(r['isActive']),
        'taglineEn': r['taglineEn'] or '',
        'taglineAr': r['taglineAr'] or '',
        'descriptionEn': r['descriptionEn'] or '',
        'descriptionAr': r['descriptionAr'] or '',
    })

with open('data/fleet.json', 'w', encoding='utf-8') as f:
    json.dump(cars_list, f, indent=2, ensure_ascii=False)

print(f"Successfully synced {len(cars_list)} cars from showroom.db to data/fleet.json!")
print(f"Active cars: {sum(1 for c in cars_list if c['isActive'])}")
print(f"Inactive cars: {sum(1 for c in cars_list if not c['isActive'])}")
conn.close()
