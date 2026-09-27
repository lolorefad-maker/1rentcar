import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { calculateQuote, countRentalDays, durationDiscountPercent, offerProblem, parseLocalDateTime } from '../server/lib/pricing.js';

const SETTINGS = { airportFee: 50, chauffeurDailyRate: 100, weeklyDiscountPercent: 0, monthlyDiscountPercent: 0, currency: 'USD' };

describe('parseLocalDateTime', () => {
  it('accepts wall-clock values and rejects impossible dates', () => {
    assert.equal(typeof parseLocalDateTime('2030-02-28T10:00'), 'number');
    assert.equal(parseLocalDateTime('2030-02-30T10:00'), null);
    assert.equal(parseLocalDateTime('2030-01-01T24:00'), null);
    assert.equal(parseLocalDateTime('01/01/2030'), null);
    assert.equal(parseLocalDateTime(undefined), null);
  });
});

describe('countRentalDays', () => {
  it('bills every started 24 hours as a day', () => {
    assert.equal(countRentalDays('2030-01-01T10:00', '2030-01-02T10:00'), 1);
    assert.equal(countRentalDays('2030-01-01T10:00', '2030-01-02T10:01'), 2);
    assert.equal(countRentalDays('2030-01-01T10:00', '2030-01-01T12:00'), 1);
    assert.equal(countRentalDays('2030-01-01T10:00', '2030-01-08T10:00'), 7);
  });

  it('returns 0 for empty or reversed ranges', () => {
    assert.equal(countRentalDays('2030-01-02T10:00', '2030-01-01T10:00'), 0);
    assert.equal(countRentalDays('2030-01-01T10:00', '2030-01-01T10:00'), 0);
    assert.equal(countRentalDays('bad', '2030-01-01T10:00'), 0);
  });
});

describe('durationDiscountPercent', () => {
  const settings = { weeklyDiscountPercent: 10, monthlyDiscountPercent: 20 };
  it('applies weekly from 7 days and monthly from 28 days', () => {
    assert.equal(durationDiscountPercent(6, settings), 0);
    assert.equal(durationDiscountPercent(7, settings), 10);
    assert.equal(durationDiscountPercent(27, settings), 10);
    assert.equal(durationDiscountPercent(28, settings), 20);
  });

  it('falls back to weekly when no monthly rate is configured', () => {
    assert.equal(durationDiscountPercent(30, { weeklyDiscountPercent: 10, monthlyDiscountPercent: 0 }), 10);
  });
});

describe('offerProblem', () => {
  const offer = { isActive: 1, validUntil: '2030-06-30', minDays: 3 };
  it('explains why an offer cannot be used', () => {
    assert.equal(offerProblem(null, { days: 5, today: '2030-01-01' }), 'offer_not_found');
    assert.equal(offerProblem({ ...offer, isActive: 0 }, { days: 5, today: '2030-01-01' }), 'offer_inactive');
    assert.equal(offerProblem(offer, { days: 5, today: '2030-07-01' }), 'offer_expired');
    assert.equal(offerProblem(offer, { days: 2, today: '2030-01-01' }), 'offer_min_days');
    assert.equal(offerProblem(offer, { days: 3, today: '2030-06-30' }), null);
  });
});

describe('calculateQuote', () => {
  it('prices rental + extras', () => {
    const quote = calculateQuote({ car: { dailyRate: 300, deposit: 500 }, days: 3, airportDelivery: true, chauffeur: true, settings: SETTINGS });
    assert.equal(quote.rentalSubtotal, 900);
    assert.equal(quote.airportFee, 50);
    assert.equal(quote.chauffeurFee, 300);
    assert.equal(quote.total, 1250);
    assert.equal(quote.deposit, 500);
  });

  it('applies the long-rental discount to the rental only, then the promo to the running subtotal', () => {
    const settings = { ...SETTINGS, weeklyDiscountPercent: 10 };
    const quote = calculateQuote({
      car: { dailyRate: 200 },
      days: 7,
      airportDelivery: true,
      offer: { code: 'VIP', discountPercent: 15 },
      settings,
    });
    assert.equal(quote.rentalSubtotal, 1400);
    assert.equal(quote.durationDiscount, 140);
    assert.equal(quote.promoDiscount, Math.round((1400 - 140 + 50) * 0.15));
    assert.equal(quote.total, 1400 - 140 + 50 - quote.promoDiscount);
    assert.equal(quote.promoCode, 'VIP');
  });
});
