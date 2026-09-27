import { api } from '../core/api.js';
import { $, $$, html, raw, render } from '../core/dom.js';
import { addDays, defaultWindow, formatDate, formatMoney, formatNumber, toLocalInput } from '../core/format.js';
import { initI18n, pick, t } from '../core/i18n.js';
import { applyBrand, loadSettings } from './brand.js';
import { initConcierge } from './chat.js';
import { initContent } from './content.js';
import { createFleet } from './fleet.js';
import { initHeader } from './header.js';
import { clearWindow, isValidLocal, readWindow, saveWindow } from './rental-window.js';
import { siteStrings } from './strings.js';
import { clearInvalid, errorMessage, initReveal, markInvalid, toast } from './ui.js';

const HERO_INTERVAL_MS = 6500;

initI18n(siteStrings);
initHeader();
initReveal();

const settings = await loadSettings();
const money = (amount) => formatMoney(amount, settings.currency);
const fleet = createFleet($('#fleet'), { currency: settings.currency, onWindowCleared: clearWindow });
let offers = [];
let hero = null;

function applyPage() {
  applyBrand(settings);
  document.title = t('page.title', { business: settings.businessName });
}

// --- Hero: featured cars rotate behind the headline ------------------------------

function initHero(cars) {
  const withImages = cars.filter((car) => car.images.length > 0);
  const featured = withImages.filter((car) => car.isFeatured);
  const slides = (featured.length > 0 ? featured : withImages).slice(0, 5);
  const media = $('[data-hero-media]');
  const feature = $('[data-hero-feature]');
  if (slides.length === 0) return null;

  const slide = (car, i) =>
    html`<figure class="hero__slide${i === 0 ? ' is-active' : ''}"><img src="${car.images[0].src}?v=bespoke" alt="" decoding="async"${raw(i === 0 ? '' : ' loading="lazy"')}></figure>`;
  // The first slide is server-rendered for a fast first paint; keep it if it matches.
  if ($('img', media)?.getAttribute('src') === slides[0].images[0].src) {
    media.insertAdjacentHTML('beforeend', String(html`${slides.slice(1).map((car, i) => slide(car, i + 1))}`));
  } else {
    render(media, html`${slides.map(slide)}`);
  }

  let index = 0;
  let timer = null;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function renderFeature() {
    const car = slides[index];
    render(
      feature,
      html`<p class="eyebrow">${t('hero.featured')}</p>
        <a class="hero-feature__name" href="/cars/${car.slug}">${car.name}</a>
        <p class="hero-feature__price">${t('hero.from', { price: money(car.dailyRate) })}</p>
        ${slides.length > 1
          ? html`<div class="hero-dots">${slides.map(
              (item, n) => html`<button type="button" data-hero-dot="${n}" aria-label="${t('hero.slide', { name: item.name })}" aria-current="${n === index}"></button>`,
            )}</div>`
          : ''}`,
    );
  }

  function show(next) {
    index = (next + slides.length) % slides.length;
    $$('.hero__slide', media).forEach((figure, n) => figure.classList.toggle('is-active', n === index));
    renderFeature();
  }

  function restart() {
    clearInterval(timer);
    if (reducedMotion || slides.length < 2) return;
    timer = setInterval(() => {
      if (!document.hidden) show(index + 1);
    }, HERO_INTERVAL_MS);
  }

  feature.addEventListener('click', (event) => {
    const dot = event.target.closest('[data-hero-dot]');
    if (!dot) return;
    show(Number(dot.dataset.heroDot));
    restart();
  });

  renderFeature();
  restart();
  return { renderFeature };
}

// --- Availability search ---------------------------------------------------------

function initSearch() {
  const form = $('[data-hero-search]');
  const error = $('[data-search-error]');
  const pickup = form.elements.namedItem('pickupAt');
  const dropoff = form.elements.namedItem('returnAt');

  const initial = readWindow() ?? defaultWindow();
  pickup.value = initial.pickupAt;
  dropoff.value = initial.returnAt;
  pickup.min = toLocalInput(new Date());

  pickup.addEventListener('change', () => {
    dropoff.min = pickup.value;
    if (isValidLocal(pickup.value) && dropoff.value <= pickup.value) dropoff.value = addDays(pickup.value, 1);
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    error.textContent = '';
    const window = { pickupAt: pickup.value, returnAt: dropoff.value };
    if (!isValidLocal(window.pickupAt) || !isValidLocal(window.returnAt) || window.returnAt <= window.pickupAt) {
      error.textContent = t('search.invalid');
      return;
    }
    saveWindow(window);
    await fleet.load(window);
    $('#fleet').scrollIntoView({ behavior: 'smooth' });
  });
}

// --- Data-driven sections ----------------------------------------------------------

function renderStats(cars) {
  const values = {
    vehicles: formatNumber(cars.length),
    brands: formatNumber(new Set(cars.map((car) => car.brand)).size),
    concierge: '24/7',
    delivery: money(settings.airportFee),
  };
  $$('[data-stat]').forEach((el) => {
    el.textContent = values[el.dataset.stat];
  });
}

function renderCollections(cars) {
  $$('[data-collection]').forEach((tile) => {
    const inCategory = cars.filter((car) => car.category === tile.dataset.collection);
    tile.hidden = inCategory.length === 0;
    const cover = inCategory.find((car) => car.isFeatured && car.images.length) ?? inCategory.find((car) => car.images.length);
    const img = $('img', tile);
    if (cover && img.getAttribute('src') !== cover.images[0].src) img.src = cover.images[0].src;
    $('[data-collection-cta]', tile).textContent = t('collections.cta', { count: inCategory.length });
  });
}

function longTermText() {
  const weekly = settings.weeklyDiscountPercent;
  const monthly = settings.monthlyDiscountPercent;
  if (weekly && monthly) return t('service.longterm.both', { weekly, monthly });
  if (weekly) return t('service.longterm.weekly', { weekly });
  if (monthly) return t('service.longterm.monthly', { monthly });
  return t('service.longterm.text');
}

function renderServices() {
  const texts = {
    airport: t('service.airport.text', { price: money(settings.airportFee) }),
    chauffeur: t('service.chauffeur.text', { price: money(settings.chauffeurDailyRate) }),
    weddings: t('service.weddings.text'),
    longterm: longTermText(),
  };
  $$('[data-service]').forEach((el) => {
    el.textContent = texts[el.dataset.service];
  });
}

function renderOffers() {
  const hasOffers = offers.length > 0;
  $('[data-offers-section]').hidden = !hasOffers;
  $$('[data-nav-offers]').forEach((link) => {
    link.hidden = !hasOffers;
  });
  render(
    $('[data-offers]'),
    html`${offers.map((offer) => {
      const description = pick(offer, 'description');
      const length = offer.minDays > 1 ? t('offer.minDays', { n: offer.minDays }) : t('offer.anyLength');
      const expiry = offer.validUntil ? ` · ${t('offer.until', { date: formatDate(`${offer.validUntil}T00:00`) })}` : '';
      return html`
        <article class="offer" data-reveal>
          <div class="offer__value"><strong>${offer.discountPercent}%</strong><span>${t('offer.off')}</span></div>
          <div class="offer__body">
            <p class="offer__code">${offer.code}</p>
            ${description ? html`<p class="offer__desc">${description}</p>` : ''}
            <p class="offer__meta">${length}${expiry}</p>
            <button class="btn btn--ghost btn--sm" type="button" data-copy-code="${offer.code}"><i class="ri-file-copy-line" aria-hidden="true"></i>${t('offer.copy')}</button>
          </div>
        </article>`;
    })}`,
  );
  $$('[data-offers] [data-reveal]').forEach((el) => el.classList.add('is-visible'));
}

async function loadOffers() {
  try {
    ({ offers } = await api('/offers'));
  } catch {
    offers = [];
  }
  renderOffers();
}

function initContactForm() {
  const form = $('[data-contact-form]');
  const status = $('[data-contact-status]');
  const button = $('button[type="submit"]', form);
  const value = (name) => form.elements.namedItem(name).value;

  form.addEventListener('input', (event) => clearInvalid(event.target));
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    status.className = 'form-status';
    status.textContent = '';
    button.classList.add('is-loading');
    try {
      await api('/messages', {
        method: 'POST',
        body: { name: value('name'), phone: value('phone'), email: value('email'), message: value('message'), source: 'contact' },
      });
      form.reset();
      status.textContent = t('contact.sent');
      status.classList.add('form-status--success');
    } catch (err) {
      status.textContent = errorMessage(err);
      status.classList.add('form-status--error');
      markInvalid(form, err);
    } finally {
      button.classList.remove('is-loading');
    }
  });
}

// --- Wiring -------------------------------------------------------------------------

applyPage();
initSearch();
renderServices();
initContactForm();
initConcierge({ settings });
initContent();
loadOffers();

fleet.onLoad((cars) => {
  hero ??= initHero(cars);
  renderStats(cars);
  renderCollections(cars);
});

const savedWindow = readWindow();
fleet.load(savedWindow && savedWindow.pickupAt >= toLocalInput(new Date()) ? savedWindow : null);

$$('[data-collection]').forEach((tile) => {
  tile.addEventListener('click', () => {
    fleet.setCategory(tile.dataset.collection);
    $('#fleet').scrollIntoView({ behavior: 'smooth' });
  });
});

$('[data-offers]').addEventListener('click', async (event) => {
  const button = event.target.closest('[data-copy-code]');
  if (!button) return;
  const code = button.dataset.copyCode;
  try {
    await navigator.clipboard.writeText(code);
    toast(t('offer.copied', { code }));
  } catch {
    toast(t('toast.copyFailed', { code }), 'error');
  }
});

document.addEventListener('langchange', () => {
  applyPage();
  fleet.rerender();
  hero?.renderFeature();
  renderStats(fleet.cars);
  renderCollections(fleet.cars);
  renderServices();
  renderOffers();
});
