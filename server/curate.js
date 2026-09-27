import sqlite3 from 'sqlite3';

export const CURATED_PRICES = {
  'rolls-royce-ghost-2021': 500,
  'rolls-royce-ghost-two-tone': 500,
  'mercedes-maybach-s580': 450,
  'brabus-g800-2021': 450,
  'mercedes-amg-g63-2024': 450,
  'mercedes-maybach-s560-2018': 400,
  'mercedes-amg-g63-2022': 400,
  'range-rover-autobiography-2024': 380,
  'range-rover-vogue-2025': 350,
  'mercedes-s-class-2025-grey': 350,
  'mercedes-s-class-2025-black': 350,
  'bmw-7-series': 350,
  'range-rover-sport-2025': 320,
  'mercedes-amg-sl43-2024': 300,
  'bmw-730li': 280,
  'bmw-x6-2025': 280,
  'bmw-x5-xdrive40i-2024': 260,
  'toyota-land-cruiser-lc300': 250,
  'land-rover-defender-2025': 250,
  'mercedes-amg-cls53': 240,
  'land-rover-defender-2021': 220,
  'toyota-land-cruiser-2022': 220,
  'mercedes-gle350-2024': 220,
  'mercedes-gle350e-2023': 220,
  'mercedes-cls350-black': 200,
  'mercedes-e200-avantgarde-2022': 130,
  'bmw-3-series-2024': 120,
};

export async function syncCuratedFleet(db) {
  await db.run('UPDATE cars SET isActive = 0');
  for (const [slug, price] of Object.entries(CURATED_PRICES)) {
    await db.run(
      'UPDATE cars SET isActive = 1, dailyRate = ?, status = ? WHERE slug = ?',
      [price, 'available', slug]
    );
  }
  await db.run(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    ['currency', JSON.stringify('JOD')]
  );
}
