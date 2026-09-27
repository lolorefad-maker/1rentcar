import crypto from 'node:crypto';

const KEY_LENGTH = 64;

export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, KEY_LENGTH);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifyPassword(password, stored) {
  const [scheme, saltHex, hashHex] = String(stored).split('$');
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(String(password), Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

export const newSessionToken = () => crypto.randomBytes(32).toString('base64url');

/** Sessions are stored hashed so a leaked database cannot be replayed as live tokens. */
export const tokenDigest = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');

/** Human-friendly booking reference, e.g. LM-7Q4K2D. Excludes look-alike characters. */
export function bookingReference(prefix = 'LM') {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(6);
  const code = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
  return `${prefix}-${code}`;
}
