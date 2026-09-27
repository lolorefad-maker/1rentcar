import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import sqlite3 from 'sqlite3';
import { SCHEMA_VERSION } from '../server/db/schema.js';
import { startServer } from './helpers.js';

/** Builds a database with the original prototype schema and a little data. */
function createLegacyDatabase(file) {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(file);
    db.exec(
      `CREATE TABLE cars (id INTEGER PRIMARY KEY AUTOINCREMENT, brand TEXT NOT NULL, model TEXT NOT NULL, basePrice INTEGER NOT NULL,
         status TEXT DEFAULT 'Available', isActive INTEGER DEFAULT 1);
       CREATE TABLE bookings (id INTEGER PRIMARY KEY AUTOINCREMENT, carId INTEGER, customerName TEXT NOT NULL, email TEXT, phone TEXT NOT NULL,
         pickupLocation TEXT, pickupDate TEXT, returnDate TEXT, airportPickup INTEGER DEFAULT 0, privateDriver INTEGER DEFAULT 0,
         totalPrice INTEGER, status TEXT DEFAULT 'pending', createdAt DATETIME DEFAULT CURRENT_TIMESTAMP);
       CREATE TABLE messages (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT, phone TEXT, message TEXT NOT NULL,
         source TEXT DEFAULT 'web', createdAt DATETIME DEFAULT CURRENT_TIMESTAMP);
       CREATE TABLE offers (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL UNIQUE, discountPercent INTEGER NOT NULL,
         description TEXT, isActive INTEGER DEFAULT 1);
       INSERT INTO cars (brand, model, basePrice) VALUES ('PORSCHE', '911 TARGA 4S', 500);
       INSERT INTO bookings (carId, customerName, phone, pickupDate, returnDate, totalPrice, status)
         VALUES (1, 'Old Customer', '0790000000', '2026-06-01T10:00', '2026-06-03T10:00', 1000, 'confirmed');
       INSERT INTO messages (name, phone, message) VALUES ('Legacy Lead', '0790000001', 'Hello from the old site');
       INSERT INTO offers (code, discountPercent, description) VALUES ('OLDCODE', 12, 'Legacy offer');`,
      (err) => {
        db.close();
        if (err) reject(err);
        else resolve();
      },
    );
  });
}

let srv;
let legacyFile;

before(async () => {
  legacyFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'lm-legacy-')), 'legacy.db');
  await createLegacyDatabase(legacyFile);
  srv = await startServer({ dbFile: legacyFile });
});

after(async () => {
  await srv?.close();
  fs.rmSync(path.dirname(legacyFile), { recursive: true, force: true });
});

describe('legacy database migration', () => {
  it('replaces the wrongly-labelled prototype cars with the curated fleet', async () => {
    const { body } = await srv.request('GET', '/api/cars');
    assert.equal(body.cars.length, 68);
    assert.ok(!body.cars.some((car) => car.model === '911 TARGA 4S'));
  });

  it('keeps messages, offers and booking history', async () => {
    const token = await srv.login();
    const messages = (await srv.request('GET', '/api/admin/messages', { token })).body.messages;
    assert.ok(messages.some((m) => m.name === 'Legacy Lead'));

    const offers = (await srv.request('GET', '/api/admin/offers', { token })).body.offers;
    assert.ok(offers.some((o) => o.code === 'OLDCODE' && o.discountPercent === 12));

    const bookings = (await srv.request('GET', '/api/admin/bookings', { token })).body.bookings;
    const legacy = bookings.find((b) => b.reference === 'LEGACY-1');
    assert.ok(legacy);
    assert.equal(legacy.carName, 'PORSCHE 911 TARGA 4S');
    assert.equal(legacy.totalPrice, 1000);
    assert.equal(legacy.status, 'confirmed');
    assert.equal(legacy.carId, null);
  });

  it('is idempotent across restarts', async () => {
    const { user_version: version } = await srv.db.get('PRAGMA user_version');
    assert.equal(version, SCHEMA_VERSION);
    const tables = (await srv.db.all("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'legacy_%'")).length;
    assert.equal(tables, 0);
  });
});
