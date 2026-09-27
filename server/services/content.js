/** Website content the owner can edit: customer reviews and the FAQ list. */
import { notFound } from '../lib/http.js';
import { validate } from '../lib/validate.js';

const TESTIMONIAL_SCHEMA = {
  nameEn: { type: 'string', max: 80 },
  nameAr: { type: 'string', max: 80 },
  roleEn: { type: 'string', max: 80 },
  roleAr: { type: 'string', max: 80 },
  textEn: { type: 'string', max: 800 },
  textAr: { type: 'string', max: 800 },
  rating: { type: 'int', min: 1, max: 5, default: 5 },
  isActive: { type: 'bool', default: true },
  sortOrder: { type: 'int', min: -10_000, max: 10_000, default: 0 },
};

const FAQ_SCHEMA = {
  questionEn: { type: 'string', max: 200 },
  questionAr: { type: 'string', max: 200 },
  answerEn: { type: 'string', max: 1500 },
  answerAr: { type: 'string', max: 1500 },
  isActive: { type: 'bool', default: true },
  sortOrder: { type: 'int', min: -10_000, max: 10_000, default: 0 },
};

const TABLES = {
  testimonials: { table: 'testimonials', schema: TESTIMONIAL_SCHEMA, label: 'Review' },
  faqs: { table: 'faqs', schema: FAQ_SCHEMA, label: 'FAQ' },
};

export const serializeContent = (row) => ({ ...row, isActive: row.isActive === 1 });

const definition = (kind) => {
  const found = TABLES[kind];
  if (!found) throw notFound('Content');
  return found;
};

export function listContent(db, kind, { activeOnly = false } = {}) {
  const { table } = definition(kind);
  return db.all(
    `SELECT * FROM ${table} ${activeOnly ? 'WHERE isActive = 1' : ''} ORDER BY sortOrder, id`,
  );
}

async function getItem(db, kind, id) {
  const { table, label } = definition(kind);
  const row = await db.get(`SELECT * FROM ${table} WHERE id = ?`, [id]);
  if (!row) throw notFound(label);
  return row;
}

const toRow = (clean) => ({ ...clean, ...('isActive' in clean ? { isActive: clean.isActive ? 1 : 0 } : {}) });

export async function createContent(db, kind, input) {
  const { table, schema } = definition(kind);
  const row = toRow(validate(input, schema));
  const columns = Object.keys(row);
  const { id } = await db.run(
    `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
    columns.map((c) => row[c]),
  );
  return getItem(db, kind, id);
}

export async function updateContent(db, kind, id, input) {
  const { table, schema } = definition(kind);
  await getItem(db, kind, id);
  const row = toRow(validate(input, schema, { partial: true }));
  const columns = Object.keys(row);
  if (columns.length > 0) {
    await db.run(`UPDATE ${table} SET ${columns.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`, [
      ...columns.map((c) => row[c]),
      id,
    ]);
  }
  return getItem(db, kind, id);
}

export async function deleteContent(db, kind, id) {
  const { table } = definition(kind);
  await getItem(db, kind, id);
  await db.run(`DELETE FROM ${table} WHERE id = ?`, [id]);
}
