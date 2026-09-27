import { $, html, raw, render } from '../../core/dom.js';
import { t } from '../../core/i18n.js';
import { checkRow, confirmDialog, errorText, field, openModal, readForm, showFieldErrors, toast, uniqueId, withBusy } from '../ui.js';

const input = (name, value, attrs = '') => html`<input class="control" name="${name}" value="${value ?? ''}"${raw(attrs ? ` ${attrs}` : '')}>`;
const area = (name, value, attrs = '') => html`<textarea class="control" name="${name}" rows="3"${raw(attrs ? ` ${attrs}` : '')}>${value ?? ''}</textarea>`;
const stars = (rating) => '★'.repeat(rating) + '☆'.repeat(5 - rating);

const BLANK = {
  testimonials: { nameEn: '', nameAr: '', roleEn: '', roleAr: '', textEn: '', textAr: '', rating: 5, isActive: true, sortOrder: 0 },
  faqs: { questionEn: '', questionAr: '', answerEn: '', answerAr: '', isActive: true, sortOrder: 0 },
};

const formFields = {
  testimonials: (values) => html`
    ${field(t('field.reviewNameEn'), input('nameEn', values.nameEn, 'maxlength="80"'))}
    ${field(t('field.reviewNameAr'), input('nameAr', values.nameAr, 'maxlength="80" dir="rtl"'))}
    ${field(t('field.reviewRoleEn'), input('roleEn', values.roleEn, 'maxlength="80"'))}
    ${field(t('field.reviewRoleAr'), input('roleAr', values.roleAr, 'maxlength="80" dir="rtl"'))}
    ${field(t('field.reviewTextEn'), area('textEn', values.textEn, 'maxlength="800"'), { span: true })}
    ${field(t('field.reviewTextAr'), area('textAr', values.textAr, 'maxlength="800" dir="rtl"'), { span: true })}
    ${field(t('field.rating'), input('rating', values.rating, 'type="number" min="1" max="5"'))}
    ${field(t('field.sortOrder'), input('sortOrder', values.sortOrder, 'type="number" min="-1000" max="1000"'))}`,
  faqs: (values) => html`
    ${field(t('field.questionEn'), input('questionEn', values.questionEn, 'maxlength="200"'), { span: true })}
    ${field(t('field.questionAr'), input('questionAr', values.questionAr, 'maxlength="200" dir="rtl"'), { span: true })}
    ${field(t('field.answerEn'), area('answerEn', values.answerEn, 'maxlength="1500"'), { span: true })}
    ${field(t('field.answerAr'), area('answerAr', values.answerAr, 'maxlength="1500" dir="rtl"'), { span: true })}
    ${field(t('field.sortOrder'), input('sortOrder', values.sortOrder, 'type="number" min="-1000" max="1000"'))}`,
};

function openEditor(ctx, kind, item, onSaved) {
  const isNew = !item;
  const values = item ?? BLANK[kind];
  const formId = uniqueId('content-form');
  const titleKey = kind === 'testimonials' ? 'Testimonial' : 'Faq';
  const { dialog, close } = openModal({
    title: t(isNew ? `content.add${titleKey}` : `content.edit${titleKey}`),
    size: 'md',
    content: html`
      <form class="form-grid" id="${formId}" novalidate>
        ${formFields[kind](values)}
        ${checkRow('isActive', values.isActive, t('field.showOnSite'))}
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
        const { item: saved } = isNew
          ? await ctx.api(`/content/${kind}`, { method: 'POST', body: readForm(form) })
          : await ctx.api(`/content/${kind}/${item.id}`, { method: 'PUT', body: readForm(form) });
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
  const [{ items: testimonials }, { items: faqs }] = await Promise.all([ctx.api('/content/testimonials'), ctx.api('/content/faqs')]);
  const state = { testimonials, faqs };
  const editable = ctx.can('manager');

  render(actions, html`<a class="btn btn--ghost btn--sm" href="/#reviews" target="_blank" rel="noopener"><i class="ri-external-link-line" aria-hidden="true"></i>${t('nav.viewSite')}</a>`);

  const rowActions = (kind, id) => html`
    <div class="row-actions">
      ${editable
        ? html`
          <button class="icon-btn icon-btn--sm" type="button" data-edit="${kind}:${id}" aria-label="${t('common.edit')}"><i class="ri-edit-line"></i></button>
          <button class="icon-btn icon-btn--sm icon-btn--danger" type="button" data-delete="${kind}:${id}" aria-label="${t('common.delete')}"><i class="ri-delete-bin-line"></i></button>`
        : ''}
    </div>`;

  function draw() {
    render(
      content,
      html`
        <section class="card">
          <div class="card__head">
            <div><h2 class="card__title">${t('content.testimonials')}</h2><p class="card__sub">${t('content.hint')}</p></div>
            ${editable ? html`<button class="btn btn--primary btn--sm" type="button" data-add="testimonials"><i class="ri-add-line" aria-hidden="true"></i>${t('content.addTestimonial')}</button>` : ''}
          </div>
          ${state.testimonials.length === 0
            ? html`<p class="empty">${t('content.emptyTestimonials')}</p>`
            : html`
              <div class="table-wrap">
                <table class="table">
                  <thead><tr><th>${t('field.reviewNameEn')}</th><th>${t('field.reviewTextEn')}</th><th>${t('field.rating')}</th><th class="num">${t('field.sortOrder')}</th><th>${t('col.active')}</th><th></th></tr></thead>
                  <tbody>
                    ${state.testimonials.map(
                      (item) => html`
                        <tr class="${item.isActive ? '' : 'is-dim'}">
                          <td><span class="cell-main">${item.nameEn || item.nameAr}</span><div class="cell-sub">${item.roleEn || item.roleAr}</div></td>
                          <td class="cell-clamp">${item.textEn || item.textAr}</td>
                          <td class="stars">${stars(item.rating)}</td>
                          <td class="num">${item.sortOrder}</td>
                          <td>${item.isActive ? html`<span class="badge badge--ok">${t('common.yes')}</span>` : html`<span class="badge">${t('common.no')}</span>`}</td>
                          <td>${rowActions('testimonials', item.id)}</td>
                        </tr>`,
                    )}
                  </tbody>
                </table>
              </div>`}
        </section>

        <section class="card">
          <div class="card__head">
            <h2 class="card__title">${t('content.faqs')}</h2>
            ${editable ? html`<button class="btn btn--primary btn--sm" type="button" data-add="faqs"><i class="ri-add-line" aria-hidden="true"></i>${t('content.addFaq')}</button>` : ''}
          </div>
          ${state.faqs.length === 0
            ? html`<p class="empty">${t('content.emptyFaqs')}</p>`
            : html`
              <div class="table-wrap">
                <table class="table">
                  <thead><tr><th>${t('field.questionEn')}</th><th>${t('field.answerEn')}</th><th class="num">${t('field.sortOrder')}</th><th>${t('col.active')}</th><th></th></tr></thead>
                  <tbody>
                    ${state.faqs.map(
                      (item) => html`
                        <tr class="${item.isActive ? '' : 'is-dim'}">
                          <td><span class="cell-main">${item.questionEn || item.questionAr}</span></td>
                          <td class="cell-clamp">${item.answerEn || item.answerAr}</td>
                          <td class="num">${item.sortOrder}</td>
                          <td>${item.isActive ? html`<span class="badge badge--ok">${t('common.yes')}</span>` : html`<span class="badge">${t('common.no')}</span>`}</td>
                          <td>${rowActions('faqs', item.id)}</td>
                        </tr>`,
                    )}
                  </tbody>
                </table>
              </div>`}
        </section>`,
    );
  }

  function replace(kind, saved) {
    const list = state[kind];
    const index = list.findIndex((item) => item.id === saved.id);
    if (index >= 0) list[index] = saved;
    else list.push(saved);
    list.sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
    draw();
  }

  content.addEventListener('click', async (event) => {
    const add = event.target.closest('[data-add]');
    if (add) {
      openEditor(ctx, add.dataset.add, null, (saved) => replace(add.dataset.add, saved));
      return;
    }
    const edit = event.target.closest('[data-edit]');
    if (edit) {
      const [kind, id] = edit.dataset.edit.split(':');
      openEditor(ctx, kind, state[kind].find((item) => item.id === Number(id)), (saved) => replace(kind, saved));
      return;
    }
    const del = event.target.closest('[data-delete]');
    if (del) {
      const [kind, id] = del.dataset.delete.split(':');
      if (!(await confirmDialog(t('content.confirmDelete')))) return;
      try {
        await ctx.api(`/content/${kind}/${id}`, { method: 'DELETE' });
        state[kind] = state[kind].filter((item) => item.id !== Number(id));
        draw();
        toast(t('common.deleted'));
      } catch (err) {
        toast(errorText(err), 'error');
      }
    }
  });

  draw();
}
