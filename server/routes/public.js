import express from 'express';
import { HttpError } from '../lib/http.js';
import { calculateQuote, countRentalDays } from '../lib/pricing.js';
import { limiter } from '../lib/rate-limit.js';
import { clock } from '../lib/time.js';
import { validate } from '../lib/validate.js';
import { busyCarIds, reservedWindows } from '../services/availability.js';
import { createBooking, customerBookingView, prepareQuote } from '../services/bookings.js';
import { getCar, listCars, serializeCar } from '../services/cars.js';
import { recordExchange } from '../services/chats.js';
import { listContent } from '../services/content.js';
import { createMessage } from '../services/messages.js';
import { listPublicOffers } from '../services/offers.js';
import { getSettings, publicSettings } from '../services/settings.js';
import { notifyNewBooking } from '../services/webhook.js';

const WINDOW_SCHEMA = {
  pickupAt: { type: 'datetime' },
  returnAt: { type: 'datetime' },
};

function availabilityOf(row, busy, hasWindow) {
  if (row.status === 'maintenance') return 'maintenance';
  if (busy.has(row.id)) return hasWindow ? 'booked' : 'on_rent';
  return 'available';
}

export function publicRoutes({ db, media, concierge, rateLimited }) {
  const router = express.Router();
  const writeLimit = limiter({ windowMinutes: 15, limit: 20, enabled: rateLimited });
  const chatLimit = limiter({ windowMinutes: 5, limit: 40, enabled: rateLimited });

  router.get('/settings', async (_req, res) => {
    res.json(publicSettings(await getSettings(db)));
  });

  /** Fleet listing. With ?pickupAt&returnAt it adds per-car availability and a rental quote for that window. */
  router.get('/cars', async (req, res) => {
    const { pickupAt, returnAt } = validate(req.query, WINDOW_SCHEMA);
    let window = null;
    if (pickupAt || returnAt) {
      const days = countRentalDays(pickupAt, returnAt);
      if (days === 0) throw new HttpError(400, 'invalid_dates', 'Return must be after pick-up');
      window = { pickupAt, returnAt, days };
    }

    const now = clock.nowLocal();
    const [rows, settings, busy] = await Promise.all([
      listCars(db),
      getSettings(db),
      window ? busyCarIds(db, window.pickupAt, window.returnAt) : busyCarIds(db, now, now, { confirmedOnly: true }),
    ]);

    const cars = rows.map((row) => ({
      ...serializeCar(row, media),
      availability: availabilityOf(row, busy, Boolean(window)),
      quote: window ? calculateQuote({ car: row, days: window.days, settings }) : null,
    }));
    res.json({ cars, window });
  });

  router.get('/cars/:slug', async (req, res) => {
    const row = await getCar(db, req.params.slug);
    const now = clock.nowLocal();
    const [reserved, busy, similarRows] = await Promise.all([
      reservedWindows(db, row.id, now),
      busyCarIds(db, now, now, { confirmedOnly: true }),
      db.all(
        `SELECT * FROM cars WHERE isActive = 1 AND category = ? AND id != ?
         ORDER BY isFeatured DESC, ABS(dailyRate - ?) ASC LIMIT 4`,
        [row.category, row.id, row.dailyRate],
      ),
    ]);
    res.json({
      car: { ...serializeCar(row, media), availability: availabilityOf(row, busy, false) },
      reserved,
      similar: similarRows.map((similar) => serializeCar(similar, media)),
    });
  });

  router.post('/quote', async (req, res) => {
    const { quote, offerError, unavailableReason } = await prepareQuote(db, req.body);
    res.json({ quote, offerError, available: !unavailableReason, unavailableReason });
  });

  router.post('/bookings', writeLimit, async (req, res) => {
    const booking = await createBooking(db, req.body);
    notifyNewBooking(db, booking);
    res.status(201).json({ booking: customerBookingView(booking) });
  });

  router.get('/offers', async (_req, res) => {
    res.json({ offers: await listPublicOffers(db, clock.nowLocal().slice(0, 10)) });
  });

  router.post('/messages', writeLimit, async (req, res) => {
    await createMessage(db, req.body);
    res.status(201).json({ ok: true });
  });

  router.post('/chat', chatLimit, async (req, res) => {
    const message = typeof req.body?.message === 'string' ? req.body.message.trim().slice(0, 500) : '';
    if (!message) throw new HttpError(400, 'validation_failed', 'Message is required', { fields: { message: 'required' } });
    const lang = req.body.lang === 'ar' || /[؀-ۿ]/.test(message) ? 'ar' : 'en';

    const [rows, settings, offers] = await Promise.all([
      listCars(db),
      getSettings(db),
      listPublicOffers(db, clock.nowLocal().slice(0, 10)),
    ]);
    const cars = rows.map((row) => {
      const car = serializeCar(row, media);
      return { ...car, image: car.images[0]?.thumb ?? '' };
    });
    const answer = concierge({ message, lang, cars, settings, offers });

    // Saved so the owner can read every website conversation in the admin panel.
    // Awaited so two quick questions always land in order; a storage failure never breaks the reply.
    await recordExchange(db, { sessionKey: req.body?.sessionKey, lang, question: message, answer: answer.reply }).catch(
      (err) => console.warn('chat transcript not saved:', err.message),
    );
    res.json(answer);
  });

  /** Reviews and FAQ shown on the website — edited from the admin panel. */
  router.get('/content', async (_req, res) => {
    const [testimonials, faqs] = await Promise.all([
      listContent(db, 'testimonials', { activeOnly: true }),
      listContent(db, 'faqs', { activeOnly: true }),
    ]);
    res.json({ testimonials, faqs });
  });

  return router;
}
