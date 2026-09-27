import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { ADMIN_PASSWORD, NOW, startServer } from './helpers.js';

let srv;
let token;
let car;

before(async () => {
  srv = await startServer();
  token = await srv.login();
  ({ body: { cars: [car] } } = await srv.request('GET', '/api/cars'));
});

after(async () => {
  await srv?.close();
});

const admin = (method, url, options = {}) => srv.request(method, `/api/admin${url}`, { ...options, token });
const pub = (method, url, options = {}) => srv.request(method, `/api${url}`, options);

const bookingBody = (overrides = {}) => ({
  carId: car.id,
  pickupAt: '2030-03-01T10:00',
  returnAt: '2030-03-04T10:00',
  customerName: 'Layla Haddad',
  phone: '+962 79 555 1234',
  email: 'layla@example.com',
  pickupLocation: 'Amman',
  ...overrides,
});

async function createBooking(overrides = {}) {
  const { status, body } = await admin('POST', '/bookings', { body: bookingBody(overrides) });
  assert.equal(status, 201, JSON.stringify(body));
  return body.booking;
}

describe('blocked dates', () => {
  it('blocks a car for a period and stops customers booking it', async () => {
    const { status, body } = await admin('POST', '/blackouts', {
      body: { carId: car.id, startAt: '2030-06-01T00:00', endAt: '2030-06-10T00:00', reason: 'Service' },
    });
    assert.equal(status, 201, JSON.stringify(body));

    const quote = await pub('POST', '/quote', {
      body: { carId: car.id, pickupAt: '2030-06-03T10:00', returnAt: '2030-06-05T10:00' },
    });
    assert.equal(quote.body.available, false);
    assert.equal(quote.body.unavailableReason, 'car_blocked');

    const booking = await pub('POST', '/bookings', {
      body: bookingBody({ pickupAt: '2030-06-03T10:00', returnAt: '2030-06-05T10:00' }),
    });
    assert.equal(booking.status, 409);
    assert.equal(booking.body.error.code, 'car_blocked');

    // Outside the blocked window the same car is bookable again.
    const after = await pub('POST', '/quote', {
      body: { carId: car.id, pickupAt: '2030-06-11T10:00', returnAt: '2030-06-13T10:00' },
    });
    assert.equal(after.body.available, true);

    await admin('DELETE', `/blackouts/${body.blackout.id}`);
    const cleared = await pub('POST', '/quote', {
      body: { carId: car.id, pickupAt: '2030-06-03T10:00', returnAt: '2030-06-05T10:00' },
    });
    assert.equal(cleared.body.available, true);
  });

  it('refuses to block a period that already holds a booking', async () => {
    const booking = await createBooking({ pickupAt: '2030-07-01T10:00', returnAt: '2030-07-03T10:00' });
    const { status, body } = await admin('POST', '/blackouts', {
      body: { carId: car.id, startAt: '2030-07-02T00:00', endAt: '2030-07-05T00:00' },
    });
    assert.equal(status, 409);
    assert.equal(body.error.code, 'blackout_conflicts_booking');
    assert.equal(body.error.details.reference, booking.reference);
  });

  it('lists calendar entries for bookings and blocks together', async () => {
    const { body } = await admin('GET', '/calendar?from=2030-07-01&to=2030-07-31');
    assert.ok(body.entries.some((entry) => entry.kind === 'booking'));
    assert.ok(body.cars.length > 0);
  });
});

describe('editing a booking', () => {
  it('re-prices new dates on the server and keeps the reference', async () => {
    const booking = await createBooking({ pickupAt: '2030-04-01T10:00', returnAt: '2030-04-03T10:00' });
    assert.equal(booking.days, 2);

    const { status, body } = await admin('PUT', `/bookings/${booking.id}/dates`, {
      body: {
        carId: car.id,
        pickupAt: '2030-04-01T10:00',
        returnAt: '2030-04-06T10:00',
        pickupLocation: 'Amman',
        airportDelivery: true,
      },
    });
    assert.equal(status, 200, JSON.stringify(body));
    assert.equal(body.booking.reference, booking.reference);
    assert.equal(body.booking.days, 5);
    assert.equal(body.booking.totalPrice, car.dailyRate * 5 + 50, 'rental for 5 days plus the airport fee');
  });

  it('does not report the edited booking as a clash with itself', async () => {
    const booking = await createBooking({ pickupAt: '2030-11-01T10:00', returnAt: '2030-11-04T10:00' });
    const clashing = await admin('POST', '/quote', {
      body: { carId: car.id, pickupAt: '2030-11-02T10:00', returnAt: '2030-11-06T10:00' },
    });
    assert.equal(clashing.body.available, false);

    const editing = await admin('POST', '/quote', {
      body: { carId: car.id, pickupAt: '2030-11-02T10:00', returnAt: '2030-11-06T10:00', excludeBookingId: booking.id },
    });
    assert.equal(editing.body.available, true);
  });

  it('rejects a change that would overlap another booking', async () => {
    const first = await createBooking({ pickupAt: '2030-05-01T10:00', returnAt: '2030-05-05T10:00' });
    const second = await createBooking({ pickupAt: '2030-05-10T10:00', returnAt: '2030-05-12T10:00' });

    const { status, body } = await admin('PUT', `/bookings/${second.id}/dates`, {
      body: { carId: car.id, pickupAt: '2030-05-02T10:00', returnAt: '2030-05-04T10:00', pickupLocation: 'Amman' },
    });
    assert.equal(status, 409);
    assert.equal(body.error.code, 'car_unavailable');
    assert.ok(first.reference);
  });
});

describe('payments and invoices', () => {
  it('tracks deposits, payments and the remaining balance', async () => {
    const booking = await createBooking({ pickupAt: '2030-08-01T10:00', returnAt: '2030-08-03T10:00' });
    const total = booking.totalPrice;

    const deposit = await admin('POST', `/bookings/${booking.id}/payments`, {
      body: { amount: 100, kind: 'deposit', method: 'cash', paidOn: '2030-07-20' },
    });
    assert.equal(deposit.status, 201);
    assert.equal(deposit.body.paid, 100);

    await admin('POST', `/bookings/${booking.id}/payments`, {
      body: { amount: total - 100, kind: 'payment', method: 'card', paidOn: '2030-08-01' },
    });

    const invoice = await admin('GET', `/bookings/${booking.id}/invoice`);
    assert.equal(invoice.body.paid, total);
    assert.equal(invoice.body.balance, 0);
    assert.equal(invoice.body.payments.length, 2);
    assert.ok(invoice.body.business.name);

    const refund = await admin('POST', `/bookings/${booking.id}/payments`, {
      body: { amount: 50, kind: 'refund', method: 'cash', paidOn: '2030-08-04' },
    });
    assert.equal(refund.body.paid, total - 50, 'refunds reduce the collected total');

    const list = await admin('GET', '/bookings');
    const row = list.body.bookings.find((item) => item.id === booking.id);
    assert.equal(row.paid, total - 50);
    assert.equal(row.balance, 50);
  });
});

describe('customers', () => {
  it('records every customer and blocks online bookings on request', async () => {
    await createBooking({ phone: '+962 79 900 1111', customerName: 'Blocked Person' });
    const { body } = await admin('GET', '/customers');
    const customer = body.customers.find((item) => item.phone.includes('900 1111'));
    assert.ok(customer, 'the customer was captured from the booking');

    await admin('PATCH', `/customers/${customer.id}`, { body: { isBlocked: true, notes: 'Damaged a car' } });

    const attempt = await pub('POST', '/bookings', {
      body: bookingBody({ phone: '+962 79 900 1111', pickupAt: '2030-09-01T10:00', returnAt: '2030-09-03T10:00' }),
    });
    assert.equal(attempt.status, 403);
    assert.equal(attempt.body.error.code, 'customer_blocked');

    // Staff can still book for them by phone.
    const byStaff = await admin('POST', '/bookings', {
      body: bookingBody({ phone: '+962 79 900 1111', pickupAt: '2030-09-01T10:00', returnAt: '2030-09-03T10:00' }),
    });
    assert.equal(byStaff.status, 201);

    const detail = await admin('GET', `/customers/${customer.id}`);
    assert.equal(detail.body.customer.notes, 'Damaged a car');
    assert.ok(detail.body.bookings.length >= 2);
  });
});

describe('drivers', () => {
  it('assigns a driver to a booking and keeps the booking when the driver leaves', async () => {
    const { body: created } = await admin('POST', '/drivers', { body: { name: 'Omar', phone: '0790000000', dailyRate: 60 } });
    const booking = await createBooking({ pickupAt: '2030-10-01T10:00', returnAt: '2030-10-02T10:00' });

    const assigned = await admin('PATCH', `/bookings/${booking.id}`, { body: { driverId: created.driver.id } });
    assert.equal(assigned.body.booking.driverId, created.driver.id);
    assert.equal(assigned.body.booking.driverName, 'Omar');

    await admin('DELETE', `/drivers/${created.driver.id}`);
    const after = await admin('GET', '/bookings');
    const row = after.body.bookings.find((item) => item.id === booking.id);
    assert.equal(row.driverId, null);
  });
});

describe('inventory and costs', () => {
  it('stores vehicle records privately and raises alerts', async () => {
    await admin('PUT', `/cars/${car.id}`, {
      body: { plateNumber: '12-3456', odometerKm: 41_000, serviceDueKm: 41_200, insuranceExpiry: '2029-12-01' },
    });

    const fromAdmin = await admin('GET', '/cars');
    const adminCar = fromAdmin.body.cars.find((item) => item.id === car.id);
    assert.equal(adminCar.plateNumber, '12-3456');

    const fromSite = await pub('GET', `/cars/${car.slug}`);
    assert.equal(fromSite.body.car.plateNumber, undefined, 'plate numbers never reach the website');

    const { body } = await admin('GET', '/fleet-alerts');
    const kinds = body.alerts.filter((alert) => alert.carId === car.id).map((alert) => alert.type);
    assert.ok(kinds.includes('serviceKm'), 'mileage service is due');
    assert.ok(kinds.includes('insurance'), 'the insurance has expired');
  });

  it('records running costs and totals them for a period', async () => {
    await admin('POST', '/expenses', { body: { carId: car.id, category: 'service', amount: 300, spentOn: '2029-12-15' } });
    await admin('POST', '/expenses', { body: { category: 'other', amount: 120, spentOn: '2029-12-20', note: 'Office' } });

    const { body } = await admin('GET', '/expenses?from=2029-12-01&to=2029-12-31');
    assert.equal(body.total, 420);
    assert.equal(body.expenses.length, 2);

    const filtered = await admin('GET', `/expenses?from=2029-12-01&to=2029-12-31&carId=${car.id}`);
    assert.equal(filtered.body.total, 300);
  });
});

describe('analytics', () => {
  it('reports revenue, costs and net profit for a period', async () => {
    const { status, body } = await admin('GET', `/analytics?from=2029-12-01&to=${NOW.slice(0, 10)}`);
    assert.equal(status, 200);
    assert.equal(body.analytics.expenses, 420);
    assert.equal(body.analytics.netProfit, body.analytics.revenue - body.analytics.expenses);
    assert.ok(Array.isArray(body.analytics.trend));
    assert.ok(body.currency);
  });
});

describe('saved conversations', () => {
  it('stores what visitors asked the website assistant', async () => {
    await pub('POST', '/chat', { body: { message: 'Do you have a Rolls-Royce?', lang: 'en', sessionKey: 'visitor-abc-123' } });
    await pub('POST', '/chat', { body: { message: 'What is the price?', lang: 'en', sessionKey: 'visitor-abc-123' } });

    const { body } = await admin('GET', '/chats');
    assert.equal(body.chats.length, 1, 'both questions belong to the same conversation');
    assert.equal(body.chats[0].messageCount, 4);

    const transcript = await admin('GET', `/chats/${body.chats[0].id}`);
    assert.equal(transcript.body.messages.length, 4);
    assert.equal(transcript.body.messages[0].role, 'user');
    assert.equal(transcript.body.messages[1].role, 'bot');

    const overview = await admin('GET', '/overview');
    assert.equal(overview.body.unreadChats, 1);
  });
});

describe('website content', () => {
  it('serves the seeded reviews and FAQ, and reflects admin edits', async () => {
    const seeded = await pub('GET', '/content');
    assert.equal(seeded.body.testimonials.length, 3);
    assert.equal(seeded.body.faqs.length, 5);

    const created = await admin('POST', '/content/testimonials', {
      body: { nameEn: 'New Guest', textEn: 'Perfect service', rating: 5 },
    });
    assert.equal(created.status, 201);

    const hidden = await admin('PUT', `/content/faqs/${(await admin('GET', '/content/faqs')).body.items[0].id}`, {
      body: { isActive: false },
    });
    assert.equal(hidden.body.item.isActive, false);

    const live = await pub('GET', '/content');
    assert.equal(live.body.testimonials.length, 4);
    assert.equal(live.body.faqs.length, 4, 'hidden questions disappear from the website');
  });
});

describe('team accounts', () => {
  it('signs in the default owner and creates staff with limited access', async () => {
    const session = await admin('GET', '/session');
    assert.equal(session.body.user.username, 'admin');
    assert.equal(session.body.user.role, 'owner');

    const created = await admin('POST', '/users', {
      body: { username: 'reception', name: 'Front desk', role: 'staff', password: 'desk-pass-1' },
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));

    const staffLogin = await srv.request('POST', '/api/admin/login', {
      body: { username: 'reception', password: 'desk-pass-1' },
    });
    assert.equal(staffLogin.status, 200);
    const staffToken = staffLogin.body.token;
    assert.equal(staffLogin.body.user.role, 'staff');

    // Staff can work with bookings…
    const bookings = await srv.request('GET', '/api/admin/bookings', { token: staffToken });
    assert.equal(bookings.status, 200);

    // …but cannot change prices, offers or team accounts.
    const priceChange = await srv.request('PUT', `/api/admin/cars/${car.id}`, { token: staffToken, body: { dailyRate: 1 } });
    assert.equal(priceChange.status, 403);
    const settingsChange = await srv.request('PUT', '/api/admin/settings', { token: staffToken, body: { currency: 'EUR' } });
    assert.equal(settingsChange.status, 403);
    const users = await srv.request('GET', '/api/admin/users', { token: staffToken });
    assert.equal(users.status, 403);
  });

  it('rejects duplicate usernames and protects the last owner', async () => {
    const duplicate = await admin('POST', '/users', { body: { username: 'reception', password: 'another-pass' } });
    assert.equal(duplicate.status, 409);
    assert.equal(duplicate.body.error.code, 'username_taken');

    const { body } = await admin('GET', '/users');
    const owner = body.users.find((user) => user.role === 'owner');
    const demote = await admin('PUT', `/users/${owner.id}`, { body: { role: 'staff' } });
    assert.equal(demote.status, 409);
    assert.equal(demote.body.error.code, 'last_owner');
  });

  it('writes an activity trail of who changed what', async () => {
    const { body } = await admin('GET', '/activity');
    assert.ok(body.activity.some((entry) => entry.action === 'user.create'));
    assert.ok(body.activity.some((entry) => entry.action === 'car.update' && entry.userName === 'admin'));
  });

  it('still accepts the original password-only sign-in', async () => {
    const legacy = await srv.request('POST', '/api/admin/login', { body: { password: ADMIN_PASSWORD } });
    assert.equal(legacy.status, 200);
    assert.equal(legacy.body.user.username, 'admin');
  });
});
