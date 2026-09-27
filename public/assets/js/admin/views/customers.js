import { $, debounce, html, render } from '../../core/dom.js';
import { formatDateTime, formatMoney, formatTimestamp } from '../../core/format.js';
import { t } from '../../core/i18n.js';
import { confirmDialog, errorText, field, openModal, toast, whatsappLink, withBusy } from '../ui.js';

export async function mount({ content, actions, ctx }) {
  const state = { customers: [], query: '' };
  const currency = ctx.settings.currency;

  render(actions, html`<button class="btn btn--ghost btn--sm" type="button" data-refresh><i class="ri-refresh-line" aria-hidden="true"></i>${t('common.refresh')}</button>`);
  render(
    content,
    html`
      <section class="card">
        <div class="card__head">
          <p class="card__sub">${t('customers.hint')}</p>
          <div class="input-icon">
            <i class="ri-search-line" aria-hidden="true"></i>
            <input class="control control--sm" type="search" data-search placeholder="${t('customers.search')}" aria-label="${t('common.search')}">
          </div>
        </div>
        <div class="table-wrap" data-table></div>
      </section>`,
  );
  const table = $('[data-table]', content);

  const filtered = () => {
    const query = state.query.trim().toLowerCase();
    return state.customers.filter((customer) => !query || `${customer.name} ${customer.phone} ${customer.email}`.toLowerCase().includes(query));
  };

  function drawTable() {
    const rows = filtered();
    if (rows.length === 0) {
      render(table, html`<p class="empty">${t('customers.empty')}</p>`);
      return;
    }
    render(
      table,
      html`
        <table class="table">
          <thead>
            <tr>
              <th>${t('col.customer')}</th><th class="num">${t('nav.bookings')}</th><th class="num">${t('col.spent')}</th>
              <th>${t('col.lastBooking')}</th><th>${t('col.status')}</th><th><span class="sr-only">${t('common.actions')}</span></th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((customer) => {
              const wa = whatsappLink(customer.phone);
              return html`
                <tr class="is-clickable" data-id="${customer.id}">
                  <td>
                    <span class="cell-main">${customer.name || '—'}</span>
                    <div class="cell-sub" dir="ltr">${customer.phone}</div>
                  </td>
                  <td class="num">${customer.bookings}</td>
                  <td class="num"><strong>${formatMoney(customer.spent, currency)}</strong></td>
                  <td class="nowrap">${customer.lastBookingAt ? formatTimestamp(customer.lastBookingAt) : '—'}</td>
                  <td>
                    ${customer.isBlocked ? html`<span class="badge badge--danger">${t('customers.blocked')}</span>` : ''}
                    ${!customer.isBlocked && customer.bookings > 1 ? html`<span class="badge badge--accent">${t('customers.repeat')}</span>` : ''}
                  </td>
                  <td>
                    <div class="row-actions">
                      ${wa ? html`<a class="icon-btn icon-btn--sm" href="${wa}" target="_blank" rel="noopener" aria-label="${t('bookings.whatsapp')}"><i class="ri-whatsapp-line"></i></a>` : ''}
                      ${ctx.can('manager') ? html`<button class="icon-btn icon-btn--sm icon-btn--danger" type="button" data-delete aria-label="${t('common.delete')}"><i class="ri-delete-bin-line"></i></button>` : ''}
                    </div>
                  </td>
                </tr>`;
            })}
          </tbody>
        </table>`,
    );
  }

  async function load() {
    state.customers = (await ctx.api('/customers')).customers;
    drawTable();
  }

  async function openDetails(row) {
    const { customer, bookings } = await ctx.api(`/customers/${row.id}`);
    const wa = whatsappLink(customer.phone);
    const { dialog } = openModal({
      title: t('customers.details', { name: customer.name || customer.phone }),
      size: 'lg',
      content: html`
        <div class="grid-2">
          <section class="fieldset">
            <h3 class="fieldset__title">${t('bookings.customer')}</h3>
            <dl class="dl">
              <dt>${t('form.customerName')}</dt><dd>${customer.name || '—'}</dd>
              <dt>${t('form.phone')}</dt><dd dir="ltr">${customer.phone}</dd>
              ${customer.email ? html`<dt>${t('form.email')}</dt><dd><a href="mailto:${customer.email}">${customer.email}</a></dd>` : ''}
              <dt>${t('bookings.created')}</dt><dd>${formatTimestamp(customer.createdAt)}</dd>
            </dl>
            <div class="photo-tools">
              <a class="btn btn--ghost btn--sm" href="tel:${customer.phone.replace(/[^\d+]/g, '')}"><i class="ri-phone-line" aria-hidden="true"></i>${t('bookings.call')}</a>
              ${wa ? html`<a class="btn btn--whatsapp btn--sm" href="${wa}" target="_blank" rel="noopener"><i class="ri-whatsapp-line" aria-hidden="true"></i>${t('bookings.whatsapp')}</a>` : ''}
            </div>
          </section>
          <section class="fieldset">
            <h3 class="fieldset__title">${t('customers.history')}</h3>
            <dl class="dl">
              <dt>${t('nav.bookings')}</dt><dd>${row.bookings}</dd>
              <dt>${t('col.spent')}</dt><dd><strong>${formatMoney(row.spent, currency)}</strong></dd>
            </dl>
            <label class="check-row">
              <span>${customer.isBlocked ? t('customers.unblock') : t('customers.block')}</span>
              <span class="switch"><input type="checkbox" data-block ${customer.isBlocked ? 'checked' : ''} aria-label="${t('customers.block')}"><span></span></span>
            </label>
          </section>
        </div>
        <section class="fieldset">
          <h3 class="fieldset__title">${t('customers.history')}</h3>
          ${bookings.length === 0
            ? html`<p class="empty">${t('customers.noBookings')}</p>`
            : html`
              <div class="table-wrap">
                <table class="table table--compact">
                  <thead><tr><th>${t('col.reference')}</th><th>${t('col.car')}</th><th>${t('col.dates')}</th><th class="num">${t('col.total')}</th><th>${t('col.status')}</th></tr></thead>
                  <tbody>
                    ${bookings.map(
                      (booking) => html`
                        <tr>
                          <td><a class="mono" href="#/bookings?open=${booking.id}" data-modal-close>${booking.reference}</a></td>
                          <td>${booking.carName}</td>
                          <td class="nowrap">${formatDateTime(booking.pickupAt)} → ${formatDateTime(booking.returnAt)}</td>
                          <td class="num">${formatMoney(booking.totalPrice, booking.currency)}</td>
                          <td><span class="badge badge--${booking.status}">${t(`status.${booking.status}`)}</span></td>
                        </tr>`,
                    )}
                  </tbody>
                </table>
              </div>`}
        </section>
        <form class="fieldset" data-notes-form>
          ${field(t('customers.notes'), html`<textarea class="control" name="notes" rows="3" maxlength="2000">${customer.notes ?? ''}</textarea>`)}
          <div><button class="btn btn--ghost btn--sm" type="submit">${t('common.save')}</button></div>
        </form>`,
      footer: html`<button class="btn btn--ghost" type="button" data-modal-close>${t('common.close')}</button>`,
    });

    const blockToggle = $('[data-block]', dialog);
    blockToggle.addEventListener('change', async () => {
      try {
        const { customer: updated } = await ctx.api(`/customers/${customer.id}`, { method: 'PATCH', body: { isBlocked: blockToggle.checked } });
        toast(updated.isBlocked ? t('customers.blockedToast') : t('customers.unblockedToast'));
        Object.assign(row, { isBlocked: updated.isBlocked });
        drawTable();
      } catch (err) {
        blockToggle.checked = !blockToggle.checked;
        toast(errorText(err), 'error');
      }
    });

    const notesForm = $('[data-notes-form]', dialog);
    notesForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      await withBusy($('button[type="submit"]', notesForm), async () => {
        try {
          await ctx.api(`/customers/${customer.id}`, { method: 'PATCH', body: { notes: notesForm.elements.namedItem('notes').value } });
          toast(t('common.saved'));
        } catch (err) {
          toast(errorText(err), 'error');
        }
      });
    });
  }

  content.addEventListener('click', async (event) => {
    const row = event.target.closest('tr[data-id]');
    if (!row) return;
    const customer = state.customers.find((item) => item.id === Number(row.dataset.id));
    if (event.target.closest('[data-delete]')) {
      if (!(await confirmDialog(t('customers.confirmDelete')))) return;
      try {
        await ctx.api(`/customers/${customer.id}`, { method: 'DELETE' });
        state.customers = state.customers.filter((item) => item.id !== customer.id);
        drawTable();
        toast(t('common.deleted'));
      } catch (err) {
        toast(errorText(err), 'error');
      }
      return;
    }
    if (event.target.closest('a, button, input')) return;
    openDetails(customer).catch((err) => toast(errorText(err), 'error'));
  });

  $('[data-search]', content).addEventListener(
    'input',
    debounce((event) => {
      state.query = event.target.value;
      drawTable();
    }, 150),
  );
  $('[data-refresh]', actions).addEventListener('click', load);

  await load();
}
