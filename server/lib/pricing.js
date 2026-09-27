/**
 * Pricing engine — the single source of truth for every price shown on the
 * site, stored on a booking, or sent to automations. Pure functions only.
 */

const MS_PER_DAY = 86_400_000;
const LOCAL_DATETIME_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/**
 * Parses a wall-clock "YYYY-MM-DDTHH:mm" value (as produced by
 * <input type="datetime-local">) into a timezone-free timestamp.
 * Returns null for malformed or impossible dates.
 */
export function parseLocalDateTime(value) {
  const match = LOCAL_DATETIME_RE.exec(value ?? '');
  if (!match) return null;
  const [year, month, day, hour, minute] = match.slice(1).map(Number);
  if (hour > 23 || minute > 59) return null;
  const timestamp = Date.UTC(year, month - 1, day, hour, minute);
  const check = new Date(timestamp);
  return check.getUTCMonth() === month - 1 && check.getUTCDate() === day ? timestamp : null;
}

/** Billable days: every started 24h block counts as a full day. 0 when the range is invalid. */
export function countRentalDays(pickupAt, returnAt) {
  const start = parseLocalDateTime(pickupAt);
  const end = parseLocalDateTime(returnAt);
  if (start === null || end === null || end <= start) return 0;
  return Math.ceil((end - start) / MS_PER_DAY);
}

/** Long-rental discount: monthly (28+ days) wins over weekly (7+ days) when configured. */
export function durationDiscountPercent(days, settings) {
  if (days >= 28 && settings.monthlyDiscountPercent > 0) return settings.monthlyDiscountPercent;
  if (days >= 7 && settings.weeklyDiscountPercent > 0) return settings.weeklyDiscountPercent;
  return 0;
}

/** Returns an error code explaining why an offer cannot be applied, or null when it can. */
export function offerProblem(offer, { days, today }) {
  if (!offer) return 'offer_not_found';
  if (!offer.isActive) return 'offer_inactive';
  if (offer.validUntil && offer.validUntil < today) return 'offer_expired';
  if (days < (offer.minDays || 1)) return 'offer_min_days';
  return null;
}

const percentOf = (amount, percent) => Math.round((amount * percent) / 100);

/**
 * Full price breakdown for a rental.
 * Order: rental subtotal → long-rental discount → extras → promo code (on the running subtotal).
 */
export function calculateQuote({ car, days, airportDelivery = false, chauffeur = false, offer = null, settings }) {
  const rentalSubtotal = car.dailyRate * days;
  const durationPercent = durationDiscountPercent(days, settings);
  const durationDiscount = percentOf(rentalSubtotal, durationPercent);
  const airportFee = airportDelivery ? settings.airportFee : 0;
  const chauffeurFee = chauffeur ? settings.chauffeurDailyRate * days : 0;
  const extrasTotal = airportFee + chauffeurFee;
  const subtotal = rentalSubtotal - durationDiscount + extrasTotal;
  const promoPercent = offer ? offer.discountPercent : 0;
  const promoDiscount = percentOf(subtotal, promoPercent);

  return {
    days,
    dailyRate: car.dailyRate,
    rentalSubtotal,
    durationPercent,
    durationDiscount,
    airportFee,
    chauffeurFee,
    extrasTotal,
    promoCode: offer ? offer.code : '',
    promoPercent,
    promoDiscount,
    total: subtotal - promoDiscount,
    deposit: car.deposit || 0,
    currency: settings.currency,
  };
}
