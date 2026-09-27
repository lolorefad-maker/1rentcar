import { EXPENSE_CATEGORIES } from '../db/schema.js';
import { HttpError, notFound } from '../lib/http.js';
import { validate } from '../lib/validate.js';

const ALERT_WINDOW_DAYS = 30;
const SERVICE_KM_WARNING = 500;

const BLACKOUT_SCHEMA = {
  carId: { type: 'int', min: 1, required: true },
  startAt: { type: 'datetime', required: true },
  endAt: { type: 'datetime', required: true },
  reason: { type: 'string', max: 200 },
};

const EXPENSE_SCHEMA = {
  carId: { type: 'int', min: 1 },
  category: { type: 'enum', values: EXPENSE_CATEGORIES, default: 'other' },
  amount: { type: 'int', min: 0, max: 100_000_000, required: true },
  spentOn: { type: 'date', required: true },
  note: { type: 'string', max: 300 },
};

const CAR_JOIN = `LEFT JOIN cars c ON c.id = x.carId`;
const CAR_FIELDS = `c.slug AS carSlug, TRIM(COALESCE(c.brand, '') || ' ' || COALESCE(c.model, '')) AS carName`;

const addDays = (isoDate, days) => {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

// --- Blackout dates (maintenance, owner use, events) -----------------------------

export function listBlackouts(db, { from, to } = {}) {
  if (from && to) {
    return db.all(
      `SELECT x.*, ${CAR_FIELDS} FROM blackouts x ${CAR_JOIN}
       WHERE x.startAt < ? AND x.endAt > ? ORDER BY x.startAt`,
      [to, from],
    );
  }
  return db.all(`SELECT x.*, ${CAR_FIELDS} FROM blackouts x ${CAR_JOIN} ORDER BY x.startAt DESC LIMIT 500`);
}

async function getBlackout(db, id) {
  const row = await db.get(`SELECT x.*, ${CAR_FIELDS} FROM blackouts x ${CAR_JOIN} WHERE x.id = ?`, [id]);
  if (!row) throw notFound('Blocked period');
  return row;
}

export async function createBlackout(db, input) {
  const clean = validate(input, BLACKOUT_SCHEMA);
  if (clean.endAt <= clean.startAt) {
    throw new HttpError(400, 'invalid_dates', 'The end time must be after the start', { fields: { endAt: 'invalid' } });
  }
  if (!(await db.get('SELECT 1 FROM cars WHERE id = ?', [clean.carId]))) {
    throw new HttpError(404, 'car_not_found', 'Vehicle not found');
  }
  // A blocked period must never swallow a live booking.
  const clash = await db.get(
    `SELECT reference FROM bookings
     WHERE carId = ? AND status IN ('pending', 'confirmed') AND pickupAt < ? AND returnAt > ? LIMIT 1`,
    [clean.carId, clean.endAt, clean.startAt],
  );
  if (clash) {
    throw new HttpError(409, 'blackout_conflicts_booking', `Overlaps booking ${clash.reference}`, { reference: clash.reference });
  }
  const { id } = await db.run('INSERT INTO blackouts (carId, startAt, endAt, reason) VALUES (?, ?, ?, ?)', [
    clean.carId,
    clean.startAt,
    clean.endAt,
    clean.reason,
  ]);
  return getBlackout(db, id);
}

export async function deleteBlackout(db, id) {
  await getBlackout(db, id);
  await db.run('DELETE FROM blackouts WHERE id = ?', [id]);
}

// --- Running costs ----------------------------------------------------------------

export function listExpenses(db, { from, to, carId } = {}) {
  const where = [];
  const params = [];
  if (from) {
    where.push('x.spentOn >= ?');
    params.push(from);
  }
  if (to) {
    where.push('x.spentOn <= ?');
    params.push(to);
  }
  if (carId) {
    where.push('x.carId = ?');
    params.push(carId);
  }
  return db.all(
    `SELECT x.*, ${CAR_FIELDS} FROM expenses x ${CAR_JOIN}
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY x.spentOn DESC, x.id DESC LIMIT 1000`,
    params,
  );
}

async function getExpense(db, id) {
  const row = await db.get(`SELECT x.*, ${CAR_FIELDS} FROM expenses x ${CAR_JOIN} WHERE x.id = ?`, [id]);
  if (!row) throw notFound('Expense');
  return row;
}

export async function createExpense(db, input, currency) {
  const clean = validate(input, EXPENSE_SCHEMA);
  const { id } = await db.run(
    'INSERT INTO expenses (carId, category, amount, currency, spentOn, note) VALUES (?, ?, ?, ?, ?, ?)',
    [clean.carId, clean.category, clean.amount, currency, clean.spentOn, clean.note],
  );
  return getExpense(db, id);
}

export async function updateExpense(db, id, input) {
  await getExpense(db, id);
  const clean = validate(input, EXPENSE_SCHEMA, { partial: true });
  const columns = Object.keys(clean);
  if (columns.length > 0) {
    await db.run(`UPDATE expenses SET ${columns.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`, [
      ...columns.map((c) => clean[c]),
      id,
    ]);
  }
  return getExpense(db, id);
}

export async function deleteExpense(db, id) {
  await getExpense(db, id);
  await db.run('DELETE FROM expenses WHERE id = ?', [id]);
}

// --- Paperwork & service reminders --------------------------------------------------

/**
 * Cars needing attention: service due by date or mileage, insurance or licence
 * about to expire. `severity` is "due" once the date has passed.
 */
export async function fleetAlerts(db, today) {
  const soon = addDays(today, ALERT_WINDOW_DAYS);
  const cars = await db.all(
    `SELECT id, slug, brand, model, trim, plateNumber, odometerKm, serviceDueKm, serviceDueAt, insuranceExpiry, licenceExpiry
     FROM cars ORDER BY brand, model`,
  );
  const alerts = [];

  const dateAlert = (car, type, date) => {
    if (!date || date > soon) return;
    alerts.push({
      carId: car.id,
      carName: [car.brand, car.model, car.trim].filter(Boolean).join(' '),
      plateNumber: car.plateNumber,
      type,
      date,
      severity: date < today ? 'due' : 'soon',
    });
  };

  for (const car of cars) {
    dateAlert(car, 'service', car.serviceDueAt);
    dateAlert(car, 'insurance', car.insuranceExpiry);
    dateAlert(car, 'licence', car.licenceExpiry);
    if (car.serviceDueKm && car.odometerKm && car.odometerKm >= car.serviceDueKm - SERVICE_KM_WARNING) {
      alerts.push({
        carId: car.id,
        carName: [car.brand, car.model, car.trim].filter(Boolean).join(' '),
        plateNumber: car.plateNumber,
        type: 'serviceKm',
        odometerKm: car.odometerKm,
        serviceDueKm: car.serviceDueKm,
        severity: car.odometerKm >= car.serviceDueKm ? 'due' : 'soon',
      });
    }
  }

  return alerts.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'due' ? -1 : 1));
}
