import { $, html, raw, render } from '../../core/dom.js';
import { formatDate, formatMoney, formatNumber, toLocalInput } from '../../core/format.js';
import { t } from '../../core/i18n.js';
import { confirmDialog, errorText, field, openModal, readForm, selected, showFieldErrors, toast, uniqueId, withBusy } from '../ui.js';

const CATEGORIES = ['service', 'insurance', 'fuel', 'cleaning', 'repair', 'licence', 'other'];
const RECORD_FIELDS = ['plateNumber', 'odometerKm', 'serviceDueKm', 'serviceDueAt', 'insuranceExpiry', 'licenceExpiry'];

const input = (name, value, attrs = '') => html`<input class="control" name="${name}" value="${value ?? ''}"${raw(attrs ? ` ${attrs}` : '')}>`;
const today = () => toLocalInput(new Date()).slice(0, 10);
const shift = (days) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return toLocalInput(date).slice(0, 10);
};

const alertText = (alert) =>
  alert.type === 'serviceKm'
    ? `${t('alert.serviceKm')} · ${t('alert.km', { n: formatNumber(alert.serviceDueKm) })}`
    : `${t(`alert.${alert.type}`)} · ${formatDate(`${alert.date}T00:00`)}`;

function openRecordEditor(ctx, car, onSaved) {
  const formId = uniqueId('record-form');
  const { dialog, close } = openModal({
    title: t('inventory.editRecord', { car: car.name }),
    size: 'md',
    content: html`
      <form class="form-grid" id="${formId}" novalidate>
        ${field(t('field.plateNumber'), input('plateNumber', car.plateNumber, 'maxlength="20"'))}
        ${field(t('field.odometerKm'), input('odometerKm', car.odometerKm, 'type="number" min="0" max="5000000"'))}
        ${field(t('field.serviceDueKm'), input('serviceDueKm', car.serviceDueKm, 'type="number" min="0" max="5000000"'))}
        ${field(t('field.serviceDueAt'), input('serviceDueAt', car.serviceDueAt, 'type="date"'))}
        ${field(t('field.insuranceExpiry'), input('insuranceExpiry', car.insuranceExpiry, 'type="date"'))}
        ${field(t('field.licenceExpiry'), input('licenceExpiry', car.licenceExpiry, 'type="date"'))}
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
        const { car: saved } = await ctx.api(`/cars/${car.id}`, { method: 'PUT', body: readForm(form) });
        toast(t('common.saved'));
        close();
        onSaved(saved);
      } catch (err) {
        $('[data-error]', form).textContent = errorText(err);
        showFieldErrors(form, err);
      }
    });
  });
}

function openExpenseEditor(ctx, cars, expense, onSaved) {
  const isNew = !expense;
  const values = expense ?? { carId: null, category: 'service', amount: null, spentOn: today(), note: '' };
  const formId = uniqueId('expense-form');
  const { dialog, close } = openModal({
    title: t(isNew ? 'inventory.addExpense' : 'inventory.editExpense'),
    size: 'md',
    content: html`
      <form class="form-grid" id="${formId}" novalidate>
        ${field(
          t('col.car'),
          html`<select class="control" name="carId">
            <option value="">${t('inventory.generalCost')}</option>
            ${cars.map((car) => html`<option value="${car.id}"${selected(car.id === values.carId)}>${car.name}</option>`)}
          </select>`,
          { span: true },
        )}
        ${field(
          t('field.expenseCategory'),
          html`<select class="control" name="category">${CATEGORIES.map((category) => html`<option value="${category}"${selected(category === values.category)}>${t(`expenseCat.${category}`)}</option>`)}</select>`,
        )}
        ${field(t('field.expenseAmount'), input('amount', values.amount, 'type="number" min="0" max="100000000" required'))}
        ${field(t('field.expenseDate'), input('spentOn', values.spentOn, 'type="date" required'))}
        ${field(t('field.expenseNote'), input('note', values.note, 'maxlength="300"'), { span: true })}
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
    const body = readForm(form);
    body.carId = body.carId ? Number(body.carId) : null;
    await withBusy(dialog.querySelector(`[form="${formId}"]`), async () => {
      try {
        const { expense: saved } = isNew
          ? await ctx.api('/expenses', { method: 'POST', body })
          : await ctx.api(`/expenses/${expense.id}`, { method: 'PATCH', body });
        toast(t('common.saved'));
        close();
        onSaved(saved);
      } catch (err) {
        $('[data-error]', form).textContent = errorText(err);
        showFieldErrors(form, err);
      }
    });
  });
}

export async function mount({ content, actions, ctx }) {
  const state = { from: shift(-365), to: today(), carId: '', cars: [], alerts: [], expenses: [], total: 0 };
  const currency = ctx.settings.currency;
  const editable = ctx.can('manager');

  if (editable) {
    render(actions, html`<button class="btn btn--primary btn--sm" type="button" data-add-expense><i class="ri-add-line" aria-hidden="true"></i>${t('inventory.addExpense')}</button>`);
    $('[data-add-expense]', actions).addEventListener('click', () => openExpenseEditor(ctx, state.cars, null, () => loadExpenses()));
  }

  async function loadExpenses() {
    const params = new URLSearchParams({ from: state.from, to: state.to });
    if (state.carId) params.set('carId', state.carId);
    const data = await ctx.api(`/expenses?${params}`);
    state.expenses = data.expenses;
    state.total = data.total;
    draw();
  }

  async function loadAll() {
    const [{ cars }, { alerts }] = await Promise.all([ctx.api('/cars'), ctx.api('/fleet-alerts')]);
    state.cars = cars;
    state.alerts = alerts;
    await loadExpenses();
  }

  function alertsCard() {
    return html`
      <section class="card">
        <div class="card__head"><div><h2 class="card__title">${t('inventory.alerts')}</h2><p class="card__sub">${t('inventory.hint')}</p></div></div>
        ${state.alerts.length === 0
          ? html`<p class="empty">${t('inventory.noAlerts')}</p>`
          : html`
            <ul class="alert-list">
              ${state.alerts.map(
                (alert) => html`
                  <li class="alert-list__item alert-list__item--${alert.severity}">
                    <span class="alert-list__badge">${t(`alert.${alert.severity}`)}</span>
                    <div>
                      <span class="cell-main">${alert.carName}</span>
                      <div class="cell-sub">${alertText(alert)}${alert.plateNumber ? ` · ${alert.plateNumber}` : ''}</div>
                    </div>
                  </li>`,
              )}
            </ul>`}
      </section>`;
  }

  function recordsCard() {
    return html`
      <section class="card">
        <div class="card__head"><h2 class="card__title">${t('inventory.details')}</h2></div>
        <div class="table-wrap table-wrap--scroll">
          <table class="table table--compact">
            <thead>
              <tr>
                <th>${t('col.car')}</th><th>${t('field.plateNumber')}</th><th class="num">${t('field.odometerKm')}</th>
                <th class="num">${t('field.serviceDueKm')}</th><th>${t('field.serviceDueAt')}</th>
                <th>${t('field.insuranceExpiry')}</th><th>${t('field.licenceExpiry')}</th><th></th>
              </tr>
            </thead>
            <tbody>
              ${state.cars.map(
                (car) => html`
                  <tr data-car="${car.id}">
                    <td><span class="cell-main">${car.name}</span></td>
                    <td class="mono">${car.plateNumber || html`<span class="cell-sub">${t('inventory.noPlate')}</span>`}</td>
                    <td class="num">${car.odometerKm ? formatNumber(car.odometerKm) : '—'}</td>
                    <td class="num">${car.serviceDueKm ? formatNumber(car.serviceDueKm) : '—'}</td>
                    <td class="nowrap">${car.serviceDueAt ? formatDate(`${car.serviceDueAt}T00:00`) : '—'}</td>
                    <td class="nowrap">${car.insuranceExpiry ? formatDate(`${car.insuranceExpiry}T00:00`) : '—'}</td>
                    <td class="nowrap">${car.licenceExpiry ? formatDate(`${car.licenceExpiry}T00:00`) : '—'}</td>
                    <td>${editable ? html`<button class="icon-btn icon-btn--sm" type="button" data-edit-record aria-label="${t('common.edit')}"><i class="ri-edit-line"></i></button>` : ''}</td>
                  </tr>`,
              )}
            </tbody>
          </table>
        </div>
      </section>`;
  }

  function expensesCard() {
    return html`
      <section class="card">
        <div class="card__head">
          <div><h2 class="card__title">${t('inventory.expenses')}</h2><p class="card__sub">${t('inventory.totalSpent')}: <strong>${formatMoney(state.total, currency)}</strong></p></div>
          <form class="toolbar" data-filters>
            <input class="control control--sm" type="date" name="from" value="${state.from}" aria-label="${t('common.from')}">
            <input class="control control--sm" type="date" name="to" value="${state.to}" aria-label="${t('common.to')}">
            <select class="control control--sm" name="carId" aria-label="${t('col.car')}">
              <option value="">${t('inventory.allCars')}</option>
              ${state.cars.map((car) => html`<option value="${car.id}"${selected(String(car.id) === String(state.carId))}>${car.name}</option>`)}
            </select>
            <button class="btn btn--ghost btn--sm" type="submit">${t('common.apply')}</button>
          </form>
        </div>
        ${state.expenses.length === 0
          ? html`<p class="empty">${t('inventory.emptyExpenses')}</p>`
          : html`
            <div class="table-wrap">
              <table class="table">
                <thead>
                  <tr><th>${t('field.expenseDate')}</th><th>${t('col.car')}</th><th>${t('field.expenseCategory')}</th><th>${t('field.expenseNote')}</th><th class="num">${t('field.expenseAmount')}</th><th></th></tr>
                </thead>
                <tbody>
                  ${state.expenses.map(
                    (expense) => html`
                      <tr data-expense="${expense.id}">
                        <td class="nowrap">${formatDate(`${expense.spentOn}T00:00`)}</td>
                        <td>${expense.carName || html`<span class="cell-sub">${t('inventory.generalCost')}</span>`}</td>
                        <td><span class="badge">${t(`expenseCat.${expense.category}`)}</span></td>
                        <td class="cell-clamp">${expense.note}</td>
                        <td class="num"><strong>${formatMoney(expense.amount, expense.currency || currency)}</strong></td>
                        <td>
                          <div class="row-actions">
                            ${editable
                              ? html`
                                <button class="icon-btn icon-btn--sm" type="button" data-edit-expense aria-label="${t('common.edit')}"><i class="ri-edit-line"></i></button>
                                <button class="icon-btn icon-btn--sm icon-btn--danger" type="button" data-delete-expense aria-label="${t('common.delete')}"><i class="ri-delete-bin-line"></i></button>`
                              : ''}
                          </div>
                        </td>
                      </tr>`,
                  )}
                </tbody>
              </table>
            </div>`}
      </section>`;
  }

  function draw() {
    render(content, html`${alertsCard()}${recordsCard()}${expensesCard()}`);
  }

  content.addEventListener('submit', async (event) => {
    if (!event.target.matches('[data-filters]')) return;
    event.preventDefault();
    const data = readForm(event.target);
    Object.assign(state, { from: data.from, to: data.to, carId: data.carId });
    try {
      await loadExpenses();
    } catch (err) {
      toast(errorText(err), 'error');
    }
  });

  content.addEventListener('click', async (event) => {
    const carRow = event.target.closest('tr[data-car]');
    if (carRow && event.target.closest('[data-edit-record]')) {
      const car = state.cars.find((item) => item.id === Number(carRow.dataset.car));
      openRecordEditor(ctx, car, async (saved) => {
        Object.assign(car, saved);
        state.alerts = (await ctx.api('/fleet-alerts')).alerts;
        draw();
      });
      return;
    }
    const expenseRow = event.target.closest('tr[data-expense]');
    if (!expenseRow) return;
    const expense = state.expenses.find((item) => item.id === Number(expenseRow.dataset.expense));
    if (event.target.closest('[data-edit-expense]')) {
      openExpenseEditor(ctx, state.cars, expense, () => loadExpenses());
    }
    if (event.target.closest('[data-delete-expense]')) {
      if (!(await confirmDialog(t('inventory.confirmDelete')))) return;
      try {
        await ctx.api(`/expenses/${expense.id}`, { method: 'DELETE' });
        toast(t('common.deleted'));
        await loadExpenses();
      } catch (err) {
        toast(errorText(err), 'error');
      }
    }
  });

  await loadAll();
}
