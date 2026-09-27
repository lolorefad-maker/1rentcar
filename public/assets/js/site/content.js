import { api } from '../core/api.js';
import { $, html, render } from '../core/dom.js';
import { pick } from '../core/i18n.js';

/**
 * Reviews and FAQ come from the admin panel. The markup already in the page is
 * the fallback: it stays if the request fails, so the section is never empty
 * because of a network hiccup.
 */
let loaded = null;

const initial = (name) => (name || '?').trim().charAt(0).toUpperCase();
const stars = (rating) => '★'.repeat(rating) + '☆'.repeat(5 - rating);

function renderTestimonials(items) {
  const grid = $('[data-reviews]');
  if (!grid) return;
  const section = grid.closest('section');
  if (items.length === 0) {
    section.hidden = true;
    return;
  }
  section.hidden = false;
  render(
    grid,
    html`${items.map(
      (item) => html`
        <figure class="review" data-reveal>
          <div class="review__stars" aria-label="${item.rating}/5">${stars(item.rating)}</div>
          <blockquote class="review__text">${pick(item, 'text')}</blockquote>
          <figcaption class="review__person">
            <span class="review__avatar" aria-hidden="true">${initial(pick(item, 'name'))}</span>
            <span><strong>${pick(item, 'name')}</strong><br><span class="review__role">${pick(item, 'role')}</span></span>
          </figcaption>
        </figure>`,
    )}`,
  );
}

function renderFaqs(items) {
  const list = $('[data-faq]');
  if (!list) return;
  const section = list.closest('section');
  if (items.length === 0) {
    section.hidden = true;
    return;
  }
  section.hidden = false;
  render(
    list,
    html`${items.map(
      (item) => html`
        <details>
          <summary><span>${pick(item, 'question')}</span><i class="ri-add-line" aria-hidden="true"></i></summary>
          <p>${pick(item, 'answer')}</p>
        </details>`,
    )}`,
  );
}

function draw() {
  if (!loaded) return;
  renderTestimonials(loaded.testimonials);
  renderFaqs(loaded.faqs);
}

export async function initContent() {
  try {
    loaded = await api('/content');
  } catch {
    return; // keep the markup already in the page
  }
  draw();
  document.addEventListener('langchange', draw);
}
