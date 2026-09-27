import { api } from '../core/api.js';
import { $, html, render } from '../core/dom.js';
import { addDays, defaultWindow, formatMoney, toLocalInput } from '../core/format.js';
import { t } from '../core/i18n.js';
import { isValidLocal, readWindow, saveWindow } from './rental-window.js';
import { clearInvalid, errorMessage, markInvalid } from './ui.js';

const HOUR_MS = 3_600_000;
const QUOTE_FIELDS = new Set(['pickupAt', 'returnAt', 'airportDelivery', 'chauffeur']);

/**
 * The car-page booking form. Every price shown here comes from POST /api/quote —
 * the same server calculation that is stored on the booking.
 */
export function initBooking(form, { car, settings, onBooked }) {
  const field = (name) => form.elements.namedItem(name);
  const quoteEl = $('[data-quote]', form);
  const availabilityEl = $('[data-availability]', form);
  const promoStatus = $('[data-promo-status]', form);
  const errorEl = $('[data-form-error]', form);
  const submitButton = $('[data-book-submit]', form);
  const whatsappButton = $('[data-book-whatsapp]', form);
  const money = (amount) => formatMoney(amount, settings.currency);

  let appliedPromo = '';
  let result = null;
  let requestId = 0;

  // Dates: from the link (?from&to), else the dates chosen on the home page, else a sensible default.
  const params = new URLSearchParams(window.location.search);
  const linked = { pickupAt: params.get('from'), returnAt: params.get('to') };
  const initial = isValidLocal(linked.pickupAt) && isValidLocal(linked.returnAt) ? linked : (readWindow() ?? defaultWindow());
  field('pickupAt').value = initial.pickupAt;
  field('returnAt').value = initial.returnAt;
  field('pickupAt').min = toLocalInput(new Date(Date.now() + settings.minimumNoticeHours * HOUR_MS));

  const payload = () => ({
    carId: car.id,
    pickupAt: field('pickupAt').value,
    returnAt: field('returnAt').value,
    airportDelivery: field('airportDelivery').checked,
    chauffeur: field('chauffeur').checked,
    promoCode: appliedPromo,
  });

  function renderExtras() {
    $('[data-extra-price="airport"]', form).textContent = t('extra.once', { price: money(settings.airportFee) });
    $('[data-extra-price="chauffeur"]', form).textContent = t('extra.daily', { price: money(settings.chauffeurDailyRate) });
  }

  const line = (label, value, saving = false) =>
    html`<div class="quote__line${saving ? ' quote__line--saving' : ''}"><span>${label}</span><span>${value}</span></div>`;

  function renderQuote() {
    const { quote } = result;
    render(
      quoteEl,
      html`
        ${line(t('line.rental', { rate: money(quote.dailyRate), days: quote.days }), money(quote.rentalSubtotal))}
        ${quote.durationDiscount ? line(t('line.duration', { n: quote.durationPercent }), `−${money(quote.durationDiscount)}`, true) : ''}
        ${quote.airportFee ? line(t('line.airport'), money(quote.airportFee)) : ''}
        ${quote.chauffeurFee ? line(t('line.chauffeur', { days: quote.days }), money(quote.chauffeurFee)) : ''}
        ${quote.promoDiscount ? line(t('line.promo', { code: quote.promoCode, n: quote.promoPercent }), `−${money(quote.promoDiscount)}`, true) : ''}
        <div class="quote__total"><span>${t('line.total')}</span><strong>${money(quote.total)}</strong></div>
        ${quote.deposit ? html`<p class="quote__note">${t('line.deposit', { amount: money(quote.deposit) })}</p>` : ''}`,
    );
  }

  function renderMessage(text) {
    result = null;
    render(quoteEl, html`<p class="quote__empty">${text}</p>`);
  }

  function renderStatus() {
    promoStatus.className = 'promo-status';
    promoStatus.textContent = '';
    if (appliedPromo && result) {
      const failed = Boolean(result.offerError);
      promoStatus.textContent = failed
        ? t(`errors.${result.offerError}`)
        : t('booking.promoApplied', { code: result.quote.promoCode, n: result.quote.promoPercent });
      promoStatus.classList.add(failed ? 'promo-status--error' : 'promo-status--ok');
    }

    availabilityEl.hidden = !result;
    if (result) {
      const ok = result.available;
      availabilityEl.className = `availability availability--${ok ? 'ok' : 'bad'}`;
      render(
        availabilityEl,
        html`<i class="${ok ? 'ri-checkbox-circle-line' : 'ri-error-warning-line'}" aria-hidden="true"></i>
             <span>${ok ? t('booking.available') : t(`errors.${result.unavailableReason}`)}</span>`,
      );
    }

    const bookable = Boolean(result?.available);
    submitButton.disabled = !bookable;
    whatsappButton.disabled = !bookable;
  }

  async function refreshQuote() {
    const body = payload();
    const id = ++requestId;
    if (!isValidLocal(body.pickupAt) || !isValidLocal(body.returnAt)) {
      renderMessage(t('booking.pickDates'));
      renderStatus();
      return;
    }
    quoteEl.classList.add('is-loading');
    try {
      const data = await api('/quote', { method: 'POST', body });
      if (id !== requestId) return;
      result = data;
      saveWindow(body);
      renderQuote();
    } catch (err) {
      if (id !== requestId) return;
      renderMessage(errorMessage(err));
    } finally {
      if (id === requestId) {
        quoteEl.classList.remove('is-loading');
        renderStatus();
      }
    }
  }

  function keepReturnAfterPickup() {
    const pickup = field('pickupAt').value;
    field('returnAt').min = pickup;
    if (isValidLocal(pickup) && field('returnAt').value <= pickup) field('returnAt').value = addDays(pickup, 1);
  }

  function applyPromo() {
    appliedPromo = field('promoCode').value.trim().toUpperCase();
    field('promoCode').value = appliedPromo;
    refreshQuote();
  }

  async function submit(channel) {
    if (!result?.available) return;
    errorEl.textContent = '';
    const button = channel === 'whatsapp' ? whatsappButton : submitButton;
    const details = {
      customerName: field('customerName').value,
      phone: field('phone').value,
      email: field('email').value,
      pickupLocation: field('pickupLocation').value,
      notes: field('notes').value,
    };
    button.classList.add('is-loading');
    try {
      // An invalid code was already flagged to the customer and excluded from the quoted total.
      const promoCode = result.offerError ? '' : appliedPromo;
      const { booking } = await api('/bookings', { method: 'POST', body: { ...payload(), promoCode, ...details, channel } });
      onBooked(booking, { channel, details });
      refreshQuote();
    } catch (err) {
      errorEl.textContent = errorMessage(err);
      markInvalid(form, err);
      if (err.code === 'car_unavailable' || err.code === 'car_maintenance' || err.code.startsWith('offer_')) refreshQuote();
    } finally {
      button.classList.remove('is-loading');
    }
  }

  form.addEventListener('change', (event) => {
    if (!QUOTE_FIELDS.has(event.target.name)) return;
    if (event.target.name === 'pickupAt') keepReturnAfterPickup();
    refreshQuote();
  });
  form.addEventListener('input', (event) => clearInvalid(event.target));
  $('[data-promo-apply]', form).addEventListener('click', applyPromo);
  field('promoCode').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      applyPromo();
    }
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    submit('web');
  });
  whatsappButton.addEventListener('click', () => {
    if (form.reportValidity()) submit('whatsapp');
  });

  renderExtras();
  refreshQuote();

  return {
    refreshLabels() {
      renderExtras();
      if (result) {
        renderQuote();
        renderStatus();
      } else {
        refreshQuote();
      }
    },
  };
}
