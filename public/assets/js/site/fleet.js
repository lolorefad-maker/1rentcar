import { api } from '../core/api.js';
import { $, debounce, html, render } from '../core/dom.js';
import { formatDateTime } from '../core/format.js';
import { t } from '../core/i18n.js';
import { carCard } from './car-card.js';

const PAGE_SIZE = 12;
const CATEGORY_ORDER = ['luxury', 'suv', 'sports', 'convertible', 'classic', 'electric'];

/** Extra words customers type, per category and brand (both languages). */
const CATEGORY_KEYWORDS = {
  luxury: 'luxury sedan executive vip limousine فخمه فاخره تنفيذيه صالون',
  suv: 'suv 4x4 jeep offroad desert family دفع رباعي صحراء عائليه جيب',
  sports: 'sport sports performance fast رياضيه رياضي سريعه',
  convertible: 'convertible cabriolet cabrio roadster open مكشوفه كشف كابريو',
  classic: 'classic vintage wedding weddings bride كلاسيك كلاسيكيه عرس زفاف اعراس عروس',
  electric: 'electric ev كهربائيه كهربائي',
};
const BRAND_KEYWORDS = {
  'Mercedes-Benz': 'مرسيدس بنز maybach مايباخ',
  'Rolls-Royce': 'رولز رويس',
  'Land Rover': 'لاند روفر رنج رينج range rover',
  Cadillac: 'كاديلاك',
  Chevrolet: 'شيفروليه شفروليه',
  Toyota: 'تويوتا',
  BMW: 'بي ام دبليو',
  Jeep: 'جيب',
  Brabus: 'برابوس',
  Hongqi: 'هونشي',
  Polestar: 'بولستار',
  Jetour: 'جيتور',
  MG: 'ام جي',
};

const fold = (text) =>
  String(text)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي');

const compact = (text) => fold(text).replace(/[\s-]+/g, '');

const priceOf = (car) => car.quote?.total ?? car.dailyRate;

const SORTS = {
  // Array#sort is stable, so ties keep the curated server order (featured first).
  recommended: (a, b) => (a.availability !== 'available') - (b.availability !== 'available'),
  priceAsc: (a, b) => priceOf(a) - priceOf(b),
  priceDesc: (a, b) => priceOf(b) - priceOf(a),
  newest: (a, b) => (b.year ?? 0) - (a.year ?? 0),
};

function searchText(car) {
  return compact(
    [car.name, car.year, car.color, CATEGORY_KEYWORDS[car.category], BRAND_KEYWORDS[car.brand], t(`cat.${car.category}`)].join(' '),
  );
}

/**
 * The fleet explorer: category chips, brand/sort/search controls, date-window
 * availability and paginated cards. All data comes from GET /api/cars.
 */
export function createFleet(root, { currency, onWindowCleared }) {
  const els = {
    categories: $('[data-fleet-categories]', root),
    brand: $('[data-fleet-brand]', root),
    sort: $('[data-fleet-sort]', root),
    search: $('[data-fleet-search]', root),
    status: $('[data-fleet-status]', root),
    grid: $('[data-fleet-grid]', root),
    more: $('[data-fleet-more]', root),
  };
  const state = { cars: [], window: null, category: 'all', brand: 'all', sort: 'recommended', query: '', visible: PAGE_SIZE, error: false };
  const loadListeners = new Set();
  let searchIndex = new Map();

  function filtered() {
    const tokens = fold(state.query).split(/\s+/).map(compact).filter(Boolean);
    return state.cars
      .filter((car) => state.category === 'all' || car.category === state.category)
      .filter((car) => state.brand === 'all' || car.brand === state.brand)
      .filter((car) => tokens.every((token) => searchIndex.get(car.id).includes(token)))
      .sort(SORTS[state.sort]);
  }

  function renderCategories() {
    const counts = {};
    for (const car of state.cars) counts[car.category] = (counts[car.category] ?? 0) + 1;
    const chip = (value, label, count) => html`
      <button type="button" class="chip${state.category === value ? ' is-active' : ''}" data-category="${value}" aria-pressed="${state.category === value}">
        ${label} <span class="chip__count">${count}</span>
      </button>`;
    render(
      els.categories,
      html`${chip('all', t('fleet.all'), state.cars.length)}${CATEGORY_ORDER.filter((c) => counts[c]).map((c) => chip(c, t(`cat.${c}`), counts[c]))}`,
    );
  }

  function renderBrands() {
    const counts = new Map();
    for (const car of state.cars) counts.set(car.brand, (counts.get(car.brand) ?? 0) + 1);
    const brands = [...counts.keys()].sort((a, b) => a.localeCompare(b));
    render(
      els.brand,
      html`<option value="all">${t('fleet.allBrands')}</option>${brands.map(
        (brand) => html`<option value="${brand}"${state.brand === brand ? ' selected' : ''}>${brand} (${counts.get(brand)})</option>`,
      )}`,
    );
  }

  function renderStatus(total, shown) {
    const window = state.window;
    render(
      els.status,
      html`${window
        ? html`<span class="window-chip">${t('fleet.window', { from: formatDateTime(window.pickupAt), to: formatDateTime(window.returnAt), days: window.days })}
            <button type="button" data-clear-window aria-label="${t('fleet.clearWindow')}"><i class="ri-close-line"></i></button></span>`
        : ''}
        ${total ? html`<span>${t('fleet.showing', { shown, total })}</span>` : ''}`,
    );
  }

  function renderGrid() {
    if (state.error) {
      render(els.grid, html`<div class="empty-state"><i class="ri-error-warning-line" aria-hidden="true"></i><p>${t('fleet.error')}</p></div>`);
      els.more.hidden = true;
      renderStatus(0, 0);
      return;
    }
    const list = filtered();
    const shown = list.slice(0, state.visible);
    if (list.length === 0) {
      render(
        els.grid,
        html`<div class="empty-state"><p>${t('fleet.empty')}</p><button class="btn btn--ghost btn--sm" type="button" data-reset-filters>${t('fleet.reset')}</button></div>`,
      );
    } else {
      render(els.grid, html`${shown.map((car, index) => carCard(car, { currency, window: state.window, index }))}`);
    }
    els.more.hidden = shown.length >= list.length;
    renderStatus(list.length, shown.length);
  }

  function renderAll() {
    renderCategories();
    renderBrands();
    renderGrid();
  }

  async function load(window = null) {
    els.grid.classList.add('is-loading');
    try {
      const query = window ? `?pickupAt=${encodeURIComponent(window.pickupAt)}&returnAt=${encodeURIComponent(window.returnAt)}` : '';
      const data = await api(`/cars${query}`);
      state.cars = data.cars;
      state.window = data.window;
      state.error = false;
    } catch {
      state.error = true;
    } finally {
      els.grid.classList.remove('is-loading');
    }
    searchIndex = new Map(state.cars.map((car) => [car.id, searchText(car)]));
    state.visible = PAGE_SIZE;
    renderAll();
    loadListeners.forEach((listener) => listener(state.cars));
  }

  function setCategory(category) {
    state.category = category;
    state.visible = PAGE_SIZE;
    renderAll();
  }

  function resetFilters() {
    Object.assign(state, { category: 'all', brand: 'all', query: '', visible: PAGE_SIZE });
    els.search.value = '';
    renderAll();
  }

  els.categories.addEventListener('click', (event) => {
    const chip = event.target.closest('[data-category]');
    if (chip) setCategory(chip.dataset.category);
  });
  els.brand.addEventListener('change', () => {
    state.brand = els.brand.value;
    state.visible = PAGE_SIZE;
    renderGrid();
  });
  els.sort.addEventListener('change', () => {
    state.sort = els.sort.value;
    renderGrid();
  });
  els.search.addEventListener(
    'input',
    debounce(() => {
      state.query = els.search.value;
      state.visible = PAGE_SIZE;
      renderGrid();
    }, 180),
  );
  els.more.addEventListener('click', () => {
    state.visible += PAGE_SIZE;
    renderGrid();
  });
  root.addEventListener('click', (event) => {
    if (event.target.closest('[data-reset-filters]')) resetFilters();
    if (event.target.closest('[data-clear-window]')) {
      onWindowCleared?.();
      load(null);
    }
  });

  return {
    load,
    setCategory,
    rerender() {
      searchIndex = new Map(state.cars.map((car) => [car.id, searchText(car)]));
      renderAll();
    },
    onLoad(listener) {
      loadListeners.add(listener);
    },
    get cars() {
      return state.cars;
    },
  };
}
