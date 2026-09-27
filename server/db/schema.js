/**
 * Database schema and migrations. The applied version lives in PRAGMA user_version.
 *
 * v1  the original prototype tables (loosely typed cars/bookings/messages/offers)
 *     are replaced by the normalised schema. Messages, offers and booking history
 *     are carried over; the prototype car list is discarded (wrong vehicle names)
 *     and the curated fleet is seeded instead.
 * v2  operations release: fleet inventory fields, blackout dates, expenses,
 *     payments, drivers, customers, saved chats, staff accounts with roles,
 *     an activity log and editable website content (testimonials + FAQ).
 */

export const SCHEMA_VERSION = 2;

const NOW = "(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))";

export const CATEGORIES = ['luxury', 'suv', 'sports', 'convertible', 'classic', 'electric'];
export const CAR_STATUSES = ['available', 'maintenance'];
export const BOOKING_STATUSES = ['pending', 'confirmed', 'completed', 'cancelled'];
export const FUELS = ['petrol', 'diesel', 'hybrid', 'electric'];
export const TRANSMISSIONS = ['automatic', 'manual'];
export const EXPENSE_CATEGORIES = ['service', 'insurance', 'fuel', 'cleaning', 'repair', 'licence', 'other'];
export const PAYMENT_METHODS = ['cash', 'card', 'transfer', 'other'];
export const PAYMENT_KINDS = ['payment', 'deposit', 'refund'];
export const USER_ROLES = ['owner', 'manager', 'staff'];

const quoteList = (values) => values.map((v) => `'${v}'`).join(', ');

const SCHEMA_V1 = `
CREATE TABLE cars (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  slug          TEXT    NOT NULL UNIQUE,
  brand         TEXT    NOT NULL,
  model         TEXT    NOT NULL,
  trim          TEXT    NOT NULL DEFAULT '',
  year          INTEGER,
  category      TEXT    NOT NULL DEFAULT 'luxury' CHECK (category IN (${quoteList(CATEGORIES)})),
  color         TEXT    NOT NULL DEFAULT '',
  seats         INTEGER NOT NULL DEFAULT 5,
  transmission  TEXT    CHECK (transmission IS NULL OR transmission IN (${quoteList(TRANSMISSIONS)})),
  fuel          TEXT    NOT NULL DEFAULT 'petrol' CHECK (fuel IN (${quoteList(FUELS)})),
  powerHp       INTEGER,
  dailyRate     INTEGER NOT NULL CHECK (dailyRate > 0),
  deposit       INTEGER NOT NULL DEFAULT 0 CHECK (deposit >= 0),
  taglineEn     TEXT    NOT NULL DEFAULT '',
  taglineAr     TEXT    NOT NULL DEFAULT '',
  descriptionEn TEXT    NOT NULL DEFAULT '',
  descriptionAr TEXT    NOT NULL DEFAULT '',
  images        TEXT    NOT NULL DEFAULT '[]',
  status        TEXT    NOT NULL DEFAULT 'available' CHECK (status IN (${quoteList(CAR_STATUSES)})),
  isActive      INTEGER NOT NULL DEFAULT 1,
  isFeatured    INTEGER NOT NULL DEFAULT 0,
  sortOrder     INTEGER NOT NULL DEFAULT 0,
  createdAt     TEXT    NOT NULL DEFAULT ${NOW},
  updatedAt     TEXT    NOT NULL DEFAULT ${NOW}
);

CREATE TABLE bookings (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  reference        TEXT    NOT NULL UNIQUE,
  carId            INTEGER REFERENCES cars(id) ON DELETE SET NULL,
  carName          TEXT    NOT NULL,
  customerName     TEXT    NOT NULL,
  phone            TEXT    NOT NULL,
  email            TEXT    NOT NULL DEFAULT '',
  pickupLocation   TEXT    NOT NULL,
  pickupAt         TEXT    NOT NULL,
  returnAt         TEXT    NOT NULL,
  days             INTEGER NOT NULL,
  airportDelivery  INTEGER NOT NULL DEFAULT 0,
  chauffeur        INTEGER NOT NULL DEFAULT 0,
  promoCode        TEXT    NOT NULL DEFAULT '',
  dailyRate        INTEGER NOT NULL,
  rentalSubtotal   INTEGER NOT NULL,
  durationDiscount INTEGER NOT NULL DEFAULT 0,
  extrasTotal      INTEGER NOT NULL DEFAULT 0,
  promoDiscount    INTEGER NOT NULL DEFAULT 0,
  totalPrice       INTEGER NOT NULL,
  deposit          INTEGER NOT NULL DEFAULT 0,
  currency         TEXT    NOT NULL,
  notes            TEXT    NOT NULL DEFAULT '',
  channel          TEXT    NOT NULL DEFAULT 'web',
  status           TEXT    NOT NULL DEFAULT 'pending' CHECK (status IN (${quoteList(BOOKING_STATUSES)})),
  adminNotes       TEXT    NOT NULL DEFAULT '',
  createdAt        TEXT    NOT NULL DEFAULT ${NOW},
  updatedAt        TEXT    NOT NULL DEFAULT ${NOW}
);
CREATE INDEX idx_bookings_car_window ON bookings (carId, status, pickupAt, returnAt);
CREATE INDEX idx_bookings_created ON bookings (createdAt);

CREATE TABLE messages (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  name      TEXT    NOT NULL,
  email     TEXT    NOT NULL DEFAULT '',
  phone     TEXT    NOT NULL DEFAULT '',
  message   TEXT    NOT NULL,
  source    TEXT    NOT NULL DEFAULT 'contact',
  carId     INTEGER REFERENCES cars(id) ON DELETE SET NULL,
  isRead    INTEGER NOT NULL DEFAULT 0,
  createdAt TEXT    NOT NULL DEFAULT ${NOW}
);

CREATE TABLE offers (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  code            TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  discountPercent INTEGER NOT NULL CHECK (discountPercent BETWEEN 1 AND 90),
  descriptionEn   TEXT    NOT NULL DEFAULT '',
  descriptionAr   TEXT    NOT NULL DEFAULT '',
  minDays         INTEGER NOT NULL DEFAULT 1 CHECK (minDays >= 1),
  validUntil      TEXT,
  isActive        INTEGER NOT NULL DEFAULT 1,
  isPublic        INTEGER NOT NULL DEFAULT 1,
  usageCount      INTEGER NOT NULL DEFAULT 0,
  createdAt       TEXT    NOT NULL DEFAULT ${NOW}
);

CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE sessions (
  tokenHash TEXT    PRIMARY KEY,
  expiresAt INTEGER NOT NULL,
  createdAt TEXT    NOT NULL DEFAULT ${NOW}
);
`;

const SCHEMA_V2 = `
ALTER TABLE cars ADD COLUMN plateNumber TEXT NOT NULL DEFAULT '';
ALTER TABLE cars ADD COLUMN odometerKm INTEGER;
ALTER TABLE cars ADD COLUMN serviceDueKm INTEGER;
ALTER TABLE cars ADD COLUMN serviceDueAt TEXT;
ALTER TABLE cars ADD COLUMN insuranceExpiry TEXT;
ALTER TABLE cars ADD COLUMN licenceExpiry TEXT;
ALTER TABLE bookings ADD COLUMN driverId INTEGER;
ALTER TABLE sessions ADD COLUMN userId INTEGER;

CREATE TABLE drivers (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT    NOT NULL,
  phone         TEXT    NOT NULL DEFAULT '',
  licenceNumber TEXT    NOT NULL DEFAULT '',
  dailyRate     INTEGER NOT NULL DEFAULT 0 CHECK (dailyRate >= 0),
  notes         TEXT    NOT NULL DEFAULT '',
  isActive      INTEGER NOT NULL DEFAULT 1,
  createdAt     TEXT    NOT NULL DEFAULT ${NOW}
);

CREATE TABLE blackouts (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  carId     INTEGER NOT NULL REFERENCES cars(id) ON DELETE CASCADE,
  startAt   TEXT    NOT NULL,
  endAt     TEXT    NOT NULL,
  reason    TEXT    NOT NULL DEFAULT '',
  createdAt TEXT    NOT NULL DEFAULT ${NOW}
);
CREATE INDEX idx_blackouts_window ON blackouts (carId, startAt, endAt);

CREATE TABLE expenses (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  carId     INTEGER REFERENCES cars(id) ON DELETE SET NULL,
  category  TEXT    NOT NULL DEFAULT 'other' CHECK (category IN (${quoteList(EXPENSE_CATEGORIES)})),
  amount    INTEGER NOT NULL CHECK (amount >= 0),
  currency  TEXT    NOT NULL,
  spentOn   TEXT    NOT NULL,
  note      TEXT    NOT NULL DEFAULT '',
  createdAt TEXT    NOT NULL DEFAULT ${NOW}
);
CREATE INDEX idx_expenses_date ON expenses (spentOn);

CREATE TABLE payments (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  bookingId INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  amount    INTEGER NOT NULL CHECK (amount > 0),
  kind      TEXT    NOT NULL DEFAULT 'payment' CHECK (kind IN (${quoteList(PAYMENT_KINDS)})),
  method    TEXT    NOT NULL DEFAULT 'cash' CHECK (method IN (${quoteList(PAYMENT_METHODS)})),
  paidOn    TEXT    NOT NULL,
  note      TEXT    NOT NULL DEFAULT '',
  createdAt TEXT    NOT NULL DEFAULT ${NOW}
);
CREATE INDEX idx_payments_booking ON payments (bookingId);

CREATE TABLE customers (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  phoneKey  TEXT    NOT NULL UNIQUE,
  name      TEXT    NOT NULL DEFAULT '',
  phone     TEXT    NOT NULL DEFAULT '',
  email     TEXT    NOT NULL DEFAULT '',
  notes     TEXT    NOT NULL DEFAULT '',
  isBlocked INTEGER NOT NULL DEFAULT 0,
  createdAt TEXT    NOT NULL DEFAULT ${NOW},
  updatedAt TEXT    NOT NULL DEFAULT ${NOW}
);

CREATE TABLE chats (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  sessionKey   TEXT    NOT NULL UNIQUE,
  lang         TEXT    NOT NULL DEFAULT 'en',
  messageCount INTEGER NOT NULL DEFAULT 0,
  lastMessage  TEXT    NOT NULL DEFAULT '',
  isRead       INTEGER NOT NULL DEFAULT 0,
  createdAt    TEXT    NOT NULL DEFAULT ${NOW},
  updatedAt    TEXT    NOT NULL DEFAULT ${NOW}
);

CREATE TABLE chat_messages (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  chatId    INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  role      TEXT    NOT NULL CHECK (role IN ('user', 'bot')),
  text      TEXT    NOT NULL,
  createdAt TEXT    NOT NULL DEFAULT ${NOW}
);
CREATE INDEX idx_chat_messages ON chat_messages (chatId, id);

CREATE TABLE users (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  username     TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  name         TEXT    NOT NULL DEFAULT '',
  passwordHash TEXT    NOT NULL,
  role         TEXT    NOT NULL DEFAULT 'staff' CHECK (role IN (${quoteList(USER_ROLES)})),
  isActive     INTEGER NOT NULL DEFAULT 1,
  createdAt    TEXT    NOT NULL DEFAULT ${NOW},
  lastLoginAt  TEXT
);

CREATE TABLE activity (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  userId    INTEGER,
  userName  TEXT    NOT NULL DEFAULT '',
  action    TEXT    NOT NULL,
  entity    TEXT    NOT NULL DEFAULT '',
  entityId  TEXT    NOT NULL DEFAULT '',
  summary   TEXT    NOT NULL DEFAULT '',
  createdAt TEXT    NOT NULL DEFAULT ${NOW}
);
CREATE INDEX idx_activity_created ON activity (createdAt);

CREATE TABLE testimonials (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  nameEn    TEXT    NOT NULL DEFAULT '',
  nameAr    TEXT    NOT NULL DEFAULT '',
  roleEn    TEXT    NOT NULL DEFAULT '',
  roleAr    TEXT    NOT NULL DEFAULT '',
  textEn    TEXT    NOT NULL DEFAULT '',
  textAr    TEXT    NOT NULL DEFAULT '',
  rating    INTEGER NOT NULL DEFAULT 5 CHECK (rating BETWEEN 1 AND 5),
  isActive  INTEGER NOT NULL DEFAULT 1,
  sortOrder INTEGER NOT NULL DEFAULT 0,
  createdAt TEXT    NOT NULL DEFAULT ${NOW}
);

CREATE TABLE faqs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  questionEn TEXT    NOT NULL DEFAULT '',
  questionAr TEXT    NOT NULL DEFAULT '',
  answerEn   TEXT    NOT NULL DEFAULT '',
  answerAr   TEXT    NOT NULL DEFAULT '',
  isActive   INTEGER NOT NULL DEFAULT 1,
  sortOrder  INTEGER NOT NULL DEFAULT 0,
  createdAt  TEXT    NOT NULL DEFAULT ${NOW}
);
`;

const LEGACY_TABLES = ['cars', 'bookings', 'messages', 'offers'];

async function tableNames(db) {
  const rows = await db.all("SELECT name FROM sqlite_master WHERE type = 'table'");
  return new Set(rows.map((r) => r.name));
}

async function importLegacyData(db, tables) {
  if (tables.has('legacy_messages')) {
    await db.run(`
      INSERT INTO messages (name, email, phone, message, source, createdAt)
      SELECT name, COALESCE(email, ''), COALESCE(phone, ''), message, COALESCE(source, 'contact'),
             COALESCE(REPLACE(createdAt, ' ', 'T') || 'Z', ${NOW})
      FROM legacy_messages`);
  }
  if (tables.has('legacy_offers')) {
    await db.run(`
      INSERT OR IGNORE INTO offers (code, discountPercent, descriptionEn, isActive)
      SELECT UPPER(code), MIN(MAX(discountPercent, 1), 90), COALESCE(description, ''), COALESCE(isActive, 1)
      FROM legacy_offers`);
  }
  if (tables.has('legacy_bookings')) {
    const carJoin = tables.has('legacy_cars') ? 'LEFT JOIN legacy_cars c ON c.id = b.carId' : '';
    const carName = tables.has('legacy_cars') ? "COALESCE(c.brand || ' ' || c.model, 'Archived vehicle')" : "'Archived vehicle'";
    await db.run(`
      INSERT INTO bookings (reference, carId, carName, customerName, phone, email, pickupLocation,
        pickupAt, returnAt, days, airportDelivery, chauffeur, dailyRate, rentalSubtotal, totalPrice,
        currency, status, channel, createdAt)
      SELECT 'LEGACY-' || b.id, NULL, ${carName}, b.customerName, b.phone, COALESCE(b.email, ''),
        COALESCE(b.pickupLocation, ''), SUBSTR(COALESCE(b.pickupDate, ''), 1, 16), SUBSTR(COALESCE(b.returnDate, ''), 1, 16),
        1, COALESCE(b.airportPickup, 0), COALESCE(b.privateDriver, 0), COALESCE(b.totalPrice, 0),
        COALESCE(b.totalPrice, 0), COALESCE(b.totalPrice, 0), 'USD',
        CASE WHEN b.status IN (${quoteList(BOOKING_STATUSES)}) THEN b.status ELSE 'pending' END, 'legacy',
        COALESCE(REPLACE(b.createdAt, ' ', 'T') || 'Z', ${NOW})
      FROM legacy_bookings b ${carJoin}`);
  }
}

const digitsOnly = (value) => String(value ?? '').replace(/\D/g, '');

/** Every existing booking becomes a customer record, so the CRM starts complete. */
async function backfillCustomers(db) {
  const bookings = await db.all('SELECT customerName, phone, email FROM bookings ORDER BY id');
  for (const booking of bookings) {
    const phoneKey = digitsOnly(booking.phone);
    if (!phoneKey) continue;
    await db.run(
      `INSERT INTO customers (phoneKey, name, phone, email) VALUES (?, ?, ?, ?)
       ON CONFLICT(phoneKey) DO UPDATE SET name = excluded.name,
         email = COALESCE(NULLIF(excluded.email, ''), customers.email)`,
      [phoneKey, booking.customerName, booking.phone, booking.email ?? ''],
    );
  }
}

/** The single admin password becomes the first staff account (role: owner). */
async function adoptAdminPassword(db) {
  const row = await db.get("SELECT value FROM settings WHERE key = 'adminPasswordHash'");
  if (!row) return;
  await db.run(
    "INSERT OR IGNORE INTO users (username, name, passwordHash, role) VALUES ('admin', 'Owner', ?, 'owner')",
    [JSON.parse(row.value)],
  );
}

const MIGRATIONS = {
  async 1(db) {
    let tables = await tableNames(db);
    for (const name of LEGACY_TABLES) {
      if (tables.has(name)) await db.exec(`ALTER TABLE ${name} RENAME TO legacy_${name}`);
    }
    await db.exec(SCHEMA_V1);
    tables = await tableNames(db);
    await importLegacyData(db, tables);
    for (const name of ['legacy_bookings', 'legacy_messages', 'legacy_offers', 'legacy_cars']) {
      if (tables.has(name)) await db.exec(`DROP TABLE ${name}`);
    }
  },

  async 2(db) {
    await db.exec(SCHEMA_V2);
    await backfillCustomers(db);
    await adoptAdminPassword(db);
  },
};

export async function migrate(db) {
  await db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
  const { user_version: current } = await db.get('PRAGMA user_version');

  for (let version = current + 1; version <= SCHEMA_VERSION; version += 1) {
    await db.exec('BEGIN IMMEDIATE');
    try {
      await MIGRATIONS[version](db);
      await db.exec(`PRAGMA user_version = ${version}`);
      await db.exec('COMMIT');
    } catch (err) {
      await db.exec('ROLLBACK');
      throw err;
    }
  }
}
