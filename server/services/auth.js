import { config } from '../config.js';
import { hashPassword, newSessionToken, tokenDigest, verifyPassword } from '../lib/crypto.js';
import { HttpError } from '../lib/http.js';
import { serializeUser } from './users.js';

const PASSWORD_KEY = 'adminPasswordHash';
const MIN_PASSWORD_LENGTH = 8;
const DEFAULT_USERNAME = 'admin';

/** Role capabilities, from the widest to the narrowest. */
const ROLE_RANK = { owner: 3, manager: 2, staff: 1 };

export const canAccess = (role, minimumRole) => (ROLE_RANK[role] ?? 0) >= (ROLE_RANK[minimumRole] ?? 0);

/** Guarantees one usable owner account, both on a fresh database and after an upgrade. */
export async function ensureAdminPassword(db) {
  const legacy = await db.get(`SELECT value FROM settings WHERE key = '${PASSWORD_KEY}'`);
  const hash = legacy ? JSON.parse(legacy.value) : hashPassword(config.initialAdminPassword);
  await db.run(
    `INSERT OR IGNORE INTO users (username, name, passwordHash, role) VALUES (?, 'Owner', ?, 'owner')`,
    [DEFAULT_USERNAME, hash],
  );
  // Kept so an older deployment rolling back still finds its password.
  if (!legacy) {
    await db.run(`INSERT OR REPLACE INTO settings (key, value) VALUES ('${PASSWORD_KEY}', ?)`, [JSON.stringify(hash)]);
  }
}

const usingDefaultPassword = (user) => verifyPassword(config.initialAdminPassword, user.passwordHash);

async function startSession(db, user) {
  const token = newSessionToken();
  const expiresAt = Date.now() + config.sessionTtlMs;
  await db.run('DELETE FROM sessions WHERE expiresAt < ?', [Date.now()]);
  await db.run('INSERT INTO sessions (tokenHash, expiresAt, userId) VALUES (?, ?, ?)', [
    tokenDigest(token),
    expiresAt,
    user.id,
  ]);
  await db.run(`UPDATE users SET lastLoginAt = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`, [user.id]);
  return { token, expiresAt, user: serializeUser(user), usingDefaultPassword: usingDefaultPassword(user) };
}

/** Accepts `{ username, password }`; a bare password signs in the default owner. */
export async function login(db, input) {
  const { username, password } =
    typeof input === 'string' ? { username: DEFAULT_USERNAME, password: input } : (input ?? {});
  const name = (typeof username === 'string' && username.trim() ? username : DEFAULT_USERNAME).toLowerCase();
  const user = await db.get('SELECT * FROM users WHERE username = ?', [name]);

  if (typeof password !== 'string' || !user || !verifyPassword(password, user.passwordHash)) {
    throw new HttpError(401, 'invalid_credentials', 'Incorrect username or password');
  }
  if (user.isActive !== 1) throw new HttpError(403, 'account_disabled', 'This account has been disabled');

  return startSession(db, user);
}

export async function logout(db, token) {
  await db.run('DELETE FROM sessions WHERE tokenHash = ?', [tokenDigest(token)]);
}

export async function sessionInfo(db, token) {
  const session = await db.get(
    `SELECT s.expiresAt, u.* FROM sessions s LEFT JOIN users u ON u.id = s.userId WHERE s.tokenHash = ?`,
    [tokenDigest(token)],
  );
  return {
    expiresAt: session.expiresAt,
    user: session.id ? serializeUser(session) : null,
    usingDefaultPassword: session.passwordHash ? usingDefaultPassword(session) : false,
  };
}

export async function changePassword(db, token, { currentPassword, newPassword } = {}) {
  const user = await db.get(
    'SELECT u.* FROM sessions s JOIN users u ON u.id = s.userId WHERE s.tokenHash = ?',
    [tokenDigest(token)],
  );
  if (!user) throw new HttpError(401, 'unauthorized', 'Sign in required');
  if (typeof currentPassword !== 'string' || !verifyPassword(currentPassword, user.passwordHash)) {
    throw new HttpError(400, 'invalid_credentials', 'Current password is incorrect', { fields: { currentPassword: 'invalid' } });
  }
  if (typeof newPassword !== 'string' || newPassword.length < MIN_PASSWORD_LENGTH || newPassword.length > 128) {
    throw new HttpError(400, 'weak_password', `Use at least ${MIN_PASSWORD_LENGTH} characters`, { fields: { newPassword: 'invalid' } });
  }

  const hash = hashPassword(newPassword);
  await db.run('UPDATE users SET passwordHash = ? WHERE id = ?', [hash, user.id]);
  if (user.username === DEFAULT_USERNAME) {
    await db.run(`INSERT OR REPLACE INTO settings (key, value) VALUES ('${PASSWORD_KEY}', ?)`, [JSON.stringify(hash)]);
  }
  // Sign out every other device of this account.
  await db.run('DELETE FROM sessions WHERE userId = ? AND tokenHash != ?', [user.id, tokenDigest(token)]);
}

/** Express middleware guarding /api/admin/*. Expects `Authorization: Bearer <token>`. */
export function requireAdmin(db) {
  return async (req, _res, next) => {
    const header = req.get('authorization') ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!token) throw new HttpError(401, 'unauthorized', 'Sign in required');

    const session = await db.get(
      `SELECT s.expiresAt, s.userId, u.username, u.name, u.role, u.isActive
       FROM sessions s LEFT JOIN users u ON u.id = s.userId WHERE s.tokenHash = ?`,
      [tokenDigest(token)],
    );
    if (!session || session.expiresAt < Date.now()) throw new HttpError(401, 'session_expired', 'Your session has expired');
    if (session.userId && session.isActive !== 1) throw new HttpError(403, 'account_disabled', 'This account has been disabled');

    req.adminToken = token;
    req.user = session.userId
      ? { id: session.userId, username: session.username, name: session.name, role: session.role }
      : { id: null, username: 'admin', name: 'Owner', role: 'owner' };
    next();
  };
}

/** Route guard: the signed-in user must hold at least `minimumRole`. */
export function requireRole(minimumRole) {
  return (req, _res, next) => {
    if (!canAccess(req.user?.role, minimumRole)) {
      throw new HttpError(403, 'forbidden', 'Your account does not have access to this area');
    }
    next();
  };
}
