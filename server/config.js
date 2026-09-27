import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const config = Object.freeze({
  root: ROOT,
  port: Number(process.env.PORT) || 3000,
  dbPath: process.env.DB_PATH || path.join(ROOT, 'showroom.db'),
  publicDir: path.join(ROOT, 'public'),
  mediaDir: path.join(ROOT, 'public', 'media'),
  fleetSeedFile: path.join(ROOT, 'data', 'fleet.json'),
  mediaManifestFile: path.join(ROOT, 'data', 'media-manifest.json'),
  siteContentFile: path.join(ROOT, 'data', 'site-content.json'),
  timezone: process.env.BUSINESS_TIMEZONE || 'Asia/Amman',
  initialAdminPassword: process.env.ADMIN_PASSWORD || 'admin123',
  sessionTtlMs: 12 * 60 * 60 * 1000,
  isTest: process.env.NODE_ENV === 'test',
});
