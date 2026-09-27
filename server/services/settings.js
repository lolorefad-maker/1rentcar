import { HttpError } from '../lib/http.js';
import { validate } from '../lib/validate.js';

export const CURRENCIES = ['USD', 'JOD', 'EUR', 'AED', 'SAR'];

/** Every admin-editable business setting, its validation rule and default value. */
const SETTINGS_SCHEMA = {
  businessName: { type: 'string', max: 60, required: true, default: '1 Rent Car' },
  phone: { type: 'string', max: 30, default: '+962 7 8857 7884' },
  whatsapp: { type: 'string', max: 20, default: '962788577884' },
  email: { type: 'string', max: 120, default: 'rcar7625@gmail.com' },
  addressEn: { type: 'string', max: 200, default: 'Amman, Jordan' },
  addressAr: { type: 'string', max: 200, default: 'عمّان، الأردن' },
  hoursEn: { type: 'string', max: 100, default: 'Open 24/7' },
  hoursAr: { type: 'string', max: 100, default: 'على مدار الساعة 24/7' },
  instagramUrl: { type: 'string', max: 300, default: 'https://www.instagram.com/1rentcar.jo/' },
  facebookUrl: { type: 'string', max: 300, default: 'https://www.facebook.com/1rentcar' },
  tiktokUrl: { type: 'string', max: 300, default: 'https://www.tiktok.com/@1.rent.car' },
  currency: { type: 'enum', values: CURRENCIES, required: true, default: 'JOD' },
  airportFee: { type: 'int', min: 0, max: 100000, required: true, default: 50 },
  chauffeurDailyRate: { type: 'int', min: 0, max: 100000, required: true, default: 100 },
  weeklyDiscountPercent: { type: 'int', min: 0, max: 90, required: true, default: 0 },
  monthlyDiscountPercent: { type: 'int', min: 0, max: 90, required: true, default: 0 },
  minimumNoticeHours: { type: 'int', min: 0, max: 720, required: true, default: 2 },
  webhookUrl: { type: 'string', max: 500, default: '' },
};

/** Settings that must never leave the server through the public API. */
const PRIVATE_KEYS = new Set(['webhookUrl']);

const URL_FIELDS = ['instagramUrl', 'facebookUrl', 'tiktokUrl', 'webhookUrl'];

export const DEFAULT_SETTINGS = Object.freeze(
  Object.fromEntries(Object.entries(SETTINGS_SCHEMA).map(([key, rule]) => [key, rule.default])),
);

export async function getSettings(db) {
  const rows = await db.all('SELECT key, value FROM settings');
  const stored = {};
  for (const { key, value } of rows) {
    if (key in SETTINGS_SCHEMA) stored[key] = JSON.parse(value);
  }
  return { ...DEFAULT_SETTINGS, ...stored };
}

export function publicSettings(settings) {
  return Object.fromEntries(Object.entries(settings).filter(([key]) => !PRIVATE_KEYS.has(key)));
}

export async function updateSettings(db, patch) {
  const clean = validate(patch, SETTINGS_SCHEMA, { partial: true });

  if ('whatsapp' in clean) clean.whatsapp = clean.whatsapp.replace(/\D/g, '');
  const badUrls = URL_FIELDS.filter((key) => clean[key] && !/^https?:\/\/\S+$/i.test(clean[key]));
  if (badUrls.length > 0) {
    throw new HttpError(400, 'validation_failed', 'Invalid URL', {
      fields: Object.fromEntries(badUrls.map((key) => [key, 'invalid'])),
    });
  }

  for (const [key, value] of Object.entries(clean)) {
    await db.run(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      [key, JSON.stringify(value)],
    );
  }
  return getSettings(db);
}

/** Internal (non-schema) values such as the admin password hash. */
export async function getInternal(db, key) {
  const row = await db.get('SELECT value FROM settings WHERE key = ?', [key]);
  return row ? JSON.parse(row.value) : null;
}

export async function setInternal(db, key, value) {
  await db.run(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    [key, JSON.stringify(value)],
  );
}
