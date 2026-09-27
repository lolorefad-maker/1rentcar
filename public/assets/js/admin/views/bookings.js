import { $, debounce, html, render } from '../../core/dom.js';
import { defaultWindow, formatDate, formatDateTime, formatMoney, formatTimestamp, toLocalInput } from '../../core/format.js';
import { lang, t } from '../../core/i18n.js';
import {
  checkRow,
  confirmDialog,
  errorText,
  field,
  openModal,
  readForm,
  selected,
  showFieldErrors,
  toast,
  uniqueId,
  whatsappLink,
  withBusy,
} from '../ui.js';

const PAYMENT_METHODS = ['cash', 'card', 'transfer', 'other'];
const PAYMENT_KINDS = ['payment', 'deposit', 'refund'];

const STATUSES = ['pending', 'confirmed', 'completed', 'cancelled'];
const CSV_COLUMNS = [
  'reference', 'createdAt', 'status', 'channel', 'customerName', 'phone', 'email', 'carName', 'pickupAt', 'returnAt',
  'days', 'pickupLocation', 'airportDelivery', 'chauffeur', 'promoCode', 'rentalSubtotal', 'durationDiscount',
  'extrasTotal', 'promoDiscount', 'totalPrice', 'paid', 'balance', 'currency', 'driverName', 'notes', 'adminNotes',
];

function csvCell(value) {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function downloadCsv(rows) {
  const lines = [CSV_COLUMNS.join(','), ...rows.map((row) => CSV_COLUMNS.map((column) => csvCell(row[column])).join(','))];
  // BOM so Excel opens Arabic names correctly.
  const blob = new Blob([`﻿${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = Object.assign(document.createElement('a'), { href: url, download: `bookings-${new Date().toISOString().slice(0, 10)}.csv` });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const statusOptions = (current) => html`${STATUSES.map((status) => html`<option value="${status}"${selected(status === current)}>${t(`status.${status}`)}</option>`)}`;

const extrasText = (booking) =>
  [booking.airportDelivery && t('bookings.airport'), booking.chauffeur && t('bookings.chauffeur')].filter(Boolean).join(' · ') || t('bookings.none');

const line = (label, value, className = '') => html`<div class="quote-lines__row"><span>${label}</span><span class="${className}">${value}</span></div>`;

/** Stored price breakdown of a booking (exactly what the customer was quoted). */
function bookingBreakdown(booking) {
  const money = (amount) => formatMoney(amount, booking.currency);
  return html`
    <div class="quote-lines">
      ${line(t('line.rental', { rate: money(booking.dailyRate), days: booking.days }), money(booking.rentalSubtotal))}
      ${booking.durationDiscount ? line(t('line.duration'), `−${money(booking.durationDiscount)}`, 'saving') : ''}
      ${booking.extrasTotal ? line(t('line.extras'), money(booking.extrasTotal)) : ''}
      ${booking.promoDiscount ? line(t('line.promo', { code: booking.promoCode }), `−${money(booking.promoDiscount)}`, 'saving') : ''}
      <div class="quote-lines__total"><span>${t('line.total')}</span><span>${money(booking.totalPrice)}</span></div>
      ${booking.deposit ? line(t('line.deposit'), money(booking.deposit)) : ''}
    </div>`;
}

/** What has been paid against a booking, and what is still owed. */
function paymentsBlock(booking, payments, paid) {
  const money = (amount) => formatMoney(amount, booking.currency);
  const balance = booking.totalPrice - paid;
  return html`
    <div class="pay-summary">
      <span class="pay-summary__item"><span>${t('payments.paid')}</span><strong>${money(paid)}</strong></span>
      <span class="pay-summary__item"><span>${t('payments.balance')}</span><strong class="${balance > 0 ? 'tone-pending' : 'saving'}">${money(balance)}</strong></span>
      ${balance <= 0 && paid > 0 ? html`<span class="badge badge--ok">${t('payments.settled')}</span>` : ''}
      <button class="btn btn--ghost btn--sm push" type="button" data-add-payment><i class="ri-add-line" aria-hidden="true"></i>${t('payments.add')}</button>
    </div>
    ${payments.length === 0
      ? html`<p class="empty">${t('payments.empty')}</p>`
      : html`
        <div class="table-wrap">
          <table class="table table--compact">
            <thead><tr><th>${t('field.paymentDate')}</th><th>${t('field.paymentKind')}</th><th>${t('field.paymentMethod')}</th><th>${t('field.paymentNote')}</th><th class="num">${t('field.paymentAmount')}</th><th></th></tr></thead>
            <tbody>
              ${payments.map(
                (payment) => html`
                  <tr>
                    <td class="nowrap">${formatDate(`${payment.paidOn}T00:00`)}</td>
                    <td>${t(`kind.${payment.kind}`)}</td>
                    <td>${t(`method.${payment.method}`)}</td>
                    <td class="cell-clamp">${payment.note}</td>
                    <td class="num"><strong>${payment.kind === 'refund' ? '−' : ''}${money(payment.amount)}</strong></td>
                    <td><button class="icon-btn icon-btn--sm icon-btn--danger" type="button" data-remove-payment="${payment.id}" aria-label="${t('common.delete')}"><i class="ri-delete-bin-line"></i></button></td>
                  </tr>`,
              )}
            </tbody>
          </table>
        </div>`}`;
}

/** Live quote returned by POST /api/admin/quote. */
function quoteBreakdown({ quote, offerError, available, unavailableReason }) {
  const money = (amount) => formatMoney(amount, quote.currency);
  return html`
    <div class="quote-lines">
      ${line(t('line.rental', { rate: money(quote.dailyRate), days: quote.days }), money(quote.rentalSubtotal))}
      ${quote.durationDiscount ? line(t('line.duration'), `−${money(quote.durationDiscount)}`, 'saving') : ''}
      ${quote.airportFee ? line(t('line.airport'), money(quote.airportFee)) : ''}
      ${quote.chauffeurFee ? line(t('line.chauffeur', { days: quote.days }), money(quote.chauffeurFee)) : ''}
      ${quote.promoDiscount ? line(t('line.promo', { code: quote.promoCode }), `−${money(quote.promoDiscount)}`, 'saving') : ''}
      <div class="quote-lines__total"><span>${t('line.total')}</span><span>${money(quote.total)}</span></div>
    </div>
    ${offerError ? html`<p class="form-error">${t(`errors.${offerError}`)}</p>` : ''}
    <p class="${available ? 'saving' : 'form-error'}">${available ? t('form.available') : t(`errors.${unavailableReason}`)}</p>`;
}

/** Records a payment, a deposit or a refund against a booking. */
function openPaymentDialog(ctx, booking, onSaved) {
  const formId = uniqueId('payment-form');
  const suggested = Math.max(0, booking.totalPrice - (booking.paid ?? 0));
  const { dialog, close } = openModal({
    title: t('payments.add'),
    size: 'md',
    content: html`
      <form class="form-grid" id="${formId}" novalidate>
        ${field(t('field.paymentAmount'), html`<input class="control" type="number" name="amount" min="1" max="100000000" value="${suggested || ''}" required>`)}
        ${field(t('field.paymentDate'), html`<input class="control" type="date" name="paidOn" value="${toLocalInput(new Date()).slice(0, 10)}" required>`)}
        ${field(
          t('field.paymentKind'),
          html`<select class="control" name="kind">${PAYMENT_KINDS.map((kind) => html`<option value="${kind}">${t(`kind.${kind}`)}</option>`)}</select>`,
        )}
        ${field(
          t('field.paymentMethod'),
          html`<select class="control" name="method">${PAYMENT_METHODS.map((method) => html`<option value="${method}">${t(`method.${method}`)}</option>`)}</select>`,
        )}
        ${field(t('field.paymentNote'), html`<input class="control" name="note" maxlength="300">`, { span: true })}
        <p class="form-error span-all" data-error role="alert"></p>
      </form>`,
    footer: html`
      <button class="btn btn--ghost" type="button" data-modal-close>${t('common.cancel')}</button>
      <button class="btn btn--primary" type="submit" form="${formId}">${t('common.save')}</button>`,
  });

  const form = $(`#${formId}`, dialog);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    await withBusy(dialog.querySelector(`[form="${formId}"]`), async () => {
      try {
        const result = await ctx.api(`/bookings/${booking.id}/payments`, { method: 'POST', body: readForm(form) });
        toast(t('payments.added'));
        close();
        onSaved(result);
      } catch (err) {
        $('[data-error]', form).textContent = errorText(err);
        showFieldErrors(form, err);
      }
    });
  });
}

/** Staff edit of dates, car, extras or promo — the server re-prices everything. */
async function openReschedule(ctx, booking, onSaved) {
  const { cars } = await ctx.api('/cars');
  const formId = uniqueId('reschedule-form');
  const { dialog, close } = openModal({
    title: t('bookings.editTitle', { reference: booking.reference }),
    size: 'md',
    content: html`
      <form class="form-grid" id="${formId}" novalidate>
        <p class="card__sub span-all">${t('bookings.editHint')}</p>
        ${field(
          t('form.car'),
          html`<select class="control" name="carId" required>
            ${cars.filter((car) => car.isActive || car.id === booking.carId).map((car) => html`<option value="${car.id}"${selected(car.id === booking.carId)}>${car.name} — ${formatMoney(car.dailyRate, ctx.settings.currency)}</option>`)}
          </select>`,
          { span: true },
        )}
        ${field(t('form.pickup'), html`<input class="control" type="datetime-local" name="pickupAt" value="${booking.pickupAt}" required>`)}
        ${field(t('form.return'), html`<input class="control" type="datetime-local" name="returnAt" value="${booking.returnAt}" required>`)}
        ${field(t('form.location'), html`<input class="control" name="pickupLocation" value="${booking.pickupLocation}" required maxlength="200">`, { span: true })}
        ${checkRow('airportDelivery', booking.airportDelivery, t('form.airport'))}
        ${checkRow('chauffeur', booking.chauffeur, t('form.chauffeur'))}
        ${field(t('form.promo'), html`<input class="control" name="promoCode" value="${booking.promoCode ?? ''}" maxlength="40" autocomplete="off">`, { span: true })}
        <div class="span-all">
          <p class="cell-sub">${t('bookings.currentTotal')}: <strong>${formatMoney(booking.totalPrice, booking.currency)}</strong></p>
          <div data-quote></div>
        </div>
        <p class="form-error span-all" data-error role="alert"></p>
      </form>`,
    footer: html`
      <button class="btn btn--ghost" type="button" data-modal-close>${t('common.cancel')}</button>
      <button class="btn btn--primary" type="submit" form="${formId}">${t('common.save')}</button>`,
  });

  const form = $(`#${formId}`, dialog);
  const quoteEl = $('[data-quote]', form);
  let requestId = 0;

  const payload = () => {
    const data = readForm(form);
    return { ...data, carId: Number(data.carId), promoCode: data.promoCode.trim().toUpperCase() };
  };

  async function refreshQuote() {
    const id = ++requestId;
    try {
      // The booking being edited must not clash with itself.
      const result = await ctx.api('/quote', { method: 'POST', body: { ...payload(), excludeBookingId: booking.id } });
      if (id === requestId) render(quoteEl, quoteBreakdown(result));
    } catch (err) {
      if (id === requestId) render(quoteEl, html`<p class="form-error">${errorText(err)}</p>`);
    }
  }

  form.addEventListener('change', () => refreshQuote());
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    await withBusy(dialog.querySelector(`[form="${formId}"]`), async () => {
      try {
        const { booking: updated } = await ctx.api(`/bookings/${booking.id}/dates`, { method: 'PUT', body: payload() });
        toast(t('bookings.rescheduled'));
        close();
        onSaved(updated);
      } catch (err) {
        $('[data-error]', form).textContent = errorText(err);
        showFieldErrors(form, err);
      }
    });
  });
  refreshQuote();
}

/** Renders a printable invoice into a dedicated print area and opens the print dialog. */
function printInvoice(data) {
  const { booking, payments, paid, balance, business, issuedAt } = data;
  const money = (amount) => formatMoney(amount, booking.currency);
  const area = document.createElement('div');
  area.id = 'print-area';
  area.dir = lang() === 'ar' ? 'rtl' : 'ltr';
  render(
    area,
    html`
      <header class="invoice__head">
        <div>
          <h1 class="invoice__brand">${business.name}</h1>
          <p class="invoice__meta">${lang() === 'ar' ? business.addressAr : business.addressEn}</p>
          <p class="invoice__meta" dir="ltr">${business.phone}${business.email ? ` · ${business.email}` : ''}</p>
        </div>
        <div class="invoice__id">
          <h2>${t('invoice.title')}</h2>
          <p class="invoice__meta">${t('invoice.number')}: <strong class="mono">${booking.reference}</strong></p>
          <p class="invoice__meta">${t('invoice.issued')}: ${formatDate(issuedAt)}</p>
          ${balance <= 0 ? html`<p class="invoice__stamp">${t('invoice.paidStamp')}</p>` : ''}
        </div>
      </header>

      <section class="invoice__parties">
        <div>
          <h3>${t('invoice.billTo')}</h3>
          <p>${booking.customerName}</p>
          <p dir="ltr">${booking.phone}</p>
          ${booking.email ? html`<p>${booking.email}</p>` : ''}
        </div>
        <div>
          <h3>${t('bookings.trip')}</h3>
          <p>${booking.pickupLocation}</p>
          <p>${formatDateTime(booking.pickupAt)} → ${formatDateTime(booking.returnAt)}</p>
          ${booking.driverName ? html`<p>${t('drivers.assign')}: ${booking.driverName}</p>` : ''}
        </div>
      </section>

      <table class="invoice__table">
        <thead><tr><th>${t('invoice.description')}</th><th class="num">${t('invoice.amount')}</th></tr></thead>
        <tbody>
          <tr>
            <td>${t('invoice.rental', { car: booking.carName, days: booking.days, from: formatDate(booking.pickupAt), to: formatDate(booking.returnAt) })}</td>
            <td class="num">${money(booking.rentalSubtotal)}</td>
          </tr>
          ${booking.durationDiscount ? html`<tr><td>${t('line.duration')}</td><td class="num">−${money(booking.durationDiscount)}</td></tr>` : ''}
          ${booking.extrasTotal ? html`<tr><td>${t('line.extras')}</td><td class="num">${money(booking.extrasTotal)}</td></tr>` : ''}
          ${booking.promoDiscount ? html`<tr><td>${t('line.promo', { code: booking.promoCode })}</td><td class="num">−${money(booking.promoDiscount)}</td></tr>` : ''}
        </tbody>
        <tfoot>
          <tr class="invoice__total"><th>${t('line.total')}</th><td class="num">${money(booking.totalPrice)}</td></tr>
          <tr><th>${t('payments.paid')}</th><td class="num">${money(paid)}</td></tr>
          <tr><th>${t('payments.balance')}</th><td class="num">${money(balance)}</td></tr>
        </tfoot>
      </table>

      ${payments.length
        ? html`
          <table class="invoice__table invoice__table--small">
            <thead><tr><th>${t('field.paymentDate')}</th><th>${t('field.paymentKind')}</th><th>${t('field.paymentMethod')}</th><th class="num">${t('invoice.amount')}</th></tr></thead>
            <tbody>
              ${payments.map(
                (payment) => html`
                  <tr>
                    <td>${formatDate(`${payment.paidOn}T00:00`)}</td>
                    <td>${t(`kind.${payment.kind}`)}</td>
                    <td>${t(`method.${payment.method}`)}</td>
                    <td class="num">${payment.kind === 'refund' ? '−' : ''}${money(payment.amount)}</td>
                  </tr>`,
              )}
            </tbody>
          </table>`
        : ''}

      <p class="invoice__thanks">${t('invoice.thanks', { business: business.name })}</p>`,
  );

  document.getElementById('print-area')?.remove();
  document.body.append(area);
  window.addEventListener('afterprint', () => area.remove(), { once: true });
  window.print();
}

async function openNewBooking(ctx, onCreated) {
  const { cars } = await ctx.api('/cars');
  const window = defaultWindow();
  const formId = uniqueId('new-booking-form');
  const { dialog, close } = openModal({
    title: t('bookings.new'),
    size: 'md',
    content: html`
      <form class="form-grid" id="${formId}" novalidate>
        ${field(
          t('form.car'),
          html`<select class="control" name="carId" required>
            <option value="">${t('form.chooseCar')}</option>
            ${cars
              .filter((car) => car.isActive)
              .map((car) => html`<option value="${car.id}">${car.name}${car.year ? ` ${car.year}` : ''} — ${formatMoney(car.dailyRate, ctx.settings.currency)}</option>`)}
          </select>`,
          { span: true },
        )}
        ${field(t('form.pickup'), html`<input class="control" type="datetime-local" name="pickupAt" value="${window.pickupAt}" required>`)}
        ${field(t('form.return'), html`<input class="control" type="datetime-local" name="returnAt" value="${window.returnAt}" required>`)}
        ${field(t('form.location'), html`<input class="control" name="pickupLocation" required maxlength="200">`, { span: true })}
        ${checkRow('airportDelivery', false, t('form.airport'))}
        ${checkRow('chauffeur', false, t('form.chauffeur'))}
        ${field(t('form.promo'), html`<input class="control" name="promoCode" maxlength="40" autocomplete="off">`, { span: true })}
        ${field(t('form.customerName'), html`<input class="control" name="customerName" required maxlength="100">`)}
        ${field(t('form.phone'), html`<input class="control" name="phone" type="tel" required maxlength="30" dir="ltr">`)}
        ${field(t('form.email'), html`<input class="control" name="email" type="email" maxlength="120">`, { span: true })}
        ${field(t('form.notes'), html`<textarea class="control" name="notes" rows="2" maxlength="1000"></textarea>`, { span: true })}
        <div class="span-all" data-quote><p class="cell-sub">${t('form.quoteHint')}</p></div>
        <p class="form-error span-all" data-error role="alert"></p>
      </form>`,
    footer: html`
      <button class="btn btn--ghost" type="button" data-modal-close>${t('common.cancel')}</button>
      <button class="btn btn--primary" type="submit" form="${formId}">${t('form.create')}</button>`,
  });

  const form = $(`#${formId}`, dialog);
  const quoteEl = $('[data-quote]', form);
  const errorEl = $('[data-error]', form);
  let requestId = 0;

  const payload = () => {
    const data = readForm(form);
    return { ...data, carId: Number(data.carId), promoCode: data.promoCode.trim().toUpperCase() };
  };

  async function refreshQuote() {
    const body = payload();
    const id = ++requestId;
    if (!body.carId || !body.pickupAt || !body.returnAt) {
      render(quoteEl, html`<p class="cell-sub">${t('form.quoteHint')}</p>`);
      return;
    }
    try {
      const result = await ctx.api('/quote', { method: 'POST', body });
      if (id === requestId) render(quoteEl, quoteBreakdown(result));
    } catch (err) {
      if (id === requestId) render(quoteEl, html`<p class="form-error">${errorText(err)}</p>`);
    }
  }

  form.addEventListener('change', (event) => {
    if (['carId', 'pickupAt', 'returnAt', 'airportDelivery', 'chauffeur', 'promoCode'].includes(event.target.name)) refreshQuote();
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    errorEl.textContent = '';
    if (!form.reportValidity()) return;
    const button = dialog.querySelector(`[form="${formId}"]`);
    await withBusy(button, async () => {
      try {
        const { booking } = await ctx.api('/bookings', { method: 'POST', body: payload() });
        toast(t('bookings.createdToast', { reference: booking.reference }));
        close();
        ctx.refreshBadges();
        onCreated(booking);
      } catch (err) {
        errorEl.textContent = errorText(err);
        showFieldErrors(form, err);
      }
    });
  });
}

export async function mount({ content, actions, ctx }) {
  const state = { bookings: [], status: 'all', query: '' };

  render(
    actions,
    html`
      <button class="btn btn--ghost btn--sm" type="button" data-export><i class="ri-download-2-line" aria-hidden="true"></i>${t('bookings.export')}</button>
      <button class="btn btn--primary btn--sm" type="button" data-new><i class="ri-add-line" aria-hidden="true"></i>${t('bookings.new')}</button>`,
  );
  render(
    content,
    html`
      <section class="card">
        <div class="card__head">
          <div class="toolbar" data-filters></div>
          <div class="input-icon">
            <i class="ri-search-line" aria-hidden="true"></i>
            <input class="control control--sm" type="search" data-search placeholder="${t('bookings.search')}" aria-label="${t('common.search')}">
          </div>
        </div>
        <div class="table-wrap" data-table></div>
      </section>`,
  );
  const table = $('[data-table]', content);
  const byId = (id) => state.bookings.find((booking) => booking.id === id);

  function filtered() {
    const query = state.query.trim().toLowerCase();
    return state.bookings.filter(
      (booking) =>
        (state.status === 'all' || booking.status === state.status) &&
        (!query || `${booking.reference} ${booking.customerName} ${booking.phone} ${booking.email} ${booking.carName}`.toLowerCase().includes(query)),
    );
  }

  function drawFilters() {
    const counts = {};
    for (const booking of state.bookings) counts[booking.status] = (counts[booking.status] ?? 0) + 1;
    render(
      $('[data-filters]', content),
      html`${['all', ...STATUSES].map(
        (status) => html`
          <button class="chip${state.status === status ? ' is-active' : ''}" type="button" data-filter="${status}" aria-pressed="${state.status === status}">
            ${status === 'all' ? t('common.all') : t(`status.${status}`)}
            <span class="chip__count">${status === 'all' ? state.bookings.length : (counts[status] ?? 0)}</span>
          </button>`,
      )}`,
    );
  }

  function rowHtml(booking) {
    const wa = whatsappLink(booking.phone);
    return html`
      <tr class="is-clickable" data-id="${booking.id}">
        <td>
          <span class="mono cell-main">${booking.reference}</span>
          <div class="cell-sub">${t(`channel.${booking.channel}`)} · ${formatTimestamp(booking.createdAt)}</div>
        </td>
        <td><div class="cell-main">${booking.customerName}</div><div class="cell-sub" dir="ltr">${booking.phone}</div></td>
        <td><div class="car-cell">${booking.carImage ? html`<img src="${booking.carImage}" alt="" loading="lazy">` : html`<span class="car-cell__placeholder"></span>`}<span>${booking.carName}</span></div></td>
        <td class="nowrap">${formatDateTime(booking.pickupAt)} → ${formatDateTime(booking.returnAt)}<div class="cell-sub">${t('bookings.days', { n: booking.days })}</div></td>
        <td class="nowrap">
          ${booking.airportDelivery ? html`<i class="ri-plane-line" title="${t('bookings.airport')}" aria-label="${t('bookings.airport')}"></i> ` : ''}
          ${booking.chauffeur ? html`<i class="ri-user-star-line" title="${t('bookings.chauffeur')}" aria-label="${t('bookings.chauffeur')}"></i>` : ''}
          ${!booking.airportDelivery && !booking.chauffeur ? t('bookings.none') : ''}
        </td>
        <td class="num">
          <strong>${formatMoney(booking.totalPrice, booking.currency)}</strong>
          ${booking.paid > 0 && booking.balance > 0 ? html`<div class="cell-sub">${t('payments.balance')}: ${formatMoney(booking.balance, booking.currency)}</div>` : ''}
          ${booking.paid > 0 && booking.balance <= 0 ? html`<div class="cell-sub saving">${t('payments.settled')}</div>` : ''}
        </td>
        <td>
          <select class="control control--sm status-select" data-status-select="${booking.id}" data-status="${booking.status}" aria-label="${t('col.status')}">
            ${statusOptions(booking.status)}
          </select>
        </td>
        <td>
          <div class="row-actions">
            ${wa ? html`<a class="icon-btn icon-btn--sm" href="${wa}" target="_blank" rel="noopener" aria-label="${t('bookings.whatsapp')}"><i class="ri-whatsapp-line"></i></a>` : ''}
            <button class="icon-btn icon-btn--sm icon-btn--danger" type="button" data-delete="${booking.id}" aria-label="${t('common.delete')}"><i class="ri-delete-bin-line"></i></button>
          </div>
        </td>
      </tr>`;
  }

  function drawTable() {
    const rows = filtered();
    if (rows.length === 0) {
      render(table, html`<p class="empty">${t('bookings.empty')}</p>`);
      return;
    }
    render(
      table,
      html`
        <table class="table">
          <thead>
            <tr>
              <th>${t('col.reference')}</th><th>${t('col.customer')}</th><th>${t('col.car')}</th><th>${t('col.dates')}</th>
              <th>${t('col.extras')}</th><th class="num">${t('col.total')}</th><th>${t('col.status')}</th><th><span class="sr-only">${t('common.actions')}</span></th>
            </tr>
          </thead>
          <tbody>${rows.map(rowHtml)}</tbody>
        </table>`,
    );
  }

  function draw() {
    drawFilters();
    drawTable();
  }

  async function load() {
    state.bookings = (await ctx.api('/bookings')).bookings;
    draw();
  }

  async function changeStatus(booking, status) {
    try {
      const { booking: updated } = await ctx.api(`/bookings/${booking.id}`, { method: 'PATCH', body: { status } });
      Object.assign(booking, updated);
      toast(t('bookings.statusChanged', { status: t(`status.${status}`) }));
      ctx.refreshBadges();
      return true;
    } catch (err) {
      toast(errorText(err), 'error');
      return false;
    } finally {
      draw();
    }
  }

  async function remove(booking) {
    if (!(await confirmDialog(t('bookings.confirmDelete', { reference: booking.reference })))) return;
    try {
      await ctx.api(`/bookings/${booking.id}`, { method: 'DELETE' });
      state.bookings = state.bookings.filter((item) => item.id !== booking.id);
      draw();
      toast(t('common.deleted'));
      ctx.refreshBadges();
    } catch (err) {
      toast(errorText(err), 'error');
    }
  }

  async function openDetails(booking) {
    const wa = whatsappLink(booking.phone);
    const [{ payments, paid }, { drivers }] = await Promise.all([ctx.api(`/bookings/${booking.id}/payments`), ctx.api('/drivers')]);
    booking.paid = paid;
    const { dialog, close } = openModal({
      title: t('bookings.details', { reference: booking.reference }),
      size: 'lg',
      content: html`
        <div class="grid-2">
          <section class="fieldset">
            <h3 class="fieldset__title">${t('bookings.customer')}</h3>
            <dl class="dl">
              <dt>${t('form.customerName')}</dt><dd>${booking.customerName}</dd>
              <dt>${t('form.phone')}</dt><dd dir="ltr">${booking.phone}</dd>
              ${booking.email ? html`<dt>${t('form.email')}</dt><dd><a href="mailto:${booking.email}">${booking.email}</a></dd>` : ''}
              <dt>${t('bookings.channel')}</dt><dd>${t(`channel.${booking.channel}`)}</dd>
              <dt>${t('bookings.created')}</dt><dd>${formatTimestamp(booking.createdAt)}</dd>
            </dl>
            <div class="photo-tools">
              <a class="btn btn--ghost btn--sm" href="tel:${booking.phone.replace(/[^\d+]/g, '')}"><i class="ri-phone-line" aria-hidden="true"></i>${t('bookings.call')}</a>
              ${wa ? html`<a class="btn btn--whatsapp btn--sm" href="${wa}" target="_blank" rel="noopener"><i class="ri-whatsapp-line" aria-hidden="true"></i>${t('bookings.whatsapp')}</a>` : ''}
            </div>
          </section>
          <section class="fieldset">
            <h3 class="fieldset__title">${t('bookings.trip')}</h3>
            <dl class="dl">
              <dt>${t('col.car')}</dt><dd>${booking.carName}</dd>
              <dt>${t('form.pickup')}</dt><dd>${formatDateTime(booking.pickupAt)}</dd>
              <dt>${t('form.return')}</dt><dd>${formatDateTime(booking.returnAt)} · ${t('bookings.days', { n: booking.days })}</dd>
              <dt>${t('bookings.location')}</dt><dd>${booking.pickupLocation}</dd>
              <dt>${t('col.extras')}</dt><dd>${extrasText(booking)}</dd>
            </dl>
            ${field(
              t('drivers.assign'),
              html`<select class="control control--sm" data-driver>
                <option value="">${t('drivers.none')}</option>
                ${drivers.filter((driver) => driver.isActive || driver.id === booking.driverId).map((driver) => html`<option value="${driver.id}"${selected(driver.id === booking.driverId)}>${driver.name}</option>`)}
              </select>`,
            )}
          </section>
        </div>
        <section class="fieldset">
          <h3 class="fieldset__title">${t('bookings.breakdown')}</h3>
          ${bookingBreakdown(booking)}
        </section>
        <section class="fieldset">
          <h3 class="fieldset__title">${t('payments.title')}</h3>
          <div data-payments>${paymentsBlock(booking, payments, paid)}</div>
        </section>
        ${booking.notes ? html`<section class="fieldset"><h3 class="fieldset__title">${t('bookings.notes')}</h3><p class="message__body">${booking.notes}</p></section>` : ''}
        <form class="fieldset" data-notes-form>
          ${field(t('bookings.adminNotes'), html`<textarea class="control" name="adminNotes" rows="3" maxlength="2000">${booking.adminNotes}</textarea>`)}
          <div><button class="btn btn--ghost btn--sm" type="submit">${t('bookings.saveNotes')}</button></div>
        </form>`,
      footer: html`
        <button class="btn btn--danger push" type="button" data-detail-delete><i class="ri-delete-bin-line" aria-hidden="true"></i>${t('common.delete')}</button>
        <button class="btn btn--ghost" type="button" data-invoice><i class="ri-printer-line" aria-hidden="true"></i>${t('invoice.open')}</button>
        <button class="btn btn--ghost" type="button" data-edit-booking><i class="ri-edit-line" aria-hidden="true"></i>${t('bookings.editDates')}</button>
        <select class="control control--sm status-select" data-detail-status data-status="${booking.status}" aria-label="${t('col.status')}">${statusOptions(booking.status)}</select>
        <button class="btn btn--ghost" type="button" data-modal-close>${t('common.close')}</button>`,
    });

    const paymentsEl = $('[data-payments]', dialog);
    const refreshPayments = (result) => {
      booking.paid = result.paid;
      booking.balance = booking.totalPrice - result.paid;
      render(paymentsEl, paymentsBlock(booking, result.payments, result.paid));
      draw();
    };

    paymentsEl.addEventListener('click', async (event) => {
      if (event.target.closest('[data-add-payment]')) {
        openPaymentDialog(ctx, booking, refreshPayments);
        return;
      }
      const remove = event.target.closest('[data-remove-payment]');
      if (!remove) return;
      if (!(await confirmDialog(t('payments.confirmDelete')))) return;
      try {
        refreshPayments(await ctx.api(`/payments/${remove.dataset.removePayment}`, { method: 'DELETE' }));
        toast(t('common.deleted'));
      } catch (err) {
        toast(errorText(err), 'error');
      }
    });

    const driverSelect = $('[data-driver]', dialog);
    driverSelect.addEventListener('change', async () => {
      try {
        const { booking: updated } = await ctx.api(`/bookings/${booking.id}`, {
          method: 'PATCH',
          body: { driverId: driverSelect.value ? Number(driverSelect.value) : null },
        });
        Object.assign(booking, updated);
        toast(t('drivers.assigned'));
        draw();
      } catch (err) {
        toast(errorText(err), 'error');
        driverSelect.value = booking.driverId ?? '';
      }
    });

    $('[data-invoice]', dialog).addEventListener('click', async (event) => {
      await withBusy(event.currentTarget, async () => {
        try {
          printInvoice(await ctx.api(`/bookings/${booking.id}/invoice`));
        } catch (err) {
          toast(errorText(err), 'error');
        }
      });
    });

    $('[data-edit-booking]', dialog).addEventListener('click', () => {
      openReschedule(ctx, booking, async (updated) => {
        Object.assign(booking, updated);
        close();
        draw();
        openDetails(booking).catch((err) => toast(errorText(err), 'error'));
      }).catch((err) => toast(errorText(err), 'error'));
    });

    const statusSelect = $('[data-detail-status]', dialog);
    statusSelect.addEventListener('change', async () => {
      await changeStatus(booking, statusSelect.value);
      statusSelect.value = booking.status;
      statusSelect.dataset.status = booking.status;
    });
    $('[data-detail-delete]', dialog).addEventListener('click', () => {
      close();
      remove(booking);
    });
    const notesForm = $('[data-notes-form]', dialog);
    notesForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      await withBusy($('button[type="submit"]', notesForm), async () => {
        try {
          const { booking: updated } = await ctx.api(`/bookings/${booking.id}`, {
            method: 'PATCH',
            body: { adminNotes: notesForm.elements.namedItem('adminNotes').value },
          });
          Object.assign(booking, updated);
          toast(t('common.saved'));
        } catch (err) {
          toast(errorText(err), 'error');
        }
      });
    });
  }

  content.addEventListener('click', (event) => {
    const filter = event.target.closest('[data-filter]');
    if (filter) {
      state.status = filter.dataset.filter;
      draw();
      return;
    }
    const del = event.target.closest('[data-delete]');
    if (del) {
      remove(byId(Number(del.dataset.delete)));
      return;
    }
    if (event.target.closest('a, button, select, input, textarea')) return;
    const row = event.target.closest('tr[data-id]');
    if (row) openDetails(byId(Number(row.dataset.id))).catch((err) => toast(errorText(err), 'error'));
  });
  content.addEventListener('change', (event) => {
    const select = event.target.closest('[data-status-select]');
    if (select) changeStatus(byId(Number(select.dataset.statusSelect)), select.value);
  });
  $('[data-search]', content).addEventListener(
    'input',
    debounce((event) => {
      state.query = event.target.value;
      drawTable();
    }, 150),
  );
  $('[data-export]', actions).addEventListener('click', () => downloadCsv(filtered()));
  $('[data-new]', actions).addEventListener('click', () =>
    openNewBooking(ctx, async (created) => {
      await load();
      const booking = byId(created.id);
      if (booking) await openDetails(booking);
    }),
  );

  await load();
  const openId = Number(new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('open'));
  if (openId && byId(openId)) openDetails(byId(openId)).catch((err) => toast(errorText(err), 'error'));
}
