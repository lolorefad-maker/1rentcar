import { getSettings } from './settings.js';

const TIMEOUT_MS = 6000;

/**
 * Lead payload for automations (n8n). Field names are kept compatible with the
 * existing "Luxury Motors - Lead Automation" workflow.
 */
export function bookingPayload(booking) {
  return {
    id: booking.id,
    reference: booking.reference,
    customerName: booking.customerName,
    email: booking.email,
    phone: booking.phone,
    carInterest: booking.carName,
    pickupLocation: booking.pickupLocation,
    pickupDate: booking.pickupAt,
    returnDate: booking.returnAt,
    days: booking.days,
    airportPickup: booking.airportDelivery ? 'Yes' : 'No',
    privateDriver: booking.chauffeur ? 'Yes' : 'No',
    promoCode: booking.promoCode,
    totalPrice: booking.totalPrice,
    currency: booking.currency,
    channel: booking.channel,
    status: booking.status,
    timestamp: new Date().toISOString(),
  };
}

export async function postWebhook(url, payload) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  return { ok: response.ok, status: response.status };
}

/** Fire-and-forget: a slow or failing automation must never block a customer booking. */
export function notifyNewBooking(db, booking) {
  getSettings(db)
    .then(({ webhookUrl }) => webhookUrl && postWebhook(webhookUrl, bookingPayload(booking)))
    .catch((err) => console.warn(`Webhook delivery failed for ${booking.reference}: ${err.message}`));
}

export const SAMPLE_BOOKING = Object.freeze({
  id: 0,
  reference: 'LM-TEST01',
  customerName: 'Webhook Test',
  email: 'test@example.com',
  phone: '+962 79 000 0000',
  carName: 'Rolls-Royce Ghost',
  pickupLocation: 'Queen Alia International Airport',
  pickupAt: '2030-01-01T10:00',
  returnAt: '2030-01-04T10:00',
  days: 3,
  airportDelivery: 1,
  chauffeur: 0,
  promoCode: '',
  totalPrice: 3650,
  currency: 'USD',
  channel: 'test',
  status: 'pending',
});
