import { PAYMENT_KINDS, PAYMENT_METHODS } from '../db/schema.js';
import { notFound } from '../lib/http.js';
import { validate } from '../lib/validate.js';

const PAYMENT_SCHEMA = {
  amount: { type: 'int', min: 1, max: 100_000_000, required: true },
  kind: { type: 'enum', values: PAYMENT_KINDS, default: 'payment' },
  method: { type: 'enum', values: PAYMENT_METHODS, default: 'cash' },
  paidOn: { type: 'date', required: true },
  note: { type: 'string', max: 300 },
};

/** Refunds count against the collected total. */
const signed = (row) => (row.kind === 'refund' ? -row.amount : row.amount);

export const paidTotal = (payments) => payments.reduce((sum, row) => sum + signed(row), 0);

export function listPayments(db, bookingId) {
  return db.all('SELECT * FROM payments WHERE bookingId = ? ORDER BY paidOn, id', [bookingId]);
}

/** { bookingId: paidAmount } for a whole list view in one query. */
export async function paidByBooking(db) {
  const rows = await db.all(
    `SELECT bookingId, SUM(CASE WHEN kind = 'refund' THEN -amount ELSE amount END) AS paid
     FROM payments GROUP BY bookingId`,
  );
  return new Map(rows.map((row) => [row.bookingId, row.paid]));
}

export async function addPayment(db, bookingId, input) {
  if (!(await db.get('SELECT 1 FROM bookings WHERE id = ?', [bookingId]))) throw notFound('Booking');
  const clean = validate(input, PAYMENT_SCHEMA);
  const { id } = await db.run(
    'INSERT INTO payments (bookingId, amount, kind, method, paidOn, note) VALUES (?, ?, ?, ?, ?, ?)',
    [bookingId, clean.amount, clean.kind, clean.method, clean.paidOn, clean.note],
  );
  return db.get('SELECT * FROM payments WHERE id = ?', [id]);
}

export async function deletePayment(db, id) {
  const row = await db.get('SELECT * FROM payments WHERE id = ?', [id]);
  if (!row) throw notFound('Payment');
  await db.run('DELETE FROM payments WHERE id = ?', [id]);
  return row;
}
