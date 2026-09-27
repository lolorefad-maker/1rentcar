import { api } from '../core/api.js';
import { $, html, render } from '../core/dom.js';
import { formatDateTime, formatMoney } from '../core/format.js';
import { initI18n, lang, pick, t } from '../core/i18n.js';
import { initBooking } from './booking.js';
import { applyBrand, loadSettings, whatsappUrl } from './brand.js';
import { availabilityBadge, carCard } from './car-card.js';
import { initConcierge } from './chat.js';
import { createGallery } from './gallery.js';
import { initHeader } from './header.js';
import { siteStrings } from './strings.js';

const COLORS_AR = {
  Black: 'أسود',
  White: 'أبيض',
  Grey: 'رمادي',
  'Dark Grey': 'رمادي داكن',
  Silver: 'فضي',
  Red: 'أحمر',
  Yellow: 'أصفر',
  Burgundy: 'عنابي',
  Beige: 'بيج',
  Ivory: 'عاجي',
  'Two-Tone': 'لونين',
  'Black & Silver': 'أسود وفضي',
  'Matte Black': 'أسود مطفي',
  'Dark Green': 'أخضر داكن',
};

initI18n(siteStrings);
initHeader();

const settings = await loadSettings();
applyBrand(settings);
initConcierge({ settings });

const slug = decodeURIComponent(window.location.pathname.match(/^\/cars\/([^/]+)/)?.[1] ?? '');
let data = null;
try {
  data = slug ? await api(`/cars/${encodeURIComponent(slug)}`) : null;
} catch {
  data = null;
}

if (data) showCar(data);
else showMissing();

function showMissing() {
  $('[data-car-content]').hidden = true;
  $('[data-car-missing]').hidden = false;
  document.title = `${t('car.notFound')} — ${settings.businessName}`;
}

function colorLabel(color) {
  return lang() === 'ar' ? (COLORS_AR[color] ?? color) : color;
}

function specs(car) {
  return [
    { icon: 'ri-group-line', label: t('label.seats'), value: car.seats },
    car.transmission && { icon: 'ri-steering-2-line', label: t('label.transmission'), value: t(`trans.${car.transmission}`) },
    { icon: car.fuel === 'electric' ? 'ri-flashlight-line' : 'ri-gas-station-line', label: t('label.fuel'), value: t(`fuel.${car.fuel}`) },
    car.powerHp && { icon: 'ri-speed-up-line', label: t('label.power'), value: t('spec.hp', { n: car.powerHp }) },
    car.year && { icon: 'ri-calendar-line', label: t('label.year'), value: car.year },
    car.color && { icon: 'ri-palette-line', label: t('label.color'), value: colorLabel(car.color) },
  ].filter(Boolean);
}

function whatsappMessage(booking, details) {
  const money = (amount) => formatMoney(amount, booking.currency);
  return [
    t('wa.booking', { business: settings.businessName }),
    t('wa.reference', { reference: booking.reference }),
    t('wa.car', { car: booking.carName }),
    t('wa.dates', { from: formatDateTime(booking.pickupAt), to: formatDateTime(booking.returnAt), days: booking.days }),
    t('wa.location', { location: booking.pickupLocation }),
    t('wa.total', { total: money(booking.totalPrice) }),
    t('wa.name', { name: details.customerName }),
  ].join('\n');
}

function showConfirmation(booking, { channel, details }) {
  const dialog = $('[data-confirm-dialog]');
  const waLink = whatsappUrl(settings, whatsappMessage(booking, details));
  render(
    $('[data-confirm-body]', dialog),
    html`
      <div class="confirm__icon" aria-hidden="true"><i class="ri-check-line"></i></div>
      <h2 class="confirm__title">${t('confirm.title')}</h2>
      <p class="muted">${t('confirm.reference')}</p>
      <p class="confirm__ref">${booking.reference}</p>
      <p class="confirm__summary">${booking.carName} · ${formatDateTime(booking.pickupAt)} → ${formatDateTime(booking.returnAt)} · ${formatMoney(booking.totalPrice, booking.currency)}</p>
      <p class="confirm__summary">${t('confirm.text', { phone: details.phone })}</p>
      <div class="confirm__actions">
        ${waLink ? html`<a class="btn btn--whatsapp" href="${waLink}" target="_blank" rel="noopener"><i class="ri-whatsapp-line" aria-hidden="true"></i>${t('confirm.whatsapp')}</a>` : ''}
        <button class="btn btn--primary" type="button" data-confirm-close>${t('confirm.done')}</button>
      </div>`,
  );
  dialog.showModal();
  if (channel === 'whatsapp' && waLink) window.open(waLink, '_blank', 'noopener');
}

function showCar({ car, reserved, similar }) {
  const money = (amount) => formatMoney(amount, settings.currency);
  let reservedWindows = reserved;

  const gallery = createGallery($('[data-gallery]'), car.images, { name: car.name });
  const booking = initBooking($('[data-booking-form]'), {
    car,
    settings,
    onBooked(result, context) {
      showConfirmation(result, context);
      refreshReserved();
    },
  });

  function renderReserved() {
    $('[data-reserved-section]').hidden = reservedWindows.length === 0;
    render(
      $('[data-reserved]'),
      html`${reservedWindows.map(
        (window) => html`<li class="badge badge--warning">${formatDateTime(window.pickupAt)} → ${formatDateTime(window.returnAt)}</li>`,
      )}`,
    );
  }

  async function refreshReserved() {
    try {
      reservedWindows = (await api(`/cars/${encodeURIComponent(car.slug)}`)).reserved;
      renderReserved();
    } catch {
      /* keep the previous list */
    }
  }

  function renderPage() {
    document.title = `${car.name}${car.year ? ` ${car.year}` : ''} — ${settings.businessName}`;
    $('[data-car-crumb]').textContent = car.name;
    render(
      $('[data-car-head]'),
      html`
        <div>
          <p class="eyebrow">${car.brand}</p>
          <h1 class="car-head__title display">${car.model}${car.trim ? html` <span class="muted">${car.trim}</span>` : ''}</h1>
          <div class="car-head__meta">
            ${car.year ? html`<span class="badge">${car.year}</span>` : ''}
            <span class="badge">${t(`cat.${car.category}`)}</span>
            ${availabilityBadge(car.availability)}
          </div>
        </div>
        <div class="car-head__price"><strong>${money(car.dailyRate)}</strong><span>${t('car.perDay')}</span></div>`,
    );
    render(
      $('[data-specs]'),
      html`${specs(car).map(
        (spec) => html`<div class="spec"><i class="${spec.icon}" aria-hidden="true"></i><small>${spec.label}</small><strong>${spec.value}</strong></div>`,
      )}`,
    );
    $('[data-tagline]').textContent = pick(car, 'tagline');
    $('[data-description]').textContent = pick(car, 'description');
    $('[data-booking-rate]').textContent = money(car.dailyRate);
    $('[data-mobile-price]').textContent = money(car.dailyRate);
    renderReserved();

    $('[data-similar-section]').hidden = similar.length === 0;
    render($('[data-similar]'), html`${similar.map((item, index) => carCard(item, { currency: settings.currency, index }))}`);
  }

  renderPage();

  const mobileBar = $('[data-mobile-bar]');
  mobileBar.hidden = false;
  document.body.classList.add('has-mobile-bar');
  $('[data-mobile-book]').addEventListener('click', () => {
    const form = $('[data-booking-form]');
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    form.elements.namedItem('pickupAt').focus({ preventScroll: true });
  });

  const dialog = $('[data-confirm-dialog]');
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog || event.target.closest('[data-confirm-close]')) dialog.close();
  });

  document.addEventListener('langchange', () => {
    renderPage();
    gallery.refreshLabels();
    booking.refreshLabels();
  });
}
