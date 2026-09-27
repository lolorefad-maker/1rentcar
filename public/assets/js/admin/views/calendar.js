import { $, debounce, html, render } from '../../core/dom.js';
import { formatDate, formatDateTime, toLocalInput } from '../../core/format.js';
import { t } from '../../core/i18n.js';
import { confirmDialog, errorText, field, openModal, readForm, selected, showFieldErrors, toast, uniqueId, withBusy } from '../ui.js';

const pad = (n) => String(n).padStart(2, '0');
const monthKey = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;

function daysOfMonth(month) {
  const [year, index] = month.split('-').map(Number);
  const count = new Date(Date.UTC(year, index, 0)).getUTCDate();
  return Array.from({ length: count }, (_, i) => `${month}-${pad(i + 1)}`);
}

const shiftMonth = (month, step) => {
  const [year, index] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year, index - 1 + step, 1));
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}`;
};

/** A booking or blocked period covers a day when it overlaps [day 00:00, next day 00:00). */
const covers = (entry, day) => entry.startAt < `${day}T23:59` && entry.endAt > `${day}T00:00`;

const entryTone = (entry) => (entry.kind === 'blackout' ? 'blocked' : entry.status);

function blockDialog(ctx, cars, { carId = '', day = '' } = {}, onSaved) {
  const start = day ? `${day}T00:00` : toLocalInput(new Date()).slice(0, 13) + ':00';
  const endDate = new Date(`${start}:00`);
  endDate.setDate(endDate.getDate() + 1);
  const formId = uniqueId('blackout-form');
  const { dialog, close } = openModal({
    title: t('calendar.blockTitle'),
    size: 'md',
    content: html`
      <form class="form-grid" id="${formId}" novalidate>
        ${field(
          t('col.car'),
          html`<select class="control" name="carId" required>
            <option value="">${t('form.chooseCar')}</option>
            ${cars.map((car) => html`<option value="${car.id}"${selected(String(car.id) === String(carId))}>${car.name}</option>`)}
          </select>`,
          { span: true },
        )}
        ${field(t('calendar.start'), html`<input class="control" type="datetime-local" name="startAt" value="${start}" required>`)}
        ${field(t('calendar.end'), html`<input class="control" type="datetime-local" name="endAt" value="${toLocalInput(endDate)}" required>`)}
        ${field(t('calendar.reason'), html`<input class="control" name="reason" maxlength="200">`, { span: true, hint: t('calendar.reasonHint') })}
        <p class="form-error span-all" data-error role="alert"></p>
      </form>`,
    footer: html`
      <button class="btn btn--ghost" type="button" data-modal-close>${t('common.cancel')}</button>
      <button class="btn btn--primary" type="submit" form="${formId}">${t('calendar.block')}</button>`,
  });

  const form = $(`#${formId}`, dialog);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const body = { ...readForm(form), carId: Number(form.elements.namedItem('carId').value) };
    await withBusy(dialog.querySelector(`[form="${formId}"]`), async () => {
      try {
        await ctx.api('/blackouts', { method: 'POST', body });
        toast(t('calendar.blockedToast'));
        close();
        onSaved();
      } catch (err) {
        $('[data-error]', form).textContent = errorText(err);
        showFieldErrors(form, err);
      }
    });
  });
}

export async function mount({ content, actions, ctx }) {
  const state = { month: monthKey(new Date()), entries: [], cars: [], query: '' };
  const editable = ctx.can('manager');

  if (editable) {
    render(actions, html`<button class="btn btn--primary btn--sm" type="button" data-block><i class="ri-calendar-close-line" aria-hidden="true"></i>${t('calendar.block')}</button>`);
    $('[data-block]', actions).addEventListener('click', () => blockDialog(ctx, state.cars, {}, load));
  }

  async function load() {
    const days = daysOfMonth(state.month);
    const data = await ctx.api(`/calendar?from=${days[0]}&to=${days[days.length - 1]}`);
    state.entries = data.entries;
    state.cars = data.cars.map((car) => ({ ...car, name: [car.brand, car.model, car.trim].filter(Boolean).join(' ') }));
    draw();
  }

  const visibleCars = () => {
    const query = state.query.trim().toLowerCase();
    return state.cars.filter((car) => !query || car.name.toLowerCase().includes(query));
  };

  function grid(days) {
    const cars = visibleCars();
    const byCar = new Map();
    for (const entry of state.entries) {
      if (!byCar.has(entry.carId)) byCar.set(entry.carId, []);
      byCar.get(entry.carId).push(entry);
    }

    return html`
      <div class="calendar" dir="ltr">
        <table class="calendar__table">
          <thead>
            <tr>
              <th class="calendar__corner">${t('calendar.cars', { n: cars.length })}</th>
              ${days.map((day) => {
                const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
                return html`<th class="calendar__day${weekday === 5 || weekday === 6 ? ' is-weekend' : ''}">${Number(day.slice(-2))}</th>`;
              })}
            </tr>
          </thead>
          <tbody>
            ${cars.map((car) => {
              const entries = byCar.get(car.id) ?? [];
              return html`
                <tr>
                  <th class="calendar__car" title="${car.name}">${car.name}</th>
                  ${days.map((day) => {
                    const entry = entries.find((item) => covers(item, day));
                    if (!entry) {
                      return html`<td class="calendar__cell"><button class="calendar__slot" type="button" data-free="${car.id}:${day}" aria-label="${car.name} ${day}"></button></td>`;
                    }
                    const label =
                      entry.kind === 'blackout'
                        ? `${t('calendar.blocked')}${entry.reason ? ` · ${entry.reason}` : ''}`
                        : `${entry.reference} · ${entry.customerName}`;
                    return html`<td class="calendar__cell"><span class="calendar__slot is-${entryTone(entry)}" title="${label}" data-entry="${entry.kind}:${entry.id}"></span></td>`;
                  })}
                </tr>`;
            })}
          </tbody>
        </table>
      </div>`;
  }

  function blockList() {
    const blocks = state.entries.filter((entry) => entry.kind === 'blackout');
    if (blocks.length === 0) return html`<p class="empty">${t('calendar.noBlocks')}</p>`;
    return html`
      <div class="table-wrap">
        <table class="table table--compact">
          <thead><tr><th>${t('col.car')}</th><th>${t('col.dates')}</th><th>${t('calendar.reason')}</th><th></th></tr></thead>
          <tbody>
            ${blocks.map(
              (block) => html`
                <tr>
                  <td>${block.carName}</td>
                  <td class="nowrap">${formatDateTime(block.startAt)} → ${formatDateTime(block.endAt)}</td>
                  <td>${block.reason}</td>
                  <td>${editable ? html`<button class="icon-btn icon-btn--sm icon-btn--danger" type="button" data-unblock="${block.id}" aria-label="${t('calendar.unblock')}"><i class="ri-delete-bin-line"></i></button>` : ''}</td>
                </tr>`,
            )}
          </tbody>
        </table>
      </div>`;
  }

  function draw() {
    const days = daysOfMonth(state.month);
    render(
      content,
      html`
        <section class="card">
          <div class="card__head">
            <div>
              <h2 class="card__title">${formatDate(`${state.month}-01T00:00`).replace(/\d+\s/, '')}</h2>
              <p class="card__sub">${t('calendar.hint')}</p>
            </div>
            <div class="toolbar">
              <div class="input-icon">
                <i class="ri-search-line" aria-hidden="true"></i>
                <input class="control control--sm" type="search" data-search value="${state.query}" placeholder="${t('bookings.search')}" aria-label="${t('common.search')}">
              </div>
              <button class="icon-btn icon-btn--sm" type="button" data-month="prev" aria-label="${t('calendar.prev')}"><i class="ri-arrow-left-s-line flip-rtl"></i></button>
              <button class="btn btn--ghost btn--sm" type="button" data-month="today">${t('calendar.today')}</button>
              <button class="icon-btn icon-btn--sm" type="button" data-month="next" aria-label="${t('calendar.next')}"><i class="ri-arrow-right-s-line flip-rtl"></i></button>
            </div>
          </div>
          <div class="calendar-legend">
            <span><i class="dot dot--confirmed"></i>${t('status.confirmed')}</span>
            <span><i class="dot dot--pending"></i>${t('status.pending')}</span>
            <span><i class="dot dot--blocked"></i>${t('calendar.blocked')}</span>
          </div>
          ${state.cars.length === 0 ? html`<p class="empty">${t('calendar.empty')}</p>` : grid(days)}
        </section>

        <section class="card">
          <div class="card__head"><h2 class="card__title">${t('calendar.upcoming')}</h2></div>
          ${blockList()}
        </section>`,
    );

    $('[data-search]', content).addEventListener(
      'input',
      debounce((event) => {
        state.query = event.target.value;
        draw();
      }, 200),
    );
  }

  content.addEventListener('click', async (event) => {
    const nav = event.target.closest('[data-month]');
    if (nav) {
      const mode = nav.dataset.month;
      state.month = mode === 'today' ? monthKey(new Date()) : shiftMonth(state.month, mode === 'next' ? 1 : -1);
      await load();
      return;
    }
    const free = event.target.closest('[data-free]');
    if (free && editable) {
      const [carId, day] = free.dataset.free.split(':');
      blockDialog(ctx, state.cars, { carId, day }, load);
      return;
    }
    const unblock = event.target.closest('[data-unblock]');
    if (unblock) {
      if (!(await confirmDialog(t('calendar.confirmUnblock')))) return;
      try {
        await ctx.api(`/blackouts/${unblock.dataset.unblock}`, { method: 'DELETE' });
        toast(t('common.deleted'));
        await load();
      } catch (err) {
        toast(errorText(err), 'error');
      }
      return;
    }
    const entry = event.target.closest('[data-entry]');
    if (entry) {
      const [kind, id] = entry.dataset.entry.split(':');
      if (kind === 'booking') window.location.hash = `#/bookings?open=${id}`;
    }
  });

  await load();
}
