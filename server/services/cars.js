import { CAR_STATUSES, CATEGORIES, FUELS, TRANSMISSIONS } from '../db/schema.js';
import { HttpError, notFound } from '../lib/http.js';
import { validate } from '../lib/validate.js';

const IMAGE_PATH_RE = /^\/(media|uploads|whatsapp_images)\/[^?#\\]+$/;
const NOW_SQL = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";

const CAR_SCHEMA = {
  brand: { type: 'string', max: 60, required: true },
  model: { type: 'string', max: 80, required: true },
  trim: { type: 'string', max: 60 },
  year: { type: 'int', min: 1900, max: 2100 },
  category: { type: 'enum', values: CATEGORIES, required: true },
  color: { type: 'string', max: 40 },
  seats: { type: 'int', min: 1, max: 60, required: true },
  transmission: { type: 'enum', values: TRANSMISSIONS },
  fuel: { type: 'enum', values: FUELS, required: true },
  powerHp: { type: 'int', min: 1, max: 5000 },
  dailyRate: { type: 'int', min: 1, max: 10_000_000, required: true },
  deposit: { type: 'int', min: 0, max: 100_000_000, default: 0 },
  taglineEn: { type: 'string', max: 120 },
  taglineAr: { type: 'string', max: 120 },
  descriptionEn: { type: 'string', max: 3000 },
  descriptionAr: { type: 'string', max: 3000 },
  images: { type: 'stringList', maxItems: 24, maxItem: 400, default: [] },
  status: { type: 'enum', values: CAR_STATUSES, default: 'available' },
  isActive: { type: 'bool', default: true },
  isFeatured: { type: 'bool', default: false },
  sortOrder: { type: 'int', min: -100_000, max: 100_000, default: 0 },
  // Inventory — internal only, never sent to the website.
  plateNumber: { type: 'string', max: 20 },
  odometerKm: { type: 'int', min: 0, max: 5_000_000 },
  serviceDueKm: { type: 'int', min: 0, max: 5_000_000 },
  serviceDueAt: { type: 'date' },
  insuranceExpiry: { type: 'date' },
  licenceExpiry: { type: 'date' },
};

/** Inventory columns are stripped from public responses. */
const PRIVATE_FIELDS = ['plateNumber', 'odometerKm', 'serviceDueKm', 'serviceDueAt', 'insuranceExpiry', 'licenceExpiry'];

export const carDisplayName = (car) => [car.brand, car.model, car.trim].filter(Boolean).join(' ');

function parseImages(json) {
  try {
    const list = JSON.parse(json);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function serializeCar(row, media, { includePrivate = false } = {}) {
  const { images, isActive, isFeatured, ...rest } = row;
  if (!includePrivate) for (const field of PRIVATE_FIELDS) delete rest[field];
  return {
    ...rest,
    name: carDisplayName(row),
    images: media.withThumbs(parseImages(images)),
    isActive: isActive === 1,
    isFeatured: isFeatured === 1,
  };
}

function cleanCarInput(input, partial) {
  const clean = validate(input, CAR_SCHEMA, { partial });
  if (clean.images?.some((src) => !IMAGE_PATH_RE.test(src) || src.includes('..'))) {
    throw new HttpError(400, 'validation_failed', 'Invalid image path', { fields: { images: 'invalid' } });
  }
  return clean;
}

/** Converts validated input into column values (JSON / 0-1 flags). Keys are schema-whitelisted. */
function toRow(clean) {
  const row = { ...clean };
  if ('images' in row) row.images = JSON.stringify(row.images);
  if ('isActive' in row) row.isActive = row.isActive ? 1 : 0;
  if ('isFeatured' in row) row.isFeatured = row.isFeatured ? 1 : 0;
  return row;
}

function slugify(text) {
  const slug = text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'vehicle';
}

async function uniqueSlug(db, base) {
  let slug = base;
  for (let n = 2; await db.get('SELECT 1 FROM cars WHERE slug = ?', [slug]); n += 1) slug = `${base}-${n}`;
  return slug;
}

export function listCars(db, { includeInactive = false } = {}) {
  return db.all(
    `SELECT * FROM cars ${includeInactive ? '' : 'WHERE isActive = 1'}
     ORDER BY isFeatured DESC, sortOrder ASC, dailyRate DESC, id ASC`,
  );
}

export async function getCar(db, idOrSlug, { includeInactive = false } = {}) {
  const byId = /^\d+$/.test(String(idOrSlug));
  const row = await db.get(`SELECT * FROM cars WHERE ${byId ? 'id' : 'slug'} = ?`, [byId ? Number(idOrSlug) : String(idOrSlug)]);
  if (!row || (!includeInactive && row.isActive !== 1)) throw notFound('Vehicle');
  return row;
}

export async function createCar(db, input) {
  const clean = cleanCarInput(input, false);
  const slug = await uniqueSlug(db, slugify([clean.brand, clean.model, clean.trim, clean.year].filter(Boolean).join(' ')));
  const row = toRow({ ...clean, slug });
  const columns = Object.keys(row);
  const { id } = await db.run(
    `INSERT INTO cars (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
    columns.map((column) => row[column]),
  );
  return getCar(db, id, { includeInactive: true });
}

export async function updateCar(db, id, input) {
  await getCar(db, id, { includeInactive: true });
  const row = toRow(cleanCarInput(input, true));
  const columns = Object.keys(row);
  if (columns.length > 0) {
    await db.run(
      `UPDATE cars SET ${columns.map((column) => `${column} = ?`).join(', ')}, updatedAt = ${NOW_SQL} WHERE id = ?`,
      [...columns.map((column) => row[column]), id],
    );
  }
  return getCar(db, id, { includeInactive: true });
}

/** Deleting is blocked while the car still has upcoming pending/confirmed bookings. */
export async function deleteCar(db, id, now) {
  await getCar(db, id, { includeInactive: true });
  const { count } = await db.get(
    "SELECT COUNT(*) AS count FROM bookings WHERE carId = ? AND status IN ('pending', 'confirmed') AND returnAt >= ?",
    [id, now],
  );
  if (count > 0) {
    throw new HttpError(409, 'car_has_active_bookings', 'This vehicle has upcoming bookings', { count });
  }
  await db.run('DELETE FROM cars WHERE id = ?', [id]);
}
