import { HttpError, notFound } from '../lib/http.js';
import { validate } from '../lib/validate.js';

const MESSAGE_SCHEMA = {
  name: { type: 'string', max: 100, required: true },
  phone: { type: 'phone' },
  email: { type: 'email' },
  message: { type: 'string', max: 2000, required: true },
  carId: { type: 'int', min: 1 },
  source: { type: 'enum', values: ['contact', 'car', 'chat'], default: 'contact' },
};

export const serializeMessage = (row) => ({ ...row, isRead: row.isRead === 1 });

export async function createMessage(db, input) {
  const clean = validate(input, MESSAGE_SCHEMA);
  if (!clean.phone && !clean.email) {
    throw new HttpError(400, 'contact_required', 'Please leave a phone number or email', { fields: { phone: 'required' } });
  }
  if (clean.carId && !(await db.get('SELECT 1 FROM cars WHERE id = ?', [clean.carId]))) clean.carId = null;

  const { id } = await db.run(
    'INSERT INTO messages (name, phone, email, message, carId, source) VALUES (?, ?, ?, ?, ?, ?)',
    [clean.name, clean.phone, clean.email, clean.message, clean.carId, clean.source],
  );
  return db.get('SELECT * FROM messages WHERE id = ?', [id]);
}

export function listMessages(db) {
  return db.all(
    `SELECT m.*, c.brand || ' ' || c.model AS carName FROM messages m
     LEFT JOIN cars c ON c.id = m.carId ORDER BY m.createdAt DESC, m.id DESC LIMIT 2000`,
  );
}

async function getMessage(db, id) {
  const row = await db.get('SELECT * FROM messages WHERE id = ?', [id]);
  if (!row) throw notFound('Message');
  return row;
}

export async function setMessageRead(db, id, isRead) {
  await getMessage(db, id);
  await db.run('UPDATE messages SET isRead = ? WHERE id = ?', [isRead ? 1 : 0, id]);
  return getMessage(db, id);
}

export async function deleteMessage(db, id) {
  await getMessage(db, id);
  await db.run('DELETE FROM messages WHERE id = ?', [id]);
}
