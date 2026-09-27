import { html } from '../core/dom.js';
import { formatMoney } from '../core/format.js';
import { t } from '../core/i18n.js';

const AVAILABILITY_TONE = { available: 'success', booked: 'danger', on_rent: 'warning', maintenance: 'muted' };

export function carUrl(car, window) {
  const base = `/cars/${encodeURIComponent(car.slug)}`;
  if (!window) return base;
  return `${base}?from=${encodeURIComponent(window.pickupAt)}&to=${encodeURIComponent(window.returnAt)}`;
}

export function availabilityBadge(availability) {
  return html`<span class="badge badge--dot badge--${AVAILABILITY_TONE[availability] ?? 'muted'}">${t(`avail.${availability}`)}</span>`;
}

export function carSpecs(car) {
  return [
    car.year,
    t('spec.seats', { n: car.seats }),
    t(`fuel.${car.fuel}`),
    car.transmission && t(`trans.${car.transmission}`),
  ].filter(Boolean);
}

/** 
 * A sleek modern VIP fleet card matching the reference design:
 * Centered crisp vehicle image, model name + 5-star rating on the left, price on the right.
 */
export function carCard(car, { currency, window = null, index = 0 }) {
  const image = car.images[0];
  const unavailable = car.availability !== 'available';
  const priceDisplay =
    window && car.quote
      ? html`<div class="price-val"><strong>${formatMoney(car.quote.total, currency)}</strong><small>${t('card.total', { days: window.days })}</small></div>`
      : html`<div class="price-val"><strong>${formatMoney(car.dailyRate, currency)}</strong></div>`;

  return html`
    <article class="car-card${unavailable ? ' is-unavailable' : ''}" style="--i: ${index % 12}">
      <a class="car-card__link" href="${carUrl(car, window)}">
        <div class="car-card__media">
          ${image ? html`<img src="${image.thumb}?v=bespoke" alt="${car.name}" loading="lazy" decoding="async" width="640" height="400">` : ''}
          <div class="car-card__badges">
            ${car.isFeatured ? html`<span class="badge badge--gold">${t('card.featured')}</span>` : ''}
            ${window || unavailable ? availabilityBadge(car.availability) : ''}
          </div>
        </div>
        <div class="car-card__body">
          <div class="car-card__header-row">
            <div class="car-card__meta">
              <h3 class="car-card__title">${car.brand} ${car.model}${car.trim ? html` <span class="car-card__trim">${car.trim}</span>` : ''}</h3>
              <div class="car-card__stars" aria-label="5 out of 5 stars">
                <span class="star-rating">★★★★★</span>
              </div>
            </div>
            <div class="car-card__pricing">
              ${priceDisplay}
            </div>
          </div>
          <div class="car-card__footer-action">
            <span class="car-card__view-btn">${t('card.view') || 'Book Now'} <i class="ri-arrow-right-line flip-rtl"></i></span>
          </div>
        </div>
      </a>
    </article>`;
}
