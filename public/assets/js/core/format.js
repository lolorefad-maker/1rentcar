import { lang } from './i18n.js';

const cache = new Map();
function formatter(key, factory) {
  if (!cache.has(key)) cache.set(key, factory());
  return cache.get(key);
}

const numberLocale = () => (lang() === 'ar' ? 'ar-JO-u-nu-latn' : 'en-US');
const dateLocale = () => (lang() === 'ar' ? 'ar-JO-u-nu-latn' : 'en-GB');

export function formatMoney(amount, currency) {
  return formatter(`money:${lang()}:${currency}`, () =>
    new Intl.NumberFormat(numberLocale(), { style: 'currency', currency, maximumFractionDigits: 0 }),
  ).format(amount);
}

/** Axis-friendly money: $1.2K, $15K. */
export function formatCompactMoney(amount, currency) {
  return formatter(`cmoney:${lang()}:${currency}`, () =>
    new Intl.NumberFormat(numberLocale(), { style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1 }),
  ).format(amount);
}

export function formatNumber(value) {
  return formatter(`number:${lang()}`, () => new Intl.NumberFormat(numberLocale())).format(value);
}

/** Wall-clock "YYYY-MM-DDTHH:mm" → Date in UTC so no timezone shift is applied when formatting. */
export function wallClockDate(local) {
  const [date, time = '00:00'] = String(local).split('T');
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  return new Date(Date.UTC(year, month - 1, day, hour, minute));
}

export function formatDateTime(local) {
  return formatter(`dt:${lang()}`, () =>
    new Intl.DateTimeFormat(dateLocale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }),
  ).format(wallClockDate(local));
}

/** "12 Sep" — for chart axes. */
export function formatShortDate(local) {
  return formatter(`sd:${lang()}`, () =>
    new Intl.DateTimeFormat(dateLocale(), { day: 'numeric', month: 'short', timeZone: 'UTC' }),
  ).format(wallClockDate(local));
}

export function formatDate(local) {
  return formatter(`d:${lang()}`, () =>
    new Intl.DateTimeFormat(dateLocale(), { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }),
  ).format(wallClockDate(local));
}

/** ISO timestamps (e.g. createdAt) in the viewer's local time. */
export function formatTimestamp(iso) {
  return formatter(`ts:${lang()}`, () =>
    new Intl.DateTimeFormat(dateLocale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }),
  ).format(new Date(iso));
}

const pad = (n) => String(n).padStart(2, '0');

/** A Date's local wall clock in the "YYYY-MM-DDTHH:mm" shape datetime-local inputs use. */
export function toLocalInput(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Shifts a "YYYY-MM-DDTHH:mm" value by whole days (local calendar). */
export function addDays(local, days) {
  const date = new Date(local);
  date.setDate(date.getDate() + days);
  return toLocalInput(date);
}

/** Default rental window: tomorrow 10:00 → three days later. */
export function defaultWindow() {
  const pickup = new Date();
  pickup.setDate(pickup.getDate() + 1);
  pickup.setHours(10, 0, 0, 0);
  const dropoff = new Date(pickup);
  dropoff.setDate(dropoff.getDate() + 3);
  return { pickupAt: toLocalInput(pickup), returnAt: toLocalInput(dropoff) };
}
