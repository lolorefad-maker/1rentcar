const REVENUE_STATUSES = "('confirmed', 'completed')";
const TREND_DAYS = 30;

function lastDays(count) {
  const days = [];
  const today = new Date();
  for (let offset = count - 1; offset >= 0; offset -= 1) {
    const day = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - offset));
    days.push(day.toISOString().slice(0, 10));
  }
  return days;
}

/** Everything the admin dashboard needs, in one round trip. */
export async function buildOverview(db, now) {
  const days = lastDays(TREND_DAYS);

  const [
    statusRows,
    fleet,
    onRent,
    unread,
    topCars,
    upcomingPickups,
    dueReturns,
    trendRows,
    unreadChats,
    outstanding,
    monthExpenses,
  ] = await Promise.all([
    db.all('SELECT status, COUNT(*) AS count, COALESCE(SUM(totalPrice), 0) AS value FROM bookings GROUP BY status'),
    db.get(
      `SELECT COUNT(*) AS total, COALESCE(SUM(isActive), 0) AS active,
              COALESCE(SUM(CASE WHEN status = 'maintenance' THEN 1 ELSE 0 END), 0) AS maintenance
       FROM cars`,
    ),
    db.get(
      "SELECT COUNT(DISTINCT carId) AS count FROM bookings WHERE status = 'confirmed' AND pickupAt <= ? AND returnAt > ?",
      [now, now],
    ),
    db.get('SELECT COUNT(*) AS count FROM messages WHERE isRead = 0'),
    db.all(
      `SELECT carName, COUNT(*) AS bookings, COALESCE(SUM(totalPrice), 0) AS revenue FROM bookings
       WHERE status != 'cancelled' GROUP BY COALESCE(carId, carName) ORDER BY bookings DESC, revenue DESC LIMIT 5`,
    ),
    db.all(
      `SELECT id, reference, carName, customerName, phone, pickupAt, returnAt, pickupLocation, status FROM bookings
       WHERE status IN ('pending', 'confirmed') AND pickupAt >= ? ORDER BY pickupAt LIMIT 8`,
      [now],
    ),
    db.all(
      `SELECT id, reference, carName, customerName, phone, pickupAt, returnAt, pickupLocation, status FROM bookings
       WHERE status = 'confirmed' AND pickupAt <= ? AND returnAt >= ? ORDER BY returnAt LIMIT 8`,
      [now, now],
    ),
    db.all(
      `SELECT substr(createdAt, 1, 10) AS day, COALESCE(SUM(totalPrice), 0) AS revenue, COUNT(*) AS bookings
       FROM bookings WHERE status IN ${REVENUE_STATUSES} AND substr(createdAt, 1, 10) >= ? GROUP BY day`,
      [days[0]],
    ),
    db.get('SELECT COUNT(*) AS count FROM chats WHERE isRead = 0'),
    db.get(
      `SELECT COALESCE(SUM(b.totalPrice), 0) - COALESCE((
         SELECT SUM(CASE WHEN p.kind = 'refund' THEN -p.amount ELSE p.amount END)
         FROM payments p JOIN bookings pb ON pb.id = p.bookingId
         WHERE pb.status IN ('pending', 'confirmed')), 0) AS amount
       FROM bookings b WHERE b.status IN ('pending', 'confirmed')`,
    ),
    db.get('SELECT COALESCE(SUM(amount), 0) AS amount FROM expenses WHERE substr(spentOn, 1, 7) = ?', [now.slice(0, 7)]),
  ]);

  const byStatus = Object.fromEntries(['pending', 'confirmed', 'completed', 'cancelled'].map((s) => [s, { count: 0, value: 0 }]));
  for (const row of statusRows) byStatus[row.status] = { count: row.count, value: row.value };

  const earnedCount = byStatus.confirmed.count + byStatus.completed.count;
  const revenue = byStatus.confirmed.value + byStatus.completed.value;
  const trendByDay = new Map(trendRows.map((row) => [row.day, row]));

  return {
    revenue,
    pipeline: byStatus.pending.value,
    averageBookingValue: earnedCount ? Math.round(revenue / earnedCount) : 0,
    bookingsByStatus: byStatus,
    totalBookings: statusRows.reduce((sum, row) => sum + row.count, 0),
    fleet: { ...fleet, onRent: onRent.count },
    unreadMessages: unread.count,
    unreadChats: unreadChats.count,
    outstanding: outstanding.amount,
    monthExpenses: monthExpenses.amount,
    topCars,
    upcomingPickups,
    dueReturns,
    trend: days.map((day) => ({
      day,
      revenue: trendByDay.get(day)?.revenue ?? 0,
      bookings: trendByDay.get(day)?.bookings ?? 0,
    })),
  };
}
