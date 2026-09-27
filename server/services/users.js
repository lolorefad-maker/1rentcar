import { USER_ROLES } from '../db/schema.js';
import { hashPassword } from '../lib/crypto.js';
import { HttpError, notFound } from '../lib/http.js';
import { validate } from '../lib/validate.js';

const USERNAME_RE = /^[a-z0-9._-]{3,30}$/i;
const MIN_PASSWORD_LENGTH = 8;

const USER_SCHEMA = {
  username: { type: 'string', max: 30, required: true },
  name: { type: 'string', max: 80 },
  role: { type: 'enum', values: USER_ROLES, default: 'staff' },
  isActive: { type: 'bool', default: true },
};

const UPDATE_SCHEMA = {
  name: { type: 'string', max: 80 },
  role: { type: 'enum', values: USER_ROLES },
  isActive: { type: 'bool' },
};

export const serializeUser = (row) => ({
  id: row.id,
  username: row.username,
  name: row.name,
  role: row.role,
  isActive: row.isActive === 1,
  createdAt: row.createdAt,
  lastLoginAt: row.lastLoginAt,
});

const isUniqueViolation = (err) => err?.code === 'SQLITE_CONSTRAINT' && /UNIQUE/i.test(err.message);

export function listUsers(db) {
  return db.all('SELECT * FROM users ORDER BY role, username');
}

export async function getUser(db, id) {
  const row = await db.get('SELECT * FROM users WHERE id = ?', [id]);
  if (!row) throw notFound('User');
  return row;
}

function checkPassword(password) {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH || password.length > 128) {
    throw new HttpError(400, 'weak_password', `Use at least ${MIN_PASSWORD_LENGTH} characters`, {
      fields: { password: 'invalid' },
    });
  }
}

export async function createUser(db, input) {
  const clean = validate(input, USER_SCHEMA);
  if (!USERNAME_RE.test(clean.username)) {
    throw new HttpError(400, 'validation_failed', 'Use 3–30 letters, digits, dot, dash or underscore', {
      fields: { username: 'invalid' },
    });
  }
  checkPassword(input?.password);
  try {
    const { id } = await db.run(
      'INSERT INTO users (username, name, passwordHash, role, isActive) VALUES (?, ?, ?, ?, ?)',
      [clean.username.toLowerCase(), clean.name, hashPassword(input.password), clean.role, clean.isActive ? 1 : 0],
    );
    return getUser(db, id);
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new HttpError(409, 'username_taken', 'This username already exists', { fields: { username: 'taken' } });
    }
    throw err;
  }
}

/** The last active owner may never be demoted, disabled or deleted. */
async function assertNotLastOwner(db, user, { nextRole, nextActive } = {}) {
  if (user.role !== 'owner') return;
  const stillOwner = (nextRole ?? user.role) === 'owner' && (nextActive ?? user.isActive === 1);
  if (stillOwner) return;
  const { count } = await db.get("SELECT COUNT(*) AS count FROM users WHERE role = 'owner' AND isActive = 1 AND id != ?", [user.id]);
  if (count === 0) throw new HttpError(409, 'last_owner', 'There must always be one active owner');
}

export async function updateUser(db, id, input) {
  const user = await getUser(db, id);
  const clean = validate(input, UPDATE_SCHEMA, { partial: true });
  await assertNotLastOwner(db, user, { nextRole: clean.role, nextActive: clean.isActive });

  if ('isActive' in clean) clean.isActive = clean.isActive ? 1 : 0;
  const columns = Object.keys(clean);
  if (columns.length > 0) {
    await db.run(`UPDATE users SET ${columns.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`, [
      ...columns.map((c) => clean[c]),
      id,
    ]);
  }
  if (input?.password) {
    checkPassword(input.password);
    await db.run('UPDATE users SET passwordHash = ? WHERE id = ?', [hashPassword(input.password), id]);
    // Force the account to sign in again everywhere.
    await db.run('DELETE FROM sessions WHERE userId = ?', [id]);
  }
  return getUser(db, id);
}

export async function deleteUser(db, id, currentUserId) {
  const user = await getUser(db, id);
  if (user.id === currentUserId) throw new HttpError(409, 'cannot_delete_self', 'You cannot delete your own account');
  await assertNotLastOwner(db, user, { nextActive: false });
  await db.run('DELETE FROM sessions WHERE userId = ?', [id]);
  await db.run('DELETE FROM users WHERE id = ?', [id]);
}
