import { $, debounce, html, render } from '../../core/dom.js';
import { formatMoney } from '../../core/format.js';
import { t } from '../../core/i18n.js';
import { confirmDialog, errorText, selected, toast, toggle } from '../ui.js';
import { openCarEditor } from './car-editor.js';

const CATEGORIES = ['luxury', 'suv', 'sports', 'convertible', 'classic', 'electric'];
const SAVED_FLASH_MS = 1600;

export async function mount({ content, actions, ctx }) {
  const state = { cars: [], query: '', category: 'all' };
  const money = (amount) => formatMoney(amount, ctx.settings.currency);

  render(actions, html`<button class="btn btn--primary btn--sm" type="button" data-add><i class="ri-add-line" aria-hidden="true"></i>${t('fleet.add')}</button>`);
  render(
    content,
    html`
      <section class="card">
        <div class="card__head">
          <div class="toolbar">
            <div class="input-icon">
              <i class="ri-search-line" aria-hidden="true"></i>
              <input class="control control--sm" type="search" data-search placeholder="${t('fleet.search')}" aria-label="${t('fleet.search')}">
            </div>
            <select class="control control--sm" data-category aria-label="${t('col.category')}">
              <option value="all">${t('fleet.allCategories')}</option>
              ${CATEGORIES.map((category) => html`<option value="${category}">${t(`cat.${category}`)}</option>`)}
            </select>
          </div>
          <span class="card__sub" data-count></span>
        </div>
        <div class="table-wrap" data-table></div>
      </section>`,
  );
  const table = $('[data-table]', content);
  const byId = (id) => state.cars.find((car) => car.id === id);

  function filtered() {
    const query = state.query.trim().toLowerCase();
    return state.cars.filter(
      (car) =>
        (state.category === 'all' || car.category === state.category) &&
        (!query || `${car.name} ${car.year ?? ''} ${car.color}`.toLowerCase().includes(query)),
    );
  }

  function row(car) {
    const thumb = car.images[0]?.thumb;
    return html`
      <tr data-id="${car.id}" class="${car.isActive ? '' : 'is-dim'}">
        <td>
          <div class="car-cell">
            ${thumb ? html`<img src="${thumb}" alt="" loading="lazy">` : html`<span class="car-cell__placeholder"></span>`}
            <div>
              <div class="cell-main">${car.name}</div>
              <div class="cell-sub">${[car.year, car.color].filter(Boolean).join(' · ')}${car.isActive ? '' : html` · ${t('fleet.hidden')}`}</div>
            </div>
          </div>
        </td>
        <td class="nowrap">${t(`cat.${car.category}`)}</td>
        <td>
          <label class="rate-input">
            <input class="control" type="number" min="1" step="1" inputmode="numeric" value="${car.dailyRate}" data-rate aria-label="${t('col.rate')} — ${car.name}">
            <span class="cell-sub">${ctx.settings.currency}</span>
          </label>
        </td>
        <td>
          <select class="control control--sm status-select" data-car-status data-status="${car.status}" aria-label="${t('col.status')}">
            ${['available', 'maintenance'].map((status) => html`<option value="${status}"${selected(status === car.status)}>${t(`carStatus.${status}`)}</option>`)}
          </select>
        </td>
        <td>${toggle('isActive', car.isActive, `${t('col.visible')} — ${car.name}`)}</td>
        <td>
          <button class="icon-btn icon-btn--sm${car.isFeatured ? ' is-on' : ''}" type="button" data-featured aria-pressed="${car.isFeatured}" aria-label="${t('col.featured')} — ${car.name}">
            <i class="${car.isFeatured ? 'ri-star-fill' : 'ri-star-line'}"></i>
          </button>
        </td>
        <td>
          <div class="row-actions">
            <button class="icon-btn icon-btn--sm" type="button" data-edit aria-label="${t('common.edit')}"><i class="ri-edit-line"></i></button>
            ${car.isActive ? html`<a class="icon-btn icon-btn--sm" href="/cars/${car.slug}" target="_blank" rel="noopener" aria-label="${t('fleet.viewOnSite')}"><i class="ri-external-link-line"></i></a>` : ''}
            <button class="icon-btn icon-btn--sm icon-btn--danger" type="button" data-delete aria-label="${t('common.delete')}"><i class="ri-delete-bin-line"></i></button>
          </div>
        </td>
      </tr>`;
  }

  function draw() {
    const rows = filtered();
    $('[data-count]', content).textContent = t('fleet.count', { shown: rows.length, total: state.cars.length });
    if (rows.length === 0) {
      render(table, html`<p class="empty">${t('fleet.empty')}</p>`);
      return;
    }
    render(
      table,
      html`
        <table class="table">
          <thead>
            <tr>
              <th>${t('col.car')}</th><th>${t('col.category')}</th><th>${t('col.rate')}</th><th>${t('col.status')}</th>
              <th>${t('col.visible')}</th><th>${t('col.featured')}</th><th><span class="sr-only">${t('common.actions')}</span></th>
            </tr>
          </thead>
          <tbody>${rows.map(row)}</tbody>
        </table>`,
    );
  }

  function replace(updated) {
    const index = state.cars.findIndex((car) => car.id === updated.id);
    if (index >= 0) state.cars[index] = updated;
    else state.cars.unshift(updated);
    draw();
  }

  async function update(car, patch) {
    try {
      const { car: updated } = await ctx.api(`/cars/${car.id}`, { method: 'PUT', body: patch });
      replace(updated);
      return updated;
    } catch (err) {
      toast(errorText(err), 'error');
      draw();
      return null;
    }
  }

  async function remove(car) {
    if (!(await confirmDialog(t('fleet.confirmDelete', { car: car.name })))) return;
    try {
      await ctx.api(`/cars/${car.id}`, { method: 'DELETE' });
      state.cars = state.cars.filter((item) => item.id !== car.id);
      draw();
      toast(t('common.deleted'));
    } catch (err) {
      toast(errorText(err), 'error');
    }
  }

  content.addEventListener('change', async (event) => {
    const rowEl = event.target.closest('tr[data-id]');
    if (!rowEl) return;
    const car = byId(Number(rowEl.dataset.id));

    if (event.target.matches('[data-rate]')) {
      const value = Number(event.target.value);
      if (!Number.isInteger(value) || value < 1) {
        event.target.value = car.dailyRate;
        return;
      }
      if (value === car.dailyRate) return;
      const updated = await update(car, { dailyRate: value });
      if (!updated) return;
      toast(t('fleet.rateSaved', { car: updated.name, price: money(updated.dailyRate) }));
      const label = content.querySelector(`tr[data-id="${updated.id}"] .rate-input`);
      label?.classList.add('is-saved');
      setTimeout(() => label?.classList.remove('is-saved'), SAVED_FLASH_MS);
    } else if (event.target.matches('[data-car-status]')) {
      if (await update(car, { status: event.target.value })) toast(t('common.saved'));
    } else if (event.target.name === 'isActive') {
      if (await update(car, { isActive: event.target.checked })) toast(t('common.saved'));
    }
  });

  // Enter commits an inline price the same way leaving the field does.
  content.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && event.target.matches('[data-rate]')) event.target.blur();
  });

  content.addEventListener('click', async (event) => {
    const rowEl = event.target.closest('tr[data-id]');
    if (!rowEl) return;
    const car = byId(Number(rowEl.dataset.id));
    if (event.target.closest('[data-featured]')) {
      if (await update(car, { isFeatured: !car.isFeatured })) toast(t('common.saved'));
    } else if (event.target.closest('[data-edit]')) {
      openCarEditor(ctx, car, { onSaved: replace });
    } else if (event.target.closest('[data-delete]')) {
      remove(car);
    }
  });

  $('[data-search]', content).addEventListener(
    'input',
    debounce((event) => {
      state.query = event.target.value;
      draw();
    }, 150),
  );
  $('[data-category]', content).addEventListener('change', (event) => {
    state.category = event.target.value;
    draw();
  });
  $('[data-add]', actions).addEventListener('click', () => openCarEditor(ctx, null, { onSaved: replace }));

  state.cars = (await ctx.api('/cars')).cars;
  draw();
}
