import { notFound } from '../lib/http.js';
import { validate } from '../lib/validate.js';

const DRIVER_SCHEMA = {
  name: { type: 'string', max: 100, required: true },
  phone: { type: 'phone' },
  licenceNumber: { type: 'string', max: 60 },
  dailyRate: { type: 'int', min: 0, max: 1_000_000, default: 0 },
  notes: { type: 'string', max: 500 },
  isActive: { type: 'bool', default: true },
};

export const serializeDriver = (row) => ({ ...row, isActive: row.isActive === 1 });

export function listDrivers(db) {
  return db.all(
    `SELECT d.*, (SELECT COUNT(*) FROM bookings b WHERE b.driverId = d.id AND b.status IN ('pending', 'confirmed')) AS activeBookings
     FROM drivers d ORDER BY d.isActive DESC, d.name`,
  );
}

export async function getDriver(db, id) {
  const row = await db.get('SELECT * FROM drivers WHERE id = ?', [id]);
  if (!row) throw notFound('Driver');
  return row;
}

const toRow = (clean) => ({ ...clean, ...('isActive' in clean ? { isActive: clean.isActive ? 1 : 0 } : {}) });

export async function createDriver(db, input) {
  const row = toRow(validate(input, DRIVER_SCHEMA));
  const columns = Object.keys(row);
  const { id } = await db.run(
    `INSERT INTO drivers (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
    columns.map((c) => row[c]),
  );
  return getDriver(db, id);
}

export async function updateDriver(db, id, input) {
  await getDriver(db, id);
  const row = toRow(validate(input, DRIVER_SCHEMA, { partial: true }));
  const columns = Object.keys(row);
  if (columns.length > 0) {
    await db.run(`UPDATE drivers SET ${columns.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`, [
      ...columns.map((c) => row[c]),
      id,
    ]);
  }
  return getDriver(db, id);
}

/** Deleting a driver keeps history: assigned bookings simply lose the assignment. */
export async function deleteDriver(db, id) {
  await getDriver(db, id);
  await db.run('UPDATE bookings SET driverId = NULL WHERE driverId = ?', [id]);
  await db.run('DELETE FROM drivers WHERE id = ?', [id]);
}
