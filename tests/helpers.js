import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const ADMIN_PASSWORD = 'admin123';
/** Business clock is pinned so date rules (minimum notice, expiry) are deterministic. */
export const NOW = '2030-01-01T09:00';

/**
 * Boots the real app on a throwaway SQLite file and an ephemeral port.
 * Must be called before any other server module is imported (config reads env at import).
 */
export async function startServer({ dbFile } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lm-test-'));
  const dbPath = path.join(dir, 'test.db');
  if (dbFile) fs.copyFileSync(dbFile, dbPath);

  process.env.DB_PATH = dbPath;
  process.env.NODE_ENV = 'test';
  process.env.ADMIN_PASSWORD = ADMIN_PASSWORD;

  const { config } = await import('../server/config.js');
  const { bootstrap } = await import('../server/bootstrap.js');
  const { clock } = await import('../server/lib/time.js');
  clock.nowLocal = () => NOW;

  const { app, db } = await bootstrap(config);
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  const base = `http://127.0.0.1:${server.address().port}`;

  async function request(method, url, { body, token, raw, contentType, redirect = 'follow' } = {}) {
    const headers = {};
    let payload;
    if (token) headers.authorization = `Bearer ${token}`;
    if (raw !== undefined) {
      headers['content-type'] = contentType ?? 'application/octet-stream';
      payload = raw;
    } else if (body !== undefined) {
      headers['content-type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    const response = await fetch(base + url, { method, headers, body: payload, redirect });
    const text = await response.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
    return { status: response.status, body: json, text, headers: response.headers };
  }

  async function login(password = ADMIN_PASSWORD) {
    const response = await request('POST', '/api/admin/login', { body: { password } });
    return response.body?.token;
  }

  async function close() {
    await new Promise((resolve) => server.close(resolve));
    await db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }

  return { request, login, close, db, config, base };
}
