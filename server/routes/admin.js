import express from 'express';
import { HttpError, idParam } from '../lib/http.js';
import { limiter } from '../lib/rate-limit.js';
import { clock } from '../lib/time.js';
import { logActivity } from '../services/activity.js';
import { changePassword, login, logout, requireAdmin, requireRole, sessionInfo } from '../services/auth.js';
import { bookingDetails, createBooking, deleteBooking, listBookings, prepareQuote, serializeBooking, updateBooking } from '../services/bookings.js';
import { createCar, deleteCar, listCars, serializeCar, updateCar } from '../services/cars.js';
import { deleteMessage, listMessages, serializeMessage, setMessageRead } from '../services/messages.js';
import { createOffer, deleteOffer, listOffers, serializeOffer, updateOffer } from '../services/offers.js';
import { buildOverview } from '../services/reports.js';
import { getSettings, updateSettings } from '../services/settings.js';
import { saveUpload } from '../services/uploads.js';
import { SAMPLE_BOOKING, bookingPayload, notifyNewBooking, postWebhook } from '../services/webhook.js';
import { operationsRoutes } from './admin-ops.js';

const MAX_UPLOAD = '10mb';

export function adminRoutes({ db, media, config, rateLimited }) {
  const router = express.Router();
  const loginLimit = limiter({ windowMinutes: 15, limit: 10, enabled: rateLimited, skipSuccessfulRequests: true });

  router.post('/login', loginLimit, async (req, res) => {
    const result = await login(db, req.body);
    logActivity(db, result.user, { action: 'auth.login', entity: 'user', entityId: result.user.id });
    res.json(result);
  });

  router.use(requireAdmin(db));

  const manager = requireRole('manager');
  const track = (req, entry) => logActivity(db, req.user, entry);

  // --- Session -----------------------------------------------------------
  router.get('/session', async (req, res) => res.json(await sessionInfo(db, req.adminToken)));

  router.post('/logout', async (req, res) => {
    await logout(db, req.adminToken);
    res.json({ ok: true });
  });

  router.put('/password', async (req, res) => {
    await changePassword(db, req.adminToken, req.body);
    res.json({ ok: true });
  });

  // --- Dashboard -----------------------------------------------------------
  router.get('/overview', async (_req, res) => res.json(await buildOverview(db, clock.nowLocal())));

  // --- Fleet -----------------------------------------------------------------
  router.get('/cars', async (_req, res) => {
    const rows = await listCars(db, { includeInactive: true });
    res.json({ cars: rows.map((row) => serializeCar(row, media, { includePrivate: true })) });
  });

  router.post('/cars', manager, async (req, res) => {
    const car = await createCar(db, req.body);
    track(req, { action: 'car.create', entity: 'car', entityId: car.id, summary: `${car.brand} ${car.model}` });
    res.status(201).json({ car: serializeCar(car, media, { includePrivate: true }) });
  });

  router.put('/cars/:id', manager, async (req, res) => {
    const id = idParam(req.params.id, 'Vehicle');
    const before = await db.get('SELECT dailyRate FROM cars WHERE id = ?', [id]);
    const car = await updateCar(db, id, req.body);
    const priceNote = before && before.dailyRate !== car.dailyRate ? ` — rate ${before.dailyRate} → ${car.dailyRate}` : '';
    track(req, { action: 'car.update', entity: 'car', entityId: id, summary: `${car.brand} ${car.model}${priceNote}` });
    res.json({ car: serializeCar(car, media, { includePrivate: true }) });
  });

  router.delete('/cars/:id', manager, async (req, res) => {
    const id = idParam(req.params.id, 'Vehicle');
    await deleteCar(db, id, clock.nowLocal());
    track(req, { action: 'car.delete', entity: 'car', entityId: id, summary: 'Removed a vehicle' });
    res.json({ ok: true });
  });

  // --- Bookings ----------------------------------------------------------------
  router.get('/bookings', async (_req, res) => {
    const rows = await listBookings(db);
    res.json({ bookings: rows.map((row) => serializeBooking(row, media)) });
  });

  /**
   * Staff quotes use the same pricing engine but skip the customer minimum-notice rule.
   * `excludeBookingId` ignores the booking being edited, so it never clashes with itself.
   */
  router.post('/quote', async (req, res) => {
    const excludeBookingId = Number.isInteger(req.body?.excludeBookingId) ? req.body.excludeBookingId : null;
    const { quote, offerError, unavailableReason } = await prepareQuote(db, req.body, { enforceNotice: false, excludeBookingId });
    res.json({ quote, offerError, available: !unavailableReason, unavailableReason });
  });

  /** Phone / walk-in bookings entered by staff: same pricing, no minimum-notice rule. */
  router.post('/bookings', async (req, res) => {
    const booking = await createBooking(db, req.body, { channel: 'admin', enforceNotice: false, allowBlocked: true });
    track(req, { action: 'booking.create', entity: 'booking', entityId: booking.id, summary: `${booking.reference} · ${booking.carName}` });
    notifyNewBooking(db, booking);
    res.status(201).json({ booking: serializeBooking(booking, media) });
  });

  router.patch('/bookings/:id', async (req, res) => {
    const id = idParam(req.params.id, 'Booking');
    const booking = await updateBooking(db, id, req.body);
    if (req.body?.status) {
      track(req, { action: 'booking.status', entity: 'booking', entityId: id, summary: `${booking.reference} → ${booking.status}` });
    }
    res.json({ booking: serializeBooking(await bookingDetails(db, id), media) });
  });

  router.delete('/bookings/:id', manager, async (req, res) => {
    const id = idParam(req.params.id, 'Booking');
    await deleteBooking(db, id);
    track(req, { action: 'booking.delete', entity: 'booking', entityId: id, summary: 'Deleted a booking' });
    res.json({ ok: true });
  });

  // --- Inbox -------------------------------------------------------------------
  router.get('/messages', async (_req, res) => {
    res.json({ messages: (await listMessages(db)).map(serializeMessage) });
  });

  router.patch('/messages/:id', async (req, res) => {
    const message = await setMessageRead(db, idParam(req.params.id, 'Message'), Boolean(req.body?.isRead));
    res.json({ message: serializeMessage(message) });
  });

  router.delete('/messages/:id', async (req, res) => {
    await deleteMessage(db, idParam(req.params.id, 'Message'));
    res.json({ ok: true });
  });

  // --- Offers ------------------------------------------------------------------
  router.get('/offers', async (_req, res) => {
    res.json({ offers: (await listOffers(db)).map(serializeOffer) });
  });

  router.post('/offers', manager, async (req, res) => {
    const offer = await createOffer(db, req.body);
    track(req, { action: 'offer.create', entity: 'offer', entityId: offer.id, summary: offer.code });
    res.status(201).json({ offer: serializeOffer(offer) });
  });

  router.put('/offers/:id', manager, async (req, res) => {
    const offer = await updateOffer(db, idParam(req.params.id, 'Offer'), req.body);
    track(req, { action: 'offer.update', entity: 'offer', entityId: offer.id, summary: offer.code });
    res.json({ offer: serializeOffer(offer) });
  });

  router.delete('/offers/:id', manager, async (req, res) => {
    const id = idParam(req.params.id, 'Offer');
    await deleteOffer(db, id);
    track(req, { action: 'offer.delete', entity: 'offer', entityId: id, summary: 'Deleted a promo code' });
    res.json({ ok: true });
  });

  // --- Settings & automation -----------------------------------------------------
  router.get('/settings', async (_req, res) => res.json({ settings: await getSettings(db) }));

  router.put('/settings', manager, async (req, res) => {
    const settings = await updateSettings(db, req.body);
    track(req, { action: 'settings.update', entity: 'settings', summary: Object.keys(req.body ?? {}).join(', ').slice(0, 200) });
    res.json({ settings });
  });

  router.post('/webhook/test', manager, async (req, res) => {
    const url = typeof req.body?.url === 'string' && req.body.url.trim() ? req.body.url.trim() : (await getSettings(db)).webhookUrl;
    if (!/^https?:\/\/\S+$/i.test(url ?? '')) {
      throw new HttpError(400, 'validation_failed', 'Enter a valid webhook URL first', { fields: { webhookUrl: 'invalid' } });
    }
    try {
      res.json(await postWebhook(url, bookingPayload(SAMPLE_BOOKING)));
    } catch (err) {
      throw new HttpError(502, 'webhook_unreachable', `Could not reach the webhook: ${err.message}`);
    }
  });

  // --- Media ---------------------------------------------------------------------
  router.get('/media', async (_req, res) => res.json({ images: await media.list() }));

  router.post('/uploads', manager, express.raw({ type: () => true, limit: MAX_UPLOAD }), async (req, res) => {
    const src = await saveUpload(config.publicDir, req.body);
    res.status(201).json({ image: { src, thumb: src, group: 'uploads' } });
  });

  // --- Operations (calendar, inventory, money, people, content) ---------------------
  router.use(operationsRoutes({ db, media }));

  return router;
}
