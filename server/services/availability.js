/**
 * Date-range availability. A car is busy for [pickupAt, returnAt) when it has a
 * pending or confirmed booking, or an owner-set blocked period, overlapping that
 * window. All values are "YYYY-MM-DDTHH:mm" strings, which compare correctly as text.
 */

const ACTIVE = "('pending', 'confirmed')";

export function findConflict(db, carId, pickupAt, returnAt, excludeBookingId = null) {
  return db.get(
    `SELECT id, reference, pickupAt, returnAt, status FROM bookings
     WHERE carId = ? AND status IN ${ACTIVE} AND pickupAt < ? AND returnAt > ? AND id IS NOT ?
     ORDER BY pickupAt LIMIT 1`,
    [carId, returnAt, pickupAt, excludeBookingId],
  );
}

/** Owner-set blocked period (service, personal use, event) overlapping the window. */
export function findBlackout(db, carId, pickupAt, returnAt) {
  return db.get(
    `SELECT id, startAt, endAt, reason FROM blackouts
     WHERE carId = ? AND startAt < ? AND endAt > ? ORDER BY startAt LIMIT 1`,
    [carId, returnAt, pickupAt],
  );
}

/** Ids of cars with an active booking overlapping the window. */
export async function busyCarIds(db, pickupAt, returnAt, { confirmedOnly = false } = {}) {
  const statuses = confirmedOnly ? "('confirmed')" : ACTIVE;
  const rows = await db.all(
    `SELECT DISTINCT carId FROM bookings
     WHERE carId IS NOT NULL AND status IN ${statuses} AND pickupAt < ? AND returnAt > ?
     UNION
     SELECT DISTINCT carId FROM blackouts WHERE startAt < ? AND endAt > ?`,
    [returnAt, pickupAt, returnAt, pickupAt],
  );
  return new Set(rows.map((row) => row.carId));
}

/** Upcoming reserved windows for one car — shown to customers, no personal data. */
export async function reservedWindows(db, carId, now) {
  const rows = await db.all(
    `SELECT pickupAt AS startAt, returnAt AS endAt FROM bookings
     WHERE carId = ? AND status IN ${ACTIVE} AND returnAt > ?
     UNION ALL
     SELECT startAt, endAt FROM blackouts WHERE carId = ? AND endAt > ?
     ORDER BY startAt LIMIT 24`,
    [carId, now, carId, now],
  );
  return rows.map((row) => ({ pickupAt: row.startAt, returnAt: row.endAt }));
}

/**
 * Everything happening to the fleet inside a period — the source for the
 * admin availability calendar.
 */
export async function calendarEntries(db, from, to) {
  const [bookings, blocks] = await Promise.all([
    db.all(
      `SELECT b.id, b.reference, b.carId, b.carName, b.customerName, b.pickupAt AS startAt, b.returnAt AS endAt, b.status
       FROM bookings b
       WHERE b.carId IS NOT NULL AND b.status != 'cancelled' AND b.pickupAt < ? AND b.returnAt > ?
       ORDER BY b.pickupAt`,
      [to, from],
    ),
    db.all(
      `SELECT x.id, x.carId, x.startAt, x.endAt, x.reason,
              TRIM(COALESCE(c.brand, '') || ' ' || COALESCE(c.model, '')) AS carName
       FROM blackouts x LEFT JOIN cars c ON c.id = x.carId
       WHERE x.startAt < ? AND x.endAt > ? ORDER BY x.startAt`,
      [to, from],
    ),
  ]);
  return [
    ...bookings.map((row) => ({ ...row, kind: 'booking' })),
    ...blocks.map((row) => ({ ...row, kind: 'blackout', status: 'blocked' })),
  ].sort((a, b) => a.startAt.localeCompare(b.startAt));
}
