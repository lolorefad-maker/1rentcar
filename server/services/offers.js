import { HttpError, notFound } from '../lib/http.js';
import { validate } from '../lib/validate.js';

const CODE_RE = /^[A-Z0-9_-]{3,30}$/;

const OFFER_SCHEMA = {
  code: { type: 'string', max: 30, required: true },
  discountPercent: { type: 'int', min: 1, max: 90, required: true },
  descriptionEn: { type: 'string', max: 300 },
  descriptionAr: { type: 'string', max: 300 },
  minDays: { type: 'int', min: 1, max: 365, default: 1 },
  validUntil: { type: 'date' },
  isActive: { type: 'bool', default: true },
  isPublic: { type: 'bool', default: true },
};

function cleanOfferInput(input, partial) {
  const clean = validate(input, OFFER_SCHEMA, { partial });
  if ('code' in clean) {
    clean.code = clean.code.toUpperCase();
    if (!CODE_RE.test(clean.code)) {
      throw new HttpError(400, 'validation_failed', 'Use 3–30 letters, digits, - or _', { fields: { code: 'invalid' } });
    }
  }
  for (const flag of ['isActive', 'isPublic']) {
    if (flag in clean) clean[flag] = clean[flag] ? 1 : 0;
  }
  return clean;
}

const isUniqueViolation = (err) => err?.code === 'SQLITE_CONSTRAINT' && /UNIQUE/i.test(err.message);

export function serializeOffer(row) {
  return { ...row, isActive: row.isActive === 1, isPublic: row.isPublic === 1 };
}

export function listOffers(db) {
  return db.all('SELECT * FROM offers ORDER BY isActive DESC, createdAt DESC');
}

/** Offers customers may see: active, public and not expired. */
export function listPublicOffers(db, today) {
  return db.all(
    `SELECT code, discountPercent, descriptionEn, descriptionAr, minDays, validUntil FROM offers
     WHERE isActive = 1 AND isPublic = 1 AND (validUntil IS NULL OR validUntil >= ?)
     ORDER BY discountPercent DESC`,
    [today],
  );
}

async function getOffer(db, id) {
  const row = await db.get('SELECT * FROM offers WHERE id = ?', [id]);
  if (!row) throw notFound('Offer');
  return row;
}

export async function createOffer(db, input) {
  const clean = cleanOfferInput(input, false);
  const columns = Object.keys(clean);
  try {
    const { id } = await db.run(
      `INSERT INTO offers (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
      columns.map((column) => clean[column]),
    );
    return getOffer(db, id);
  } catch (err) {
    if (isUniqueViolation(err)) throw new HttpError(409, 'offer_code_taken', 'This code already exists', { fields: { code: 'taken' } });
    throw err;
  }
}

export async function updateOffer(db, id, input) {
  await getOffer(db, id);
  const clean = cleanOfferInput(input, true);
  const columns = Object.keys(clean);
  if (columns.length > 0) {
    try {
      await db.run(
        `UPDATE offers SET ${columns.map((column) => `${column} = ?`).join(', ')} WHERE id = ?`,
        [...columns.map((column) => clean[column]), id],
      );
    } catch (err) {
      if (isUniqueViolation(err)) throw new HttpError(409, 'offer_code_taken', 'This code already exists', { fields: { code: 'taken' } });
      throw err;
    }
  }
  return getOffer(db, id);
}

export async function deleteOffer(db, id) {
  await getOffer(db, id);
  await db.run('DELETE FROM offers WHERE id = ?', [id]);
}
