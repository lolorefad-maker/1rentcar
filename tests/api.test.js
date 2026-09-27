import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { ADMIN_PASSWORD, startServer } from './helpers.js';

let srv;
let token;

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);

before(async () => {
  srv = await startServer();
  token = await srv.login();
});

after(async () => {
  await srv?.close();
});

const admin = (method, url, options = {}) => srv.request(method, `/api/admin${url}`, { ...options, token });
const pub = (method, url, options = {}) => srv.request(method, `/api${url}`, options);

async function firstCar() {
  const { body } = await pub('GET', '/cars');
  return body.cars[0];
}

function bookingBody(carId, overrides = {}) {
  return {
    carId,
    pickupAt: '2030-02-01T10:00',
    returnAt: '2030-02-04T10:00',
    customerName: 'Test Customer',
    phone: '+962 79 123 4567',
    email: 'test@example.com',
    pickupLocation: 'Queen Alia International Airport',
    ...overrides,
  };
}

describe('public catalogue', () => {
  it('seeds the curated fleet with images and thumbnails', async () => {
    const { status, body } = await pub('GET', '/cars');
    assert.equal(status, 200);
    assert.equal(body.cars.length, 68);
    assert.ok(body.cars[0].isFeatured, 'featured cars are listed first');
    for (const car of body.cars) {
      assert.ok(car.images.length > 0, `${car.slug} has photos`);
      assert.ok(car.images[0].thumb.endsWith('-640.webp'), `${car.slug} has a card thumbnail`);
      assert.equal(car.availability, 'available');
    }
  });

  it('serves a car by slug with similar cars, and 404s unknown slugs', async () => {
    const { body } = await pub('GET', '/cars/rolls-royce-ghost-2021');
    assert.equal(body.car.brand, 'Rolls-Royce');
    assert.ok(Array.isArray(body.reserved));
    assert.ok(body.similar.every((car) => car.category === 'luxury'));
    assert.equal((await pub('GET', '/cars/does-not-exist')).status, 404);
  });

  it('never exposes private settings', async () => {
    const { body } = await pub('GET', '/settings');
    assert.equal(body.businessName, 'Luxury Motors');
    assert.ok(!('webhookUrl' in body));
  });

  it('rejects an invalid availability window', async () => {
    const { status, body } = await pub('GET', '/cars?pickupAt=2030-02-05T10:00&returnAt=2030-02-01T10:00');
    assert.equal(status, 400);
    assert.equal(body.error.code, 'invalid_dates');
  });
});

describe('admin authentication', () => {
  it('protects every admin endpoint', async () => {
    for (const url of ['/cars', '/bookings', '/messages', '/offers', '/settings', '/overview', '/media']) {
      const { status } = await srv.request('GET', `/api/admin${url}`);
      assert.equal(status, 401, url);
    }
    const bogus = await srv.request('GET', '/api/admin/cars', { token: 'not-a-token' });
    assert.equal(bogus.status, 401);
  });

  it('rejects a wrong password and reports the default password', async () => {
    const wrong = await pub('POST', '/admin/login', { body: { password: 'nope' } });
    assert.equal(wrong.status, 401);
    assert.equal(wrong.body.error.code, 'invalid_credentials');
    const session = await admin('GET', '/session');
    assert.equal(session.body.usingDefaultPassword, true);
  });
});

describe('fleet management (admin ↔ website sync)', () => {
  it('a price changed in admin is used by the website, quotes and bookings', async () => {
    const car = await firstCar();
    const updated = await admin('PUT', `/cars/${car.id}`, { body: { dailyRate: 1500 } });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.car.dailyRate, 1500);

    const listed = (await pub('GET', '/cars')).body.cars.find((c) => c.id === car.id);
    assert.equal(listed.dailyRate, 1500);

    const quote = await pub('POST', '/quote', { body: { carId: car.id, pickupAt: '2030-03-01T10:00', returnAt: '2030-03-03T10:00' } });
    assert.equal(quote.body.quote.rentalSubtotal, 3000);

    const booking = await pub('POST', '/bookings', {
      body: bookingBody(car.id, { pickupAt: '2030-03-01T10:00', returnAt: '2030-03-03T10:00', totalPrice: 1 }),
    });
    assert.equal(booking.status, 201);
    assert.equal(booking.body.booking.totalPrice, 3000, 'client-sent totals are ignored');
  });

  it('validates, creates, hides and deletes a car', async () => {
    const invalid = await admin('POST', '/cars', { body: { model: 'X' } });
    assert.equal(invalid.status, 400);
    assert.equal(invalid.body.error.details.fields.brand, 'required');
    assert.equal(invalid.body.error.details.fields.dailyRate, 'required');

    const badImage = await admin('POST', '/cars', {
      body: { brand: 'Test', model: 'Car', category: 'suv', seats: 5, fuel: 'petrol', dailyRate: 99, images: ['https://evil.example/x.jpg'] },
    });
    assert.equal(badImage.status, 400);

    const created = await admin('POST', '/cars', {
      body: { brand: 'Test', model: 'Roadster', year: 2030, category: 'sports', seats: 2, fuel: 'electric', dailyRate: 99, images: ['/media/cars/polestar-2/cover.webp'] },
    });
    assert.equal(created.status, 201);
    const car = created.body.car;
    assert.equal(car.slug, 'test-roadster-2030');
    assert.equal(car.images[0].thumb, '/media/cars/polestar-2/cover-640.webp');
    assert.ok((await pub('GET', `/cars/${car.slug}`)).status === 200);

    await admin('PUT', `/cars/${car.id}`, { body: { isActive: false } });
    assert.equal((await pub('GET', `/cars/${car.slug}`)).status, 404, 'hidden cars disappear from the website');
    assert.ok(!(await pub('GET', '/cars')).body.cars.some((c) => c.id === car.id));
    assert.ok((await admin('GET', '/cars')).body.cars.some((c) => c.id === car.id), 'admin still sees hidden cars');

    const deleted = await admin('DELETE', `/cars/${car.id}`);
    assert.equal(deleted.status, 200);
    assert.equal((await admin('DELETE', `/cars/${car.id}`)).status, 404);
  });

  it('blocks deleting a car that has upcoming bookings', async () => {
    const car = (await pub('GET', '/cars')).body.cars[5];
    const booking = await pub('POST', '/bookings', { body: bookingBody(car.id, { pickupAt: '2030-04-01T10:00', returnAt: '2030-04-02T10:00' }) });
    assert.equal(booking.status, 201);
    const blocked = await admin('DELETE', `/cars/${car.id}`);
    assert.equal(blocked.status, 409);
    assert.equal(blocked.body.error.code, 'car_has_active_bookings');
    assert.equal(blocked.body.error.details.count, 1);
  });

  it('maintenance cars cannot be booked', async () => {
    const car = (await pub('GET', '/cars')).body.cars[6];
    await admin('PUT', `/cars/${car.id}`, { body: { status: 'maintenance' } });
    const quote = await pub('POST', '/quote', { body: { carId: car.id, pickupAt: '2030-02-01T10:00', returnAt: '2030-02-02T10:00' } });
    assert.equal(quote.body.available, false);
    assert.equal(quote.body.unavailableReason, 'car_maintenance');
    const booking = await pub('POST', '/bookings', { body: bookingBody(car.id) });
    assert.equal(booking.status, 409);
    assert.equal(booking.body.error.code, 'car_maintenance');
    await admin('PUT', `/cars/${car.id}`, { body: { status: 'available' } });
  });
});

describe('settings drive pricing', () => {
  it('fees and long-rental discounts from admin settings apply to quotes', async () => {
    const car = (await pub('GET', '/cars')).body.cars[10];
    const saved = await admin('PUT', '/settings', {
      body: { airportFee: 80, chauffeurDailyRate: 120, weeklyDiscountPercent: 10, monthlyDiscountPercent: 20, currency: 'JOD' },
    });
    assert.equal(saved.status, 200);

    const { body } = await pub('POST', '/quote', {
      body: { carId: car.id, pickupAt: '2030-05-01T10:00', returnAt: '2030-05-08T10:00', airportDelivery: true, chauffeur: true },
    });
    const rental = car.dailyRate * 7;
    assert.equal(body.quote.durationPercent, 10);
    assert.equal(body.quote.durationDiscount, Math.round(rental * 0.1));
    assert.equal(body.quote.airportFee, 80);
    assert.equal(body.quote.chauffeurFee, 840);
    assert.equal(body.quote.currency, 'JOD');
    assert.equal(body.quote.total, rental - Math.round(rental * 0.1) + 80 + 840);

    assert.equal((await pub('GET', '/settings')).body.currency, 'JOD');
    await admin('PUT', '/settings', { body: { airportFee: 50, chauffeurDailyRate: 100, weeklyDiscountPercent: 0, monthlyDiscountPercent: 0, currency: 'USD' } });
  });

  it('rejects invalid settings', async () => {
    const bad = await admin('PUT', '/settings', { body: { airportFee: -5, currency: 'XXX', webhookUrl: 'ftp://nope' } });
    assert.equal(bad.status, 400);
    assert.deepEqual(Object.keys(bad.body.error.details.fields).sort(), ['airportFee', 'currency']);
    const badUrl = await admin('PUT', '/settings', { body: { webhookUrl: 'ftp://nope' } });
    assert.equal(badUrl.status, 400);
    assert.equal(badUrl.body.error.details.fields.webhookUrl, 'invalid');
  });

  it('normalises the WhatsApp number to digits', async () => {
    const { body } = await admin('PUT', '/settings', { body: { whatsapp: '+962 79-000 9000' } });
    assert.equal(body.settings.whatsapp, '962790009000');
  });
});

describe('offers', () => {
  let offerId;
  const car = () => pub('GET', '/cars').then((r) => r.body.cars[12]);

  it('creates an offer and applies it with its conditions', async () => {
    const created = await admin('POST', '/offers', { body: { code: 'test20', discountPercent: 20, minDays: 3, descriptionEn: '20% off' } });
    assert.equal(created.status, 201);
    assert.equal(created.body.offer.code, 'TEST20');
    offerId = created.body.offer.id;

    const { id } = await car();
    const short = await pub('POST', '/quote', { body: { carId: id, pickupAt: '2030-06-01T10:00', returnAt: '2030-06-03T10:00', promoCode: 'TEST20' } });
    assert.equal(short.body.offerError, 'offer_min_days');
    assert.equal(short.body.quote.promoDiscount, 0);

    const ok = await pub('POST', '/quote', { body: { carId: id, pickupAt: '2030-06-01T10:00', returnAt: '2030-06-04T10:00', promoCode: 'test20' } });
    assert.equal(ok.body.offerError, null);
    assert.equal(ok.body.quote.promoDiscount, Math.round(ok.body.quote.rentalSubtotal * 0.2));

    const unknown = await pub('POST', '/quote', { body: { carId: id, pickupAt: '2030-06-01T10:00', returnAt: '2030-06-04T10:00', promoCode: 'NOPE' } });
    assert.equal(unknown.body.offerError, 'offer_not_found');
  });

  it('counts usage when a booking uses the code, and rejects invalid codes at booking time', async () => {
    const { id } = await car();
    const booked = await pub('POST', '/bookings', { body: bookingBody(id, { pickupAt: '2030-06-10T10:00', returnAt: '2030-06-14T10:00', promoCode: 'TEST20' }) });
    assert.equal(booked.status, 201);
    assert.ok(booked.body.booking.promoDiscount > 0);
    const offer = (await admin('GET', '/offers')).body.offers.find((o) => o.id === offerId);
    assert.equal(offer.usageCount, 1);

    const rejected = await pub('POST', '/bookings', { body: bookingBody(id, { pickupAt: '2030-07-10T10:00', returnAt: '2030-07-11T10:00', promoCode: 'TEST20' }) });
    assert.equal(rejected.status, 400);
    assert.equal(rejected.body.error.code, 'offer_min_days');
  });

  it('respects active / public / expiry flags and unique codes', async () => {
    assert.ok((await pub('GET', '/offers')).body.offers.some((o) => o.code === 'TEST20'));
    await admin('PUT', `/offers/${offerId}`, { body: { isPublic: false } });
    assert.ok(!(await pub('GET', '/offers')).body.offers.some((o) => o.code === 'TEST20'), 'private offers are hidden');

    await admin('PUT', `/offers/${offerId}`, { body: { isActive: false } });
    const { id } = await car();
    const inactive = await pub('POST', '/quote', { body: { carId: id, pickupAt: '2030-06-01T10:00', returnAt: '2030-06-05T10:00', promoCode: 'TEST20' } });
    assert.equal(inactive.body.offerError, 'offer_inactive');

    await admin('PUT', `/offers/${offerId}`, { body: { isActive: true, validUntil: '2029-12-31' } });
    const expired = await pub('POST', '/quote', { body: { carId: id, pickupAt: '2030-06-01T10:00', returnAt: '2030-06-05T10:00', promoCode: 'TEST20' } });
    assert.equal(expired.body.offerError, 'offer_expired');

    const duplicate = await admin('POST', '/offers', { body: { code: 'TEST20', discountPercent: 5 } });
    assert.equal(duplicate.status, 409);
    assert.equal(duplicate.body.error.code, 'offer_code_taken');

    assert.equal((await admin('DELETE', `/offers/${offerId}`)).status, 200);
    assert.ok(!(await admin('GET', '/offers')).body.offers.some((o) => o.id === offerId));
  });
});

describe('bookings', () => {
  let car;
  let bookingId;

  before(async () => {
    car = (await pub('GET', '/cars')).body.cars[20];
  });

  it('creates a booking with a reference and blocks overlapping dates', async () => {
    const created = await pub('POST', '/bookings', { body: bookingBody(car.id, { airportDelivery: true }) });
    assert.equal(created.status, 201);
    assert.match(created.body.booking.reference, /^LM-[A-Z0-9]{6}$/);
    assert.equal(created.body.booking.totalPrice, car.dailyRate * 3 + 50);
    assert.equal(created.body.booking.status, 'pending');

    const overlap = await pub('POST', '/bookings', { body: bookingBody(car.id, { pickupAt: '2030-02-03T10:00', returnAt: '2030-02-06T10:00' }) });
    assert.equal(overlap.status, 409);
    assert.equal(overlap.body.error.code, 'car_unavailable');

    const backToBack = await pub('POST', '/bookings', { body: bookingBody(car.id, { pickupAt: '2030-02-04T10:00', returnAt: '2030-02-05T10:00' }) });
    assert.equal(backToBack.status, 201, 'a booking may start when the previous one ends');

    const windowed = (await pub('GET', '/cars?pickupAt=2030-02-02T10:00&returnAt=2030-02-03T10:00')).body.cars.find((c) => c.id === car.id);
    assert.equal(windowed.availability, 'booked');
    const reserved = (await pub('GET', `/cars/${car.slug}`)).body.reserved;
    assert.equal(reserved.length, 2);
    assert.ok(!('customerName' in reserved[0]), 'reserved windows contain no personal data');

    const list = (await admin('GET', '/bookings')).body.bookings;
    bookingId = list.find((b) => b.reference === created.body.booking.reference).id;
  });

  it('validates input and business rules', async () => {
    const missing = await pub('POST', '/bookings', { body: { carId: car.id } });
    assert.equal(missing.status, 400);
    assert.equal(missing.body.error.code, 'validation_failed');

    const reversed = await pub('POST', '/bookings', { body: bookingBody(car.id, { pickupAt: '2030-09-05T10:00', returnAt: '2030-09-01T10:00' }) });
    assert.equal(reversed.body.error.code, 'invalid_dates');

    const soon = await pub('POST', '/bookings', { body: bookingBody(car.id, { pickupAt: '2030-01-01T10:00', returnAt: '2030-01-02T10:00' }) });
    assert.equal(soon.status, 400);
    assert.equal(soon.body.error.code, 'pickup_too_soon');
    assert.equal(soon.body.error.details.minimumNoticeHours, 2);

    const badPhone = await pub('POST', '/bookings', { body: bookingBody(car.id, { phone: 'call me' }) });
    assert.equal(badPhone.body.error.details.fields.phone, 'invalid');

    const unknownCar = await pub('POST', '/bookings', { body: bookingBody(999999) });
    assert.equal(unknownCar.status, 404);
  });

  it('lets staff create same-hour phone bookings', async () => {
    const created = await admin('POST', '/bookings', {
      body: bookingBody(car.id, { pickupAt: '2030-01-01T09:30', returnAt: '2030-01-01T20:00' }),
    });
    assert.equal(created.status, 201);
    assert.equal(created.body.booking.channel, 'admin');
  });

  it('manages status, notes and re-activation conflicts', async () => {
    const confirmed = await admin('PATCH', `/bookings/${bookingId}`, { body: { status: 'confirmed', adminNotes: 'VIP guest' } });
    assert.equal(confirmed.body.booking.status, 'confirmed');
    assert.equal(confirmed.body.booking.adminNotes, 'VIP guest');

    const invalid = await admin('PATCH', `/bookings/${bookingId}`, { body: { status: 'teleported' } });
    assert.equal(invalid.status, 400);

    await admin('PATCH', `/bookings/${bookingId}`, { body: { status: 'cancelled' } });
    const freed = await pub('POST', '/quote', { body: { carId: car.id, pickupAt: '2030-02-01T12:00', returnAt: '2030-02-02T10:00' } });
    assert.equal(freed.body.available, true, 'cancelling frees the dates');

    const taker = await pub('POST', '/bookings', { body: bookingBody(car.id, { pickupAt: '2030-02-01T12:00', returnAt: '2030-02-02T10:00' }) });
    assert.equal(taker.status, 201);
    const conflict = await admin('PATCH', `/bookings/${bookingId}`, { body: { status: 'pending' } });
    assert.equal(conflict.status, 409, 're-activating an overlapped booking is refused');
  });

  it('reports revenue and deletes bookings', async () => {
    await admin('PATCH', `/bookings/${bookingId}`, { body: { status: 'completed' } });
    const overview = (await admin('GET', '/overview')).body;
    assert.ok(overview.revenue >= car.dailyRate * 3 + 50);
    assert.ok(overview.bookingsByStatus.pending.count >= 1);
    assert.equal(overview.trend.length, 30);

    assert.equal((await admin('DELETE', `/bookings/${bookingId}`)).status, 200);
    assert.equal((await admin('PATCH', `/bookings/${bookingId}`, { body: { status: 'pending' } })).status, 404);
  });
});

describe('inbox', () => {
  it('accepts contact messages and lets staff manage them', async () => {
    const noContact = await pub('POST', '/messages', { body: { name: 'A', message: 'Hi' } });
    assert.equal(noContact.status, 400);
    assert.equal(noContact.body.error.code, 'contact_required');

    const sent = await pub('POST', '/messages', { body: { name: '<b>Sara</b>', phone: '0791234567', message: 'Wedding car on Friday?' } });
    assert.equal(sent.status, 201);

    const { messages } = (await admin('GET', '/messages')).body;
    const message = messages.find((m) => m.message === 'Wedding car on Friday?');
    assert.equal(message.name, '<b>Sara</b>', 'stored verbatim; the UI escapes on render');
    assert.equal(message.isRead, false);
    assert.ok((await admin('GET', '/overview')).body.unreadMessages >= 1);

    const read = await admin('PATCH', `/messages/${message.id}`, { body: { isRead: true } });
    assert.equal(read.body.message.isRead, true);
    assert.equal((await admin('DELETE', `/messages/${message.id}`)).status, 200);
  });
});

describe('concierge chat', () => {
  it('answers Arabic car questions with real cars', async () => {
    const { body } = await pub('POST', '/chat', { body: { message: 'بدي جي كلاس للعرس', lang: 'ar' } });
    assert.ok(body.cars.length > 0);
    assert.ok(body.cars.every((car) => /G 63|G700|G800/.test(car.name)), JSON.stringify(body.cars.map((c) => c.name)));
  });

  it('uses live settings and offers', async () => {
    const airport = await pub('POST', '/chat', { body: { message: 'Do you deliver to the airport?', lang: 'en' } });
    assert.match(airport.body.reply, /\$50/);
    const offers = await pub('POST', '/chat', { body: { message: 'عندكم خصم؟' } });
    assert.match(offers.body.reply, /VIPGOLD/);
    const wedding = await pub('POST', '/chat', { body: { message: 'wedding car', lang: 'en' } });
    assert.ok(wedding.body.cars.length > 0);
  });

  it('requires a message', async () => {
    assert.equal((await pub('POST', '/chat', { body: { message: '  ' } })).status, 400);
  });
});

describe('automation webhook', () => {
  let hook;
  const received = [];

  before(async () => {
    hook = http.createServer((req, res) => {
      let data = '';
      req.on('data', (chunk) => (data += chunk));
      req.on('end', () => {
        received.push(JSON.parse(data));
        res.writeHead(200).end('ok');
      });
    });
    await new Promise((resolve) => hook.listen(0, '127.0.0.1', resolve));
  });

  after(() => new Promise((resolve) => hook.close(resolve)));

  it('tests the webhook and forwards new bookings', async () => {
    const url = `http://127.0.0.1:${hook.address().port}/lead`;
    const test = await admin('POST', '/webhook/test', { body: { url } });
    assert.deepEqual(test.body, { ok: true, status: 200 });

    await admin('PUT', '/settings', { body: { webhookUrl: url } });
    const car = (await pub('GET', '/cars')).body.cars[30];
    await pub('POST', '/bookings', { body: bookingBody(car.id, { pickupAt: '2030-08-01T10:00', returnAt: '2030-08-02T10:00' }) });

    for (let i = 0; i < 50 && received.length < 2; i += 1) await new Promise((r) => setTimeout(r, 20));
    const lead = received.at(-1);
    assert.equal(lead.carInterest, car.name);
    assert.equal(lead.totalPrice, car.dailyRate);
    assert.equal(lead.customerName, 'Test Customer');
    await admin('PUT', '/settings', { body: { webhookUrl: '' } });
  });

  it('reports an unreachable webhook', async () => {
    const res = await admin('POST', '/webhook/test', { body: { url: 'http://127.0.0.1:1/nothing' } });
    assert.equal(res.status, 502);
    assert.equal(res.body.error.code, 'webhook_unreachable');
  });
});

describe('media & uploads', () => {
  it('lists the photo library', async () => {
    const { images } = (await admin('GET', '/media')).body;
    assert.ok(images.some((image) => image.group === 'fleet'));
    assert.ok(images.some((image) => image.group === 'posters'));
    assert.ok(!images.some((image) => image.src.endsWith('-640.webp')), 'thumbnails are not listed separately');
  });

  it('accepts real images only', async () => {
    const uploaded = await admin('POST', '/uploads', { raw: PNG_1X1, contentType: 'image/png' });
    assert.equal(uploaded.status, 201);
    assert.match(uploaded.body.image.src, /^\/uploads\/\d{4}-\d{2}\/[\w-]+\.png$/);
    const file = path.join(srv.config.publicDir, uploaded.body.image.src);
    assert.ok(fs.existsSync(file));
    assert.equal((await srv.request('GET', uploaded.body.image.src)).status, 200);
    fs.rmSync(file);

    const fake = await admin('POST', '/uploads', { raw: Buffer.from('<?php echo 1; ?> not an image'), contentType: 'image/png' });
    assert.equal(fake.status, 415);
    assert.equal(fake.body.error.code, 'unsupported_image');
  });
});

describe('pages & SEO', () => {
  it('renders share metadata for cars and redirects old links', async () => {
    const home = await srv.request('GET', '/');
    assert.equal(home.status, 200);
    assert.match(home.text, /<title>Luxury Motors — Luxury car rental in Amman<\/title>/);
    assert.match(home.text, /\/media\/cars\/[\w-]+\/cover\.webp/);

    const page = await srv.request('GET', '/cars/rolls-royce-ghost-2021');
    assert.match(page.text, /<title>Rolls-Royce Ghost 2021 — Luxury Motors<\/title>/);
    assert.match(page.text, /og:image" content="http:\/\/127\.0\.0\.1:\d+\/media\/cars\/rolls-royce-ghost-2021\/cover\.webp"/);

    const old = await srv.request('GET', '/car-detail.html?id=1', { redirect: 'manual' });
    assert.equal(old.status, 301);
    assert.match(old.headers.get('location'), /^\/cars\/[\w-]+$/);

    assert.equal((await srv.request('GET', '/cars/nope')).status, 404);
    const missingApi = await srv.request('GET', '/api/nope');
    assert.equal(missingApi.status, 404);
    assert.equal(missingApi.body.error.code, 'not_found');
  });

  it('sends security headers', async () => {
    const res = await srv.request('GET', '/');
    assert.match(res.headers.get('content-security-policy'), /default-src 'self'/);
    assert.equal(res.headers.get('x-powered-by'), null);
  });
});

describe('password & sessions (runs last)', () => {
  it('changes the password and signs out other sessions', async () => {
    const other = await srv.login();
    const weak = await admin('PUT', '/password', { body: { currentPassword: ADMIN_PASSWORD, newPassword: 'short' } });
    assert.equal(weak.status, 400);
    assert.equal(weak.body.error.code, 'weak_password');
    const wrong = await admin('PUT', '/password', { body: { currentPassword: 'nope', newPassword: 'a-much-better-pass' } });
    assert.equal(wrong.body.error.code, 'invalid_credentials');

    const changed = await admin('PUT', '/password', { body: { currentPassword: ADMIN_PASSWORD, newPassword: 'a-much-better-pass' } });
    assert.equal(changed.status, 200);
    assert.equal((await admin('GET', '/session')).body.usingDefaultPassword, false);
    assert.equal((await srv.request('GET', '/api/admin/cars', { token: other })).status, 401, 'other devices are signed out');

    assert.equal(await srv.login(ADMIN_PASSWORD), undefined);
    assert.ok(await srv.login('a-much-better-pass'));
  });

  it('logs out', async () => {
    assert.equal((await admin('POST', '/logout')).status, 200);
    assert.equal((await admin('GET', '/cars')).status, 401);
  });
});
