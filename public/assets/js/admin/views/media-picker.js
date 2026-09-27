import { $, html, render } from '../../core/dom.js';
import { t } from '../../core/i18n.js';
import { openModal } from '../ui.js';

const GROUPS = ['fleet', 'interiors', 'main', 'rear', 'details', 'uploads', 'posters'];
const PAGE_SIZE = 48;

/** Lets staff pick existing images. Resolves with [{ src, thumb }] (empty when cancelled). */
export async function pickMedia(ctx, { exclude = [] } = {}) {
  const { images } = await ctx.api('/media');
  const excluded = new Set(exclude);
  const available = images.filter((image) => !excluded.has(image.src));

  return new Promise((resolve) => {
    const chosen = new Map();
    let group = 'fleet';
    let query = '';
    let added = false;
    let page = 1;
    let filteredItems = [];

    const { dialog, close, onClose } = openModal({
      title: t('media.title'),
      size: 'lg',
      content: html`
        <div class="toolbar" style="flex-wrap: wrap; gap: 0.75rem;">
          <div class="segmented" role="group" data-groups style="flex-wrap: wrap;">
            ${GROUPS.map((name) => html`<button type="button" data-group="${name}" aria-pressed="${name === group}">${t(`media.${name}`)}</button>`)}
          </div>
          <div class="input-icon" style="flex: 1; min-width: 180px;">
            <i class="ri-search-line" aria-hidden="true"></i>
            <input class="control control--sm" type="search" data-filter placeholder="${t('media.filter')}" aria-label="${t('media.filter')}">
          </div>
        </div>
        <div class="media-subbar" style="display: flex; justify-content: space-between; align-items: center; padding: 0.25rem 0.5rem; font-size: 0.85rem; color: var(--text-2);">
          <span data-count-status></span>
          <div style="display: flex; gap: 0.5rem;">
            <button class="btn btn--ghost btn--sm" type="button" data-select-all style="padding: 2px 8px; font-size: 0.78rem;">${t('media.selectAll')}</button>
            <button class="btn btn--ghost btn--sm" type="button" data-clear-all style="padding: 2px 8px; font-size: 0.78rem;">${t('media.clearSelection')}</button>
          </div>
        </div>
        <div class="media-grid" data-grid></div>
        <div style="display: flex; justify-content: center; padding: 0.5rem 0;" data-more-wrap>
          <button class="btn btn--ghost btn--sm" type="button" data-load-more hidden>${t('media.loadMore')}</button>
        </div>`,
      footer: html`
        <button class="btn btn--ghost" type="button" data-modal-close>${t('common.cancel')}</button>
        <button class="btn btn--primary" type="button" data-add disabled>${t('media.addSelected', { n: 0 })}</button>`,
    });

    const grid = $('[data-grid]', dialog);
    const addButton = $('[data-add]', dialog);
    const countStatus = $('[data-count-status]', dialog);
    const loadMoreBtn = $('[data-load-more]', dialog);

    function getFiltered() {
      const needle = query.trim().toLowerCase();
      return available.filter(
        (image) => image.group === group && (!needle || decodeURIComponent(image.src).toLowerCase().includes(needle)),
      );
    }

    function draw(reset = true) {
      if (reset) {
        page = 1;
        filteredItems = getFiltered();
      }
      const total = filteredItems.length;
      const shownCount = Math.min(page * PAGE_SIZE, total);
      const items = filteredItems.slice(0, shownCount);

      countStatus.textContent = t('media.showing', { shown: shownCount, total });
      loadMoreBtn.hidden = shownCount >= total;

      render(
        grid,
        items.length
          ? html`${items.map(
              (image) => html`
                <button class="media-item" type="button" data-src="${image.src}" aria-pressed="${chosen.has(image.src)}" title="${decodeURIComponent(image.src)}">
                  <img src="${image.thumb}" alt="" loading="lazy">
                </button>`,
            )}`
          : html`<p class="empty">${t('media.empty')}</p>`,
      );
    }

    function updateButton() {
      addButton.disabled = chosen.size === 0;
      addButton.textContent = t('media.addSelected', { n: chosen.size });
    }

    $('[data-groups]', dialog).addEventListener('click', (event) => {
      const button = event.target.closest('[data-group]');
      if (!button) return;
      group = button.dataset.group;
      dialog.querySelectorAll('[data-group]').forEach((b) => b.setAttribute('aria-pressed', String(b === button)));
      draw(true);
    });

    let debounceTimer;
    $('[data-filter]', dialog).addEventListener('input', (event) => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        query = event.target.value;
        draw(true);
      }, 150);
    });

    grid.addEventListener('click', (event) => {
      const item = event.target.closest('[data-src]');
      if (!item) return;
      const image = available.find((candidate) => candidate.src === item.dataset.src);
      if (!image) return;
      if (chosen.has(image.src)) chosen.delete(image.src);
      else chosen.set(image.src, { src: image.src, thumb: image.thumb });
      item.setAttribute('aria-pressed', String(chosen.has(image.src)));
      updateButton();
    });

    // Infinite scroll trigger when reaching bottom of grid
    grid.addEventListener('scroll', () => {
      if (grid.scrollTop + grid.clientHeight >= grid.scrollHeight - 60) {
        if (page * PAGE_SIZE < filteredItems.length) {
          page += 1;
          draw(false);
        }
      }
    });

    loadMoreBtn.addEventListener('click', () => {
      if (page * PAGE_SIZE < filteredItems.length) {
        page += 1;
        draw(false);
      }
    });

    $('[data-select-all]', dialog).addEventListener('click', () => {
      const shownCount = Math.min(page * PAGE_SIZE, filteredItems.length);
      const items = filteredItems.slice(0, shownCount);
      for (const item of items) {
        chosen.set(item.src, { src: item.src, thumb: item.thumb });
      }
      grid.querySelectorAll('[data-src]').forEach((el) => el.setAttribute('aria-pressed', 'true'));
      updateButton();
    });

    $('[data-clear-all]', dialog).addEventListener('click', () => {
      chosen.clear();
      grid.querySelectorAll('[data-src]').forEach((el) => el.setAttribute('aria-pressed', 'false'));
      updateButton();
    });

    addButton.addEventListener('click', () => {
      added = true;
      close();
    });
    onClose(() => resolve(added ? [...chosen.values()] : []));

    draw(true);
  });
}
