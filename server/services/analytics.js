/**
 * Business analytics for a chosen period: revenue, utilisation per car,
 * request conversion, booking sources, costs and net profit.
 */
import { parseLocalDateTime } from '../lib/pricing.js';

const MS_PER_DAY = 86_400_000;
const EARNED = "('confirmed', 'completed')";

const monthsBetween = (from, to) => {
  const months = [];
  const cursor = new Date(`${from.slice(0, 7)}-01T00:00:00Z`);
  const last = `${to.slice(0, 7)}`;
  while (cursor.toISOString().slice(0, 7) <= last && months.length < 36) {
    months.push(cursor.toISOString().slice(0, 7));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return months;
};

/** Days a booking actually occupies inside the requested period. */
function overlapDays(booking, fromMs, toMs) {
  const start = Math.max(parseLocalDateTime(booking.pickupAt) ?? fromMs, fromMs);
  const end = Math.min(parseLocalDateTime(booking.returnAt) ?? fromMs, toMs);
  return end > start ? (end - start) / MS_PER_DAY : 0;
}

export async function buildAnalytics(db, { from, to }) {
  const fromMs = parseLocalDateTime(`${from}T00:00`);
  const toMs = parseLocalDateTime(`${to}T23:59`);
  const periodDays = Math.max(1, Math.round((toMs - fromMs) / MS_PER_DAY));

  const [revenueRows, statusRows, channelRows, expenseRows, occupancyRows, fleet, topCars, topCustomers, paymentRow] =
    await Promise.all([
      db.all(
        `SELECT substr(createdAt, 1, 7) AS month, COALESCE(SUM(totalPrice), 0) AS revenue, COUNT(*) AS bookings
         FROM bookings WHERE status IN ${EARNED} AND substr(createdAt, 1, 10) BETWEEN ? AND ?
         GROUP BY month ORDER BY month`,
        [from, to],
      ),
      db.all(
        `SELECT status, COUNT(*) AS count, COALESCE(SUM(totalPrice), 0) AS value
         FROM bookings WHERE substr(createdAt, 1, 10) BETWEEN ? AND ? GROUP BY status`,
        [from, to],
      ),
      db.all(
        `SELECT channel, COUNT(*) AS count, COALESCE(SUM(CASE WHEN status IN ${EARNED} THEN totalPrice ELSE 0 END), 0) AS revenue
         FROM bookings WHERE substr(createdAt, 1, 10) BETWEEN ? AND ? GROUP BY channel ORDER BY count DESC`,
        [from, to],
      ),
      db.all(
        `SELECT category, COALESCE(SUM(amount), 0) AS amount FROM expenses
         WHERE spentOn BETWEEN ? AND ? GROUP BY category ORDER BY amount DESC`,
        [from, to],
      ),
      db.all(
        `SELECT carId, carName, pickupAt, returnAt FROM bookings
         WHERE carId IS NOT NULL AND status IN ${EARNED} AND returnAt >= ? AND pickupAt <= ?`,
        [`${from}T00:00`, `${to}T23:59`],
      ),
      db.get("SELECT COUNT(*) AS total, COALESCE(SUM(isActive), 0) AS active FROM cars"),
      db.all(
        `SELECT carName, COUNT(*) AS bookings, COALESCE(SUM(totalPrice), 0) AS revenue
         FROM bookings WHERE status IN ${EARNED} AND substr(createdAt, 1, 10) BETWEEN ? AND ?
         GROUP BY COALESCE(carId, carName) ORDER BY revenue DESC LIMIT 8`,
        [from, to],
      ),
      db.all(
        `SELECT customerName, phone, COUNT(*) AS bookings, COALESCE(SUM(totalPrice), 0) AS spent
         FROM bookings WHERE status IN ${EARNED} AND substr(createdAt, 1, 10) BETWEEN ? AND ?
         GROUP BY phone ORDER BY spent DESC LIMIT 8`,
        [from, to],
      ),
      db.get(
        `SELECT COALESCE(SUM(CASE WHEN kind = 'refund' THEN -amount ELSE amount END), 0) AS collected
         FROM payments WHERE paidOn BETWEEN ? AND ?`,
        [from, to],
      ),
    ]);

  const byStatus = Object.fromEntries(['pending', 'confirmed', 'completed', 'cancelled'].map((s) => [s, { count: 0, value: 0 }]));
  for (const row of statusRows) byStatus[row.status] = { count: row.count, value: row.value };

  const revenueByMonth = new Map(revenueRows.map((row) => [row.month, row]));
  const trend = monthsBetween(from, to).map((month) => ({
    month,
    revenue: revenueByMonth.get(month)?.revenue ?? 0,
    bookings: revenueByMonth.get(month)?.bookings ?? 0,
  }));

  const rentedDays = new Map();
  for (const booking of occupancyRows) {
    const days = overlapDays(booking, fromMs, toMs);
    if (days <= 0) continue;
    const entry = rentedDays.get(booking.carId) ?? { carName: booking.carName, days: 0 };
    entry.days += days;
    rentedDays.set(booking.carId, entry);
  }
  const utilisation = [...rentedDays.entries()]
    .map(([carId, entry]) => ({
      carId,
      carName: entry.carName,
      days: Math.round(entry.days * 10) / 10,
      percent: Math.round((entry.days / periodDays) * 100),
    }))
    .sort((a, b) => b.days - a.days)
    .slice(0, 12);

  const revenue = byStatus.confirmed.value + byStatus.completed.value;
  const expenses = expenseRows.reduce((sum, row) => sum + row.amount, 0);
  const requests = byStatus.pending.count + byStatus.confirmed.count + byStatus.completed.count + byStatus.cancelled.count;
  const fleetDays = Math.max(1, fleet.active * periodDays);
  const rentedTotal = [...rentedDays.values()].reduce((sum, entry) => sum + entry.days, 0);

  return {
    period: { from, to, days: periodDays },
    revenue,
    expenses,
    netProfit: revenue - expenses,
    collected: paymentRow.collected,
    bookingsByStatus: byStatus,
    conversionPercent: requests ? Math.round(((byStatus.confirmed.count + byStatus.completed.count) / requests) * 100) : 0,
    fleetUtilisationPercent: Math.round((rentedTotal / fleetDays) * 100),
    trend,
    channels: channelRows,
    expensesByCategory: expenseRows,
    utilisation,
    topCars,
    topCustomers,
  };
}
