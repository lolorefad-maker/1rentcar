import { BOOKING_STATUSES } from '../db/schema.js';
import { bookingReference } from '../lib/crypto.js';
import { HttpError, notFound } from '../lib/http.js';
import { createMutex } from '../lib/mutex.js';
import { calculateQuote, countRentalDays, offerProblem, parseLocalDateTime } from '../lib/pricing.js';
import { clock } from '../lib/time.js';
import { validate } from '../lib/validate.js';
import { findBlackout, findConflict } from './availability.js';
import { carDisplayName } from './cars.js';
import { isBlocked, rememberCustomer } from './customers.js';
import { getSettings } from './settings.js';

const MAX_RENTAL_DAYS = 365;
const HOUR_MS = 3_600_000;
const ACTIVE_STATUSES = new Set(['pending', 'confirmed']);
const NOW_SQL = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";

/** Availability check + insert must never interleave between two requests. */
const runExclusive = createMutex();

const QUOTE_SCHEMA = {
  carId: { type: 'int', min: 1, required: true },
  pickupAt: { type: 'datetime', required: true },
  returnAt: { type: 'datetime', required: true },
  airportDelivery: { type: 'bool', default: false },
  chauffeur: { type: 'bool', default: false },
  promoCode: { type: 'string', max: 40, default: '' },
};

const BOOKING_SCHEMA = {
  ...QUOTE_SCHEMA,
  customerName: { type: 'string', max: 100, required: true },
  phone: { type: 'phone', required: true },
  email: { type: 'email' },
  pickupLocation: { type: 'string', max: 200, required: true },
  notes: { type: 'string', max: 1000 },
  channel: { type: 'enum', values: ['web', 'whatsapp'], default: 'web' },
};

const ADMIN_UPDATE_SCHEMA = {
  status: { type: 'enum', values: BOOKING_STATUSES },
  adminNotes: { type: 'string', max: 2000 },
  driverId: { type: 'int', min: 1 },
};

/** Fields staff may change on an existing booking; the total is always re-priced. */
const RESCHEDULE_SCHEMA = {
  carId: { type: 'int', min: 1, required: true },
  pickupAt: { type: 'datetime', required: true },
  returnAt: { type: 'datetime', required: true },
  airportDelivery: { type: 'bool', default: false },
  chauffeur: { type: 'bool', default: false },
  promoCode: { type: 'string', max: 40, default: '' },
  pickupLocation: { type: 'string', max: 200, required: true },
};

/**
 * Validates a rental request and prices it on the server.
 * Client-side totals are never trusted — this is the only pricing path.
 */
export async function prepareQuote(db, input, { enforceNotice = true, excludeBookingId = null } = {}) {
  const request = validate(input, QUOTE_SCHEMA);
  const car = await db.get('SELECT * FROM cars WHERE id = ? AND isActive = 1', [request.carId]);
  if (!car) throw new HttpError(404, 'car_not_found', 'Vehicle not found');

  const settings = await getSettings(db);
  const now = clock.nowLocal();
  const days = countRentalDays(request.pickupAt, request.returnAt);
  if (days === 0) {
    throw new HttpError(400, 'invalid_dates', 'Return must be after pick-up', { fields: { returnAt: 'invalid' } });
  }
  if (days > MAX_RENTAL_DAYS) {
    throw new HttpError(400, 'rental_too_long', 'Rental period is too long', { maxDays: MAX_RENTAL_DAYS });
  }
  if (enforceNotice) {
    const earliest = parseLocalDateTime(now) + settings.minimumNoticeHours * HOUR_MS;
    if (parseLocalDateTime(request.pickupAt) < earliest) {
      throw new HttpError(400, 'pickup_too_soon', 'Pick-up time is too soon', {
        minimumNoticeHours: settings.minimumNoticeHours,
        fields: { pickupAt: 'invalid' },
      });
    }
  }

  const promoCode = request.promoCode.toUpperCase();
  const offerRow = promoCode ? await db.get('SELECT * FROM offers WHERE code = ?', [promoCode]) : null;
  const offerError = promoCode ? offerProblem(offerRow, { days, today: now.slice(0, 10) }) : null;
  const offer = promoCode && !offerError ? offerRow : null;

  const quote = calculateQuote({
    car,
    days,
    airportDelivery: request.airportDelivery,
    chauffeur: request.chauffeur,
    offer,
    settings,
  });

  let unavailableReason = null;
  if (car.status === 'maintenance') unavailableReason = 'car_maintenance';
  else if (await findConflict(db, car.id, request.pickupAt, request.returnAt, excludeBookingId)) unavailableReason = 'car_unavailable';
  else if (await findBlackout(db, car.id, request.pickupAt, request.returnAt)) unavailableReason = 'car_blocked';

  return { request: { ...request, promoCode }, car, offer, offerError, quote, unavailableReason };
}

async function uniqueReference(db) {
  for (;;) {
    const reference = bookingReference();
    if (!(await db.get('SELECT 1 FROM bookings WHERE reference = ?', [reference]))) return reference;
  }
}

export async function getBooking(db, id) {
  const row = await db.get('SELECT * FROM bookings WHERE id = ?', [id]);
  if (!row) throw notFound('Booking');
  return row;
}

/**
 * Creates a booking priced by the server. `channel` overrides the client value
 * (admin phone bookings); `enforceNotice: false` lets staff book same-hour.
 */
export async function createBooking(db, input, { channel, enforceNotice = true, allowBlocked = false } = {}) {
  const details = validate(input, BOOKING_SCHEMA);
  if (!allowBlocked && (await isBlocked(db, details.phone))) {
    throw new HttpError(403, 'customer_blocked', 'This number cannot book online. Please call us.');
  }

  return runExclusive(async () => {
    const { request, car, offer, offerError, quote, unavailableReason } = await prepareQuote(db, details, { enforceNotice });
    if (unavailableReason) {
      throw new HttpError(409, unavailableReason, 'This vehicle is not available for the selected dates');
    }
    if (offerError) {
      throw new HttpError(400, offerError, 'Promo code cannot be applied', { fields: { promoCode: 'invalid' } });
    }

    const reference = await uniqueReference(db);
    const { id } = await db.run(
      `INSERT INTO bookings (reference, carId, carName, customerName, phone, email, pickupLocation, pickupAt,
         returnAt, days, airportDelivery, chauffeur, promoCode, dailyRate, rentalSubtotal, durationDiscount,
         extrasTotal, promoDiscount, totalPrice, deposit, currency, notes, channel)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        reference, car.id, carDisplayName(car), details.customerName, details.phone, details.email,
        details.pickupLocation, request.pickupAt, request.returnAt, quote.days,
        request.airportDelivery ? 1 : 0, request.chauffeur ? 1 : 0, quote.promoCode, quote.dailyRate,
        quote.rentalSubtotal, quote.durationDiscount, quote.extrasTotal, quote.promoDiscount, quote.total,
        quote.deposit, quote.currency, details.notes, channel ?? details.channel,
      ],
    );
    if (offer) await db.run('UPDATE offers SET usageCount = usageCount + 1 WHERE id = ?', [offer.id]);
    await rememberCustomer(db, details);
    return getBooking(db, id);
  });
}

/**
 * Staff edit of a live booking: dates, car, extras or promo code.
 * The total is always recalculated by the pricing engine and the new window
 * is re-checked against other bookings and blocked periods.
 */
export async function rescheduleBooking(db, id, input) {
  const patch = validate(input, RESCHEDULE_SCHEMA);

  return runExclusive(async () => {
    const booking = await getBooking(db, id);
    const { request, car, offer, offerError, quote, unavailableReason } = await prepareQuote(db, patch, {
      enforceNotice: false,
      excludeBookingId: booking.id,
    });
    if (unavailableReason && ACTIVE_STATUSES.has(booking.status)) {
      throw new HttpError(409, unavailableReason, 'This vehicle is not available for the new dates');
    }
    if (offerError) {
      throw new HttpError(400, offerError, 'Promo code cannot be applied', { fields: { promoCode: 'invalid' } });
    }

    await db.run(
      `UPDATE bookings SET carId = ?, carName = ?, pickupAt = ?, returnAt = ?, pickupLocation = ?, days = ?,
         airportDelivery = ?, chauffeur = ?, promoCode = ?, dailyRate = ?, rentalSubtotal = ?, durationDiscount = ?,
         extrasTotal = ?, promoDiscount = ?, totalPrice = ?, deposit = ?, currency = ?, updatedAt = ${NOW_SQL}
       WHERE id = ?`,
      [
        car.id, carDisplayName(car), request.pickupAt, request.returnAt, patch.pickupLocation, quote.days,
        request.airportDelivery ? 1 : 0, request.chauffeur ? 1 : 0, quote.promoCode, quote.dailyRate,
        quote.rentalSubtotal, quote.durationDiscount, quote.extrasTotal, quote.promoDiscount, quote.total,
        quote.deposit, quote.currency, id,
      ],
    );
    if (offer && offer.code !== booking.promoCode) {
      await db.run('UPDATE offers SET usageCount = usageCount + 1 WHERE id = ?', [offer.id]);
    }
    return getBooking(db, id);
  });
}

const PAID_SQL = `(SELECT COALESCE(SUM(CASE WHEN p.kind = 'refund' THEN -p.amount ELSE p.amount END), 0)
                   FROM payments p WHERE p.bookingId = b.id)`;

export function listBookings(db) {
  return db.all(
    `SELECT b.*, c.slug AS carSlug, c.images AS carImages, d.name AS driverName, ${PAID_SQL} AS paid
     FROM bookings b
     LEFT JOIN cars c ON c.id = b.carId
     LEFT JOIN drivers d ON d.id = b.driverId
     ORDER BY b.createdAt DESC, b.id DESC LIMIT 2000`,
  );
}

/** One booking with everything the details panel and the invoice need. */
export async function bookingDetails(db, id) {
  const row = await db.get(
    `SELECT b.*, c.slug AS carSlug, c.images AS carImages, d.name AS driverName, d.phone AS driverPhone, ${PAID_SQL} AS paid
     FROM bookings b
     LEFT JOIN cars c ON c.id = b.carId
     LEFT JOIN drivers d ON d.id = b.driverId
     WHERE b.id = ?`,
    [id],
  );
  if (!row) throw notFound('Booking');
  return row;
}

/** Status changes that re-activate a booking are re-checked for overlaps. */
export async function updateBooking(db, id, input) {
  const patch = validate(input, ADMIN_UPDATE_SCHEMA, { partial: true });

  if (patch.driverId && !(await db.get('SELECT 1 FROM drivers WHERE id = ?', [patch.driverId]))) {
    throw new HttpError(404, 'driver_not_found', 'Driver not found', { fields: { driverId: 'invalid' } });
  }
  // An explicit null clears the assignment; validate() drops absent keys in partial mode.
  if (input && 'driverId' in input && !input.driverId) patch.driverId = null;

  return runExclusive(async () => {
    const booking = await getBooking(db, id);
    const reactivating = patch.status && ACTIVE_STATUSES.has(patch.status) && !ACTIVE_STATUSES.has(booking.status);
    if (reactivating && booking.carId) {
      const conflict = await findConflict(db, booking.carId, booking.pickupAt, booking.returnAt, booking.id);
      if (conflict) {
        throw new HttpError(409, 'car_unavailable', `Overlaps booking ${conflict.reference}`, {
          conflictReference: conflict.reference,
        });
      }
    }
    const columns = Object.keys(patch);
    if (columns.length > 0) {
      await db.run(
        `UPDATE bookings SET ${columns.map((column) => `${column} = ?`).join(', ')}, updatedAt = ${NOW_SQL} WHERE id = ?`,
        [...columns.map((column) => patch[column]), id],
      );
    }
    return getBooking(db, id);
  });
}

export async function deleteBooking(db, id) {
  await getBooking(db, id);
  await db.run('DELETE FROM bookings WHERE id = ?', [id]);
}

export function serializeBooking(row, media) {
  const { carImages, airportDelivery, chauffeur, ...rest } = row;
  let carImage = '';
  if (carImages) {
    try {
      const [first] = media.withThumbs(JSON.parse(carImages));
      carImage = first?.thumb ?? '';
    } catch {
      carImage = '';
    }
  }
  const paid = rest.paid ?? 0;
  return {
    ...rest,
    carImage,
    airportDelivery: airportDelivery === 1,
    chauffeur: chauffeur === 1,
    paid,
    balance: rest.totalPrice - paid,
  };
}

/** The subset of a booking returned to the customer who made it. */
export function customerBookingView(row) {
  return {
    reference: row.reference,
    carName: row.carName,
    pickupAt: row.pickupAt,
    returnAt: row.returnAt,
    pickupLocation: row.pickupLocation,
    days: row.days,
    airportDelivery: row.airportDelivery === 1,
    chauffeur: row.chauffeur === 1,
    promoCode: row.promoCode,
    rentalSubtotal: row.rentalSubtotal,
    durationDiscount: row.durationDiscount,
    extrasTotal: row.extrasTotal,
    promoDiscount: row.promoDiscount,
    totalPrice: row.totalPrice,
    deposit: row.deposit,
    currency: row.currency,
    status: row.status,
  };
}
