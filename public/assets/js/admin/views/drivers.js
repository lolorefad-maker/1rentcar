import { $, html, raw, render } from '../../core/dom.js';
import { formatMoney } from '../../core/format.js';
import { t } from '../../core/i18n.js';
import { checkRow, confirmDialog, errorText, field, openModal, readForm, showFieldErrors, toast, uniqueId, whatsappLink, withBusy } from '../ui.js';

const input = (name, value, attrs = '') => html`<input class="control" name="${name}" value="${value ?? ''}"${raw(attrs ? ` ${attrs}` : '')}>`;

function openDriverEditor(ctx, driver, onSaved) {
  const isNew = !driver;
  const values = driver ?? { name: '', phone: '', licenceNumber: '', dailyRate: ctx.settings?.chauffeurDailyRate ?? 0, notes: '', isActive: true };
  const formId = uniqueId('driver-form');
  const { dialog, close } = openModal({
    title: isNew ? t('drivers.newTitle') : t('drivers.editTitle', { name: driver.name }),
    size: 'md',
    content: html`
      <form class="form-grid" id="${formId}" novalidate>
        ${field(t('field.driverName'), input('name', values.name, 'required maxlength="100"'))}
        ${field(t('field.driverPhone'), input('phone', values.phone, 'type="tel" maxlength="30" dir="ltr"'))}
        ${field(t('field.licenceNumber'), input('licenceNumber', values.licenceNumber, 'maxlength="60"'))}
        ${field(t('field.driverDailyRate'), input('dailyRate', values.dailyRate, 'type="number" min="0" max="1000000"'))}
        ${field(t('field.driverNotes'), html`<textarea class="control" name="notes" rows="2" maxlength="500">${values.notes ?? ''}</textarea>`, { span: true })}
        ${checkRow('isActive', values.isActive, t('field.driverActive'))}
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
        const { driver: saved } = isNew
          ? await ctx.api('/drivers', { method: 'POST', body: readForm(form) })
          : await ctx.api(`/drivers/${driver.id}`, { method: 'PUT', body: readForm(form) });
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
  let drivers = (await ctx.api('/drivers')).drivers;
  const currency = ctx.settings.currency;

  if (ctx.can('manager')) {
    render(actions, html`<button class="btn btn--primary btn--sm" type="button" data-add><i class="ri-add-line" aria-hidden="true"></i>${t('drivers.add')}</button>`);
    $('[data-add]', actions).addEventListener('click', () => openDriverEditor(ctx, null, replace));
  }

  function draw() {
    render(
      content,
      html`
        <section class="card">
          <div class="card__head"><p class="card__sub">${t('drivers.hint')}</p></div>
          ${drivers.length === 0
            ? html`<p class="empty">${t('drivers.empty')}</p>`
            : html`
              <div class="table-wrap">
                <table class="table">
                  <thead>
                    <tr>
                      <th>${t('field.driverName')}</th><th>${t('field.driverPhone')}</th><th>${t('field.licenceNumber')}</th>
                      <th class="num">${t('field.driverDailyRate')}</th><th>${t('col.status')}</th>
                      <th><span class="sr-only">${t('common.actions')}</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    ${drivers.map((driver) => {
                      const wa = whatsappLink(driver.phone);
                      return html`
                        <tr data-id="${driver.id}" class="${driver.isActive ? '' : 'is-dim'}">
                          <td>
                            <span class="cell-main">${driver.name}</span>
                            ${driver.notes ? html`<div class="cell-sub">${driver.notes}</div>` : ''}
                          </td>
                          <td dir="ltr">${driver.phone || '—'}</td>
                          <td>${driver.licenceNumber || '—'}</td>
                          <td class="num">${driver.dailyRate ? formatMoney(driver.dailyRate, currency) : '—'}</td>
                          <td>
                            ${driver.isActive ? html`<span class="badge badge--ok">${t('field.driverActive')}</span>` : html`<span class="badge">${t('status.cancelled')}</span>`}
                            ${driver.activeBookings ? html`<div class="cell-sub">${t('drivers.activeBookings', { n: driver.activeBookings })}</div>` : ''}
                          </td>
                          <td>
                            <div class="row-actions">
                              ${wa ? html`<a class="icon-btn icon-btn--sm" href="${wa}" target="_blank" rel="noopener" aria-label="WhatsApp"><i class="ri-whatsapp-line"></i></a>` : ''}
                              ${ctx.can('manager')
                                ? html`
                                  <button class="icon-btn icon-btn--sm" type="button" data-edit aria-label="${t('common.edit')}"><i class="ri-edit-line"></i></button>
                                  <button class="icon-btn icon-btn--sm icon-btn--danger" type="button" data-delete aria-label="${t('common.delete')}"><i class="ri-delete-bin-line"></i></button>`
                                : ''}
                            </div>
                          </td>
                        </tr>`;
                    })}
                  </tbody>
                </table>
              </div>`}
        </section>`,
    );
  }

  function replace(saved) {
    const index = drivers.findIndex((driver) => driver.id === saved.id);
    if (index >= 0) drivers[index] = saved;
    else drivers = [...drivers, saved];
    draw();
  }

  content.addEventListener('click', async (event) => {
    const row = event.target.closest('tr[data-id]');
    if (!row) return;
    const driver = drivers.find((item) => item.id === Number(row.dataset.id));
    if (event.target.closest('[data-edit]')) openDriverEditor(ctx, driver, replace);
    if (event.target.closest('[data-delete]')) {
      if (!(await confirmDialog(t('drivers.confirmDelete', { name: driver.name })))) return;
      try {
        await ctx.api(`/drivers/${driver.id}`, { method: 'DELETE' });
        drivers = drivers.filter((item) => item.id !== driver.id);
        draw();
        toast(t('common.deleted'));
      } catch (err) {
        toast(errorText(err), 'error');
      }
    }
  });

  draw();
}
