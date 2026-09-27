import { notFound } from '../lib/http.js';
import { validate } from '../lib/validate.js';

const CUSTOMER_SCHEMA = {
  name: { type: 'string', max: 100 },
  email: { type: 'email' },
  notes: { type: 'string', max: 2000 },
  isBlocked: { type: 'bool' },
};

export const phoneKeyOf = (phone) => String(phone ?? '').replace(/\D/g, '');

export const serializeCustomer = (row) => ({ ...row, isBlocked: row.isBlocked === 1 });

/** Called whenever a booking is made, so the CRM always mirrors real customers. */
export async function rememberCustomer(db, { customerName, phone, email }) {
  const phoneKey = phoneKeyOf(phone);
  if (!phoneKey) return;
  await db.run(
    `INSERT INTO customers (phoneKey, name, phone, email) VALUES (?, ?, ?, ?)
     ON CONFLICT(phoneKey) DO UPDATE SET
       name = excluded.name,
       phone = excluded.phone,
       email = COALESCE(NULLIF(excluded.email, ''), customers.email),
       updatedAt = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
    [phoneKey, customerName, phone, email ?? ''],
  );
}

export async function isBlocked(db, phone) {
  const phoneKey = phoneKeyOf(phone);
  if (!phoneKey) return false;
  const row = await db.get('SELECT isBlocked FROM customers WHERE phoneKey = ?', [phoneKey]);
  return row?.isBlocked === 1;
}

/** Customer list with their booking history rolled up. */
export function listCustomers(db) {
  return db.all(
    `SELECT c.*,
            COUNT(b.id) AS bookings,
            COALESCE(SUM(CASE WHEN b.status IN ('confirmed', 'completed') THEN b.totalPrice ELSE 0 END), 0) AS spent,
            MAX(b.createdAt) AS lastBookingAt
     FROM customers c
     LEFT JOIN bookings b ON REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(b.phone, ' ', ''), '-', ''), '(', ''), ')', ''), '+', '') = c.phoneKey
     GROUP BY c.id
     ORDER BY spent DESC, bookings DESC, c.name`,
  );
}

export async function getCustomer(db, id) {
  const row = await db.get('SELECT * FROM customers WHERE id = ?', [id]);
  if (!row) throw notFound('Customer');
  const bookings = await db.all(
    `SELECT id, reference, carName, pickupAt, returnAt, totalPrice, currency, status, createdAt
     FROM bookings
     WHERE REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '(', ''), ')', ''), '+', '') = ?
     ORDER BY createdAt DESC LIMIT 100`,
    [row.phoneKey],
  );
  return { customer: serializeCustomer(row), bookings };
}

export async function updateCustomer(db, id, input) {
  const clean = validate(input, CUSTOMER_SCHEMA, { partial: true });
  if ('isBlocked' in clean) clean.isBlocked = clean.isBlocked ? 1 : 0;
  const columns = Object.keys(clean);
  if (columns.length > 0) {
    await db.run(
      `UPDATE customers SET ${columns.map((c) => `${c} = ?`).join(', ')},
       updatedAt = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`,
      [...columns.map((c) => clean[c]), id],
    );
  }
  const { customer } = await getCustomer(db, id);
  return customer;
}

export async function deleteCustomer(db, id) {
  await getCustomer(db, id);
  await db.run('DELETE FROM customers WHERE id = ?', [id]);
}
