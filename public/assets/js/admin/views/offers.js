import { $, html, raw, render } from '../../core/dom.js';
import { formatDate, toLocalInput } from '../../core/format.js';
import { pick, t } from '../../core/i18n.js';
import { checkRow, confirmDialog, errorText, field, openModal, readForm, showFieldErrors, toast, toggle, uniqueId, withBusy } from '../ui.js';

const input = (name, value, attrs = '') => html`<input class="control" name="${name}" value="${value ?? ''}"${raw(attrs ? ` ${attrs}` : '')}>`;

function openOfferEditor(ctx, offer, onSaved) {
  const isNew = !offer;
  const values = offer ?? { code: '', discountPercent: 10, descriptionEn: '', descriptionAr: '', minDays: 1, validUntil: '', isActive: true, isPublic: true };
  const formId = uniqueId('offer-form');
  const { dialog, close } = openModal({
    title: isNew ? t('offers.newTitle') : t('offers.editTitle', { code: offer.code }),
    size: 'md',
    content: html`
      <form class="form-grid" id="${formId}" novalidate>
        ${field(t('field.code'), input('code', values.code, 'required maxlength="30" autocomplete="off" style="text-transform: uppercase"'))}
        ${field(t('field.discountPercent'), input('discountPercent', values.discountPercent, 'type="number" min="1" max="90" required'))}
        ${field(t('field.minDays'), input('minDays', values.minDays, 'type="number" min="1" max="365" required'))}
        ${field(t('field.validUntil'), input('validUntil', values.validUntil ?? '', 'type="date"'))}
        ${field(t('field.offerDescriptionEn'), input('descriptionEn', values.descriptionEn, 'maxlength="300"'), { span: true })}
        ${field(t('field.offerDescriptionAr'), input('descriptionAr', values.descriptionAr, 'maxlength="300" dir="rtl"'), { span: true })}
        ${checkRow('isPublic', values.isPublic, t('field.isPublic'))}
        ${checkRow('isActive', values.isActive, t('field.offerActive'))}
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
    const data = readForm(form);
    data.code = data.code.trim().toUpperCase();
    await withBusy(dialog.querySelector(`[form="${formId}"]`), async () => {
      try {
        const { offer: saved } = isNew
          ? await ctx.api('/offers', { method: 'POST', body: data })
          : await ctx.api(`/offers/${offer.id}`, { method: 'PUT', body: data });
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
  let offers = (await ctx.api('/offers')).offers;
  const today = toLocalInput(new Date()).slice(0, 10);

  render(actions, html`<button class="btn btn--primary btn--sm" type="button" data-add><i class="ri-add-line" aria-hidden="true"></i>${t('offers.add')}</button>`);

  function conditions(offer) {
    const length = offer.minDays > 1 ? t('offers.minDays', { n: offer.minDays }) : t('offers.anyLength');
    if (!offer.validUntil) return length;
    const expired = offer.validUntil < today;
    return html`${length} · ${expired ? html`<span class="badge badge--danger">${t('offers.expired')}</span>` : t('offers.until', { date: formatDate(`${offer.validUntil}T00:00`) })}`;
  }

  function draw() {
    render(
      content,
      html`
        <section class="card">
          <div class="card__head"><p class="card__sub">${t('offers.hint')}</p></div>
          ${offers.length === 0
            ? html`<p class="empty">${t('offers.empty')}</p>`
            : html`
              <div class="table-wrap">
                <table class="table">
                  <thead>
                    <tr>
                      <th>${t('col.code')}</th><th class="num">${t('col.discount')}</th><th>${t('col.conditions')}</th>
                      <th class="num">${t('col.usage')}</th><th>${t('col.public')}</th><th>${t('col.active')}</th><th><span class="sr-only">${t('common.actions')}</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    ${offers.map(
                      (offer) => html`
                        <tr data-id="${offer.id}" class="${offer.isActive ? '' : 'is-dim'}">
                          <td><span class="mono cell-main">${offer.code}</span><div class="cell-sub">${pick(offer, 'description')}</div></td>
                          <td class="num"><strong>${offer.discountPercent}%</strong></td>
                          <td>${conditions(offer)}</td>
                          <td class="num">${offer.usageCount}</td>
                          <td>${toggle('isPublic', offer.isPublic, `${t('col.public')} — ${offer.code}`)}</td>
                          <td>${toggle('isActive', offer.isActive, `${t('col.active')} — ${offer.code}`)}</td>
                          <td>
                            <div class="row-actions">
                              <button class="icon-btn icon-btn--sm" type="button" data-edit aria-label="${t('common.edit')}"><i class="ri-edit-line"></i></button>
                              <button class="icon-btn icon-btn--sm icon-btn--danger" type="button" data-delete aria-label="${t('common.delete')}"><i class="ri-delete-bin-line"></i></button>
                            </div>
                          </td>
                        </tr>`,
                    )}
                  </tbody>
                </table>
              </div>`}
        </section>`,
    );
  }

  function replace(saved) {
    const index = offers.findIndex((offer) => offer.id === saved.id);
    if (index >= 0) offers[index] = saved;
    else offers = [saved, ...offers];
    draw();
  }

  content.addEventListener('change', async (event) => {
    const row = event.target.closest('tr[data-id]');
    if (!row || !['isPublic', 'isActive'].includes(event.target.name)) return;
    try {
      const { offer } = await ctx.api(`/offers/${row.dataset.id}`, { method: 'PUT', body: { [event.target.name]: event.target.checked } });
      replace(offer);
      toast(t('common.saved'));
    } catch (err) {
      toast(errorText(err), 'error');
      draw();
    }
  });

  content.addEventListener('click', async (event) => {
    const row = event.target.closest('tr[data-id]');
    if (!row) return;
    const offer = offers.find((item) => item.id === Number(row.dataset.id));
    if (event.target.closest('[data-edit]')) openOfferEditor(ctx, offer, replace);
    if (event.target.closest('[data-delete]')) {
      if (!(await confirmDialog(t('offers.confirmDelete', { code: offer.code })))) return;
      try {
        await ctx.api(`/offers/${offer.id}`, { method: 'DELETE' });
        offers = offers.filter((item) => item.id !== offer.id);
        draw();
        toast(t('common.deleted'));
      } catch (err) {
        toast(errorText(err), 'error');
      }
    }
  });

  $('[data-add]', actions).addEventListener('click', () => openOfferEditor(ctx, null, replace));
  draw();
}
