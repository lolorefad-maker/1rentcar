/**
 * Operations API: calendar, inventory, money, people and content.
 * Mounted inside the admin router, so every route here is already authenticated.
 */
import express from 'express';
import { idParam } from '../lib/http.js';
import { clock } from '../lib/time.js';
import { validate } from '../lib/validate.js';
import { listActivity, logActivity } from '../services/activity.js';
import { buildAnalytics } from '../services/analytics.js';
import { requireRole } from '../services/auth.js';
import { calendarEntries } from '../services/availability.js';
import { bookingDetails, rescheduleBooking, serializeBooking } from '../services/bookings.js';
import { deleteChat, getChat, listChats, serializeChat, setChatRead } from '../services/chats.js';
import { createContent, deleteContent, listContent, serializeContent, updateContent } from '../services/content.js';
import { deleteCustomer, getCustomer, listCustomers, serializeCustomer, updateCustomer } from '../services/customers.js';
import { createDriver, deleteDriver, listDrivers, serializeDriver, updateDriver } from '../services/drivers.js';
import {
  createBlackout,
  createExpense,
  deleteBlackout,
  deleteExpense,
  fleetAlerts,
  listBlackouts,
  listExpenses,
  updateExpense,
} from '../services/inventory.js';
import { addPayment, deletePayment, listPayments, paidTotal } from '../services/payments.js';
import { getSettings } from '../services/settings.js';
import { createUser, deleteUser, listUsers, serializeUser, updateUser } from '../services/users.js';

const RANGE_SCHEMA = { from: { type: 'date' }, to: { type: 'date' }, carId: { type: 'int', min: 1 } };

const shiftDays = (isoDate, days) => {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

/** Reads ?from&to, defaulting to a period ending today. */
function readRange(query, defaultDays) {
  const clean = validate(query, RANGE_SCHEMA, { partial: true });
  const today = clock.nowLocal().slice(0, 10);
  return { from: clean.from || shiftDays(today, -defaultDays), to: clean.to || today, carId: clean.carId };
}

export function operationsRoutes({ db, media }) {
  const router = express.Router();
  const manager = requireRole('manager');
  const owner = requireRole('owner');
  const track = (req, entry) => logActivity(db, req.user, entry);

  // --- Availability calendar -------------------------------------------------------
  router.get('/calendar', async (req, res) => {
    const { from, to } = readRange(req.query, 30);
    const [entries, cars] = await Promise.all([
      calendarEntries(db, `${from}T00:00`, `${to}T23:59`),
      db.all(`SELECT id, slug, brand, model, trim, status FROM cars WHERE isActive = 1 ORDER BY brand, model`),
    ]);
    res.json({ from, to, entries, cars });
  });

  router.get('/blackouts', async (req, res) => {
    const { from, to } = readRange(req.query, 0);
    res.json({ blackouts: await listBlackouts(db, req.query.from || req.query.to ? { from: `${from}T00:00`, to: `${to}T23:59` } : {}) });
  });

  router.post('/blackouts', manager, async (req, res) => {
    const blackout = await createBlackout(db, req.body);
    track(req, { action: 'blackout.create', entity: 'car', entityId: blackout.carId, summary: `Blocked ${blackout.carName} ${blackout.startAt} → ${blackout.endAt}` });
    res.status(201).json({ blackout });
  });

  router.delete('/blackouts/:id', manager, async (req, res) => {
    const id = idParam(req.params.id, 'Blocked period');
    await deleteBlackout(db, id);
    track(req, { action: 'blackout.delete', entity: 'blackout', entityId: id, summary: 'Removed a blocked period' });
    res.json({ ok: true });
  });

  // --- Inventory & running costs ----------------------------------------------------
  router.get('/fleet-alerts', async (_req, res) => {
    res.json({ alerts: await fleetAlerts(db, clock.nowLocal().slice(0, 10)) });
  });

  router.get('/expenses', async (req, res) => {
    const { from, to, carId } = readRange(req.query, 365);
    const rows = await listExpenses(db, { from, to, carId });
    res.json({ expenses: rows, total: rows.reduce((sum, row) => sum + row.amount, 0), from, to });
  });

  router.post('/expenses', manager, async (req, res) => {
    const { currency } = await getSettings(db);
    const expense = await createExpense(db, req.body, currency);
    track(req, { action: 'expense.create', entity: 'expense', entityId: expense.id, summary: `${expense.category} ${expense.amount} ${currency}` });
    res.status(201).json({ expense });
  });

  router.patch('/expenses/:id', manager, async (req, res) => {
    res.json({ expense: await updateExpense(db, idParam(req.params.id, 'Expense'), req.body) });
  });

  router.delete('/expenses/:id', manager, async (req, res) => {
    const id = idParam(req.params.id, 'Expense');
    await deleteExpense(db, id);
    track(req, { action: 'expense.delete', entity: 'expense', entityId: id, summary: 'Deleted an expense' });
    res.json({ ok: true });
  });

  // --- Drivers ----------------------------------------------------------------------
  router.get('/drivers', async (_req, res) => {
    res.json({ drivers: (await listDrivers(db)).map(serializeDriver) });
  });

  router.post('/drivers', manager, async (req, res) => {
    const driver = await createDriver(db, req.body);
    track(req, { action: 'driver.create', entity: 'driver', entityId: driver.id, summary: driver.name });
    res.status(201).json({ driver: serializeDriver(driver) });
  });

  router.put('/drivers/:id', manager, async (req, res) => {
    const driver = await updateDriver(db, idParam(req.params.id, 'Driver'), req.body);
    track(req, { action: 'driver.update', entity: 'driver', entityId: driver.id, summary: driver.name });
    res.json({ driver: serializeDriver(driver) });
  });

  router.delete('/drivers/:id', manager, async (req, res) => {
    const id = idParam(req.params.id, 'Driver');
    await deleteDriver(db, id);
    track(req, { action: 'driver.delete', entity: 'driver', entityId: id, summary: 'Removed a driver' });
    res.json({ ok: true });
  });

  // --- Customers --------------------------------------------------------------------
  router.get('/customers', async (_req, res) => {
    res.json({ customers: (await listCustomers(db)).map(serializeCustomer) });
  });

  router.get('/customers/:id', async (req, res) => {
    res.json(await getCustomer(db, idParam(req.params.id, 'Customer')));
  });

  router.patch('/customers/:id', async (req, res) => {
    const customer = await updateCustomer(db, idParam(req.params.id, 'Customer'), req.body);
    if ('isBlocked' in (req.body ?? {})) {
      track(req, {
        action: customer.isBlocked ? 'customer.block' : 'customer.unblock',
        entity: 'customer',
        entityId: customer.id,
        summary: `${customer.name || customer.phone}`,
      });
    }
    res.json({ customer });
  });

  router.delete('/customers/:id', manager, async (req, res) => {
    const id = idParam(req.params.id, 'Customer');
    await deleteCustomer(db, id);
    track(req, { action: 'customer.delete', entity: 'customer', entityId: id, summary: 'Deleted a customer record' });
    res.json({ ok: true });
  });

  // --- Booking money & rescheduling ---------------------------------------------------
  router.get('/bookings/:id/payments', async (req, res) => {
    const id = idParam(req.params.id, 'Booking');
    const payments = await listPayments(db, id);
    res.json({ payments, paid: paidTotal(payments) });
  });

  router.post('/bookings/:id/payments', async (req, res) => {
    const id = idParam(req.params.id, 'Booking');
    const payment = await addPayment(db, id, req.body);
    track(req, { action: 'payment.create', entity: 'booking', entityId: id, summary: `${payment.kind} ${payment.amount} (${payment.method})` });
    const payments = await listPayments(db, id);
    res.status(201).json({ payment, payments, paid: paidTotal(payments) });
  });

  router.delete('/payments/:id', manager, async (req, res) => {
    const payment = await deletePayment(db, idParam(req.params.id, 'Payment'));
    track(req, { action: 'payment.delete', entity: 'booking', entityId: payment.bookingId, summary: `Removed ${payment.amount}` });
    const payments = await listPayments(db, payment.bookingId);
    res.json({ ok: true, payments, paid: paidTotal(payments) });
  });

  /** Everything an invoice or receipt needs, priced by the server. */
  router.get('/bookings/:id/invoice', async (req, res) => {
    const id = idParam(req.params.id, 'Booking');
    const [booking, payments, settings] = await Promise.all([bookingDetails(db, id), listPayments(db, id), getSettings(db)]);
    const paid = paidTotal(payments);
    res.json({
      booking: serializeBooking(booking, media),
      payments,
      paid,
      balance: booking.totalPrice - paid,
      business: {
        name: settings.businessName,
        phone: settings.phone,
        email: settings.email,
        addressEn: settings.addressEn,
        addressAr: settings.addressAr,
        currency: settings.currency,
      },
      issuedAt: clock.nowLocal(),
    });
  });

  router.put('/bookings/:id/dates', async (req, res) => {
    const id = idParam(req.params.id, 'Booking');
    const booking = await rescheduleBooking(db, id, req.body);
    track(req, {
      action: 'booking.reschedule',
      entity: 'booking',
      entityId: id,
      summary: `${booking.reference}: ${booking.pickupAt} → ${booking.returnAt} (${booking.totalPrice} ${booking.currency})`,
    });
    res.json({ booking: serializeBooking(await bookingDetails(db, id), media) });
  });

  // --- Saved website conversations -----------------------------------------------------
  router.get('/chats', async (_req, res) => {
    res.json({ chats: (await listChats(db)).map(serializeChat) });
  });

  router.get('/chats/:id', async (req, res) => {
    res.json(await getChat(db, idParam(req.params.id, 'Chat')));
  });

  router.patch('/chats/:id', async (req, res) => {
    res.json({ chat: await setChatRead(db, idParam(req.params.id, 'Chat'), Boolean(req.body?.isRead)) });
  });

  router.delete('/chats/:id', async (req, res) => {
    await deleteChat(db, idParam(req.params.id, 'Chat'));
    res.json({ ok: true });
  });

  // --- Website content (reviews, FAQ) ----------------------------------------------------
  router.get('/content/:kind', async (req, res) => {
    res.json({ items: (await listContent(db, req.params.kind)).map(serializeContent) });
  });

  router.post('/content/:kind', manager, async (req, res) => {
    const item = await createContent(db, req.params.kind, req.body);
    track(req, { action: 'content.create', entity: req.params.kind, entityId: item.id, summary: 'Added website content' });
    res.status(201).json({ item: serializeContent(item) });
  });

  router.put('/content/:kind/:id', manager, async (req, res) => {
    const item = await updateContent(db, req.params.kind, idParam(req.params.id, 'Content'), req.body);
    track(req, { action: 'content.update', entity: req.params.kind, entityId: item.id, summary: 'Edited website content' });
    res.json({ item: serializeContent(item) });
  });

  router.delete('/content/:kind/:id', manager, async (req, res) => {
    const id = idParam(req.params.id, 'Content');
    await deleteContent(db, req.params.kind, id);
    track(req, { action: 'content.delete', entity: req.params.kind, entityId: id, summary: 'Removed website content' });
    res.json({ ok: true });
  });

  // --- Analytics ---------------------------------------------------------------------------
  router.get('/analytics', manager, async (req, res) => {
    const { from, to } = readRange(req.query, 180);
    const [analytics, settings] = await Promise.all([buildAnalytics(db, { from, to }), getSettings(db)]);
    res.json({ analytics, currency: settings.currency });
  });

  // --- Team accounts & audit trail -----------------------------------------------------------
  router.get('/users', owner, async (_req, res) => {
    res.json({ users: (await listUsers(db)).map(serializeUser) });
  });

  router.post('/users', owner, async (req, res) => {
    const user = await createUser(db, req.body);
    track(req, { action: 'user.create', entity: 'user', entityId: user.id, summary: `${user.username} (${user.role})` });
    res.status(201).json({ user: serializeUser(user) });
  });

  router.put('/users/:id', owner, async (req, res) => {
    const user = await updateUser(db, idParam(req.params.id, 'User'), req.body);
    track(req, { action: 'user.update', entity: 'user', entityId: user.id, summary: `${user.username} (${user.role})` });
    res.json({ user: serializeUser(user) });
  });

  router.delete('/users/:id', owner, async (req, res) => {
    const id = idParam(req.params.id, 'User');
    await deleteUser(db, id, req.user?.id);
    track(req, { action: 'user.delete', entity: 'user', entityId: id, summary: 'Removed a team member' });
    res.json({ ok: true });
  });

  router.get('/activity', manager, async (req, res) => {
    res.json({ activity: await listActivity(db, { limit: Number(req.query.limit) || 200 }) });
  });

  return router;
}
