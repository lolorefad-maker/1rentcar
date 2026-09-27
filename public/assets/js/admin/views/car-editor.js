import { $, html, raw, render } from '../../core/dom.js';
import { t } from '../../core/i18n.js';
import { checkRow, errorText, field, openModal, readForm, selected, showFieldErrors, toast, uniqueId, withBusy } from '../ui.js';
import { pickMedia } from './media-picker.js';

const CATEGORIES = ['luxury', 'suv', 'sports', 'convertible', 'classic', 'electric'];
const FUELS = ['petrol', 'diesel', 'hybrid', 'electric'];

const EMPTY_CAR = {
  brand: '',
  model: '',
  trim: '',
  year: new Date().getFullYear(),
  category: 'luxury',
  color: '',
  seats: 5,
  transmission: 'automatic',
  fuel: 'petrol',
  powerHp: null,
  dailyRate: null,
  deposit: 0,
  taglineEn: '',
  taglineAr: '',
  descriptionEn: '',
  descriptionAr: '',
  images: [],
  status: 'available',
  isActive: true,
  isFeatured: false,
  sortOrder: 0,
};

const input = (name, value, attrs = '') => html`<input class="control" name="${name}" value="${value ?? ''}"${raw(attrs ? ` ${attrs}` : '')}>`;
const textarea = (name, value, attrs = '') => html`<textarea class="control" name="${name}" rows="3"${raw(attrs ? ` ${attrs}` : '')}>${value ?? ''}</textarea>`;

/** Create / edit a vehicle, including its photo gallery. Calls onSaved(car) after a successful save. */
export function openCarEditor(ctx, car, { onSaved }) {
  const isNew = !car;
  const values = car ?? EMPTY_CAR;
  const formId = uniqueId('car-form');
  let images = values.images.map(({ src, thumb }) => ({ src, thumb }));

  const { dialog, close } = openModal({
    title: isNew ? t('editor.newTitle') : t('editor.editTitle', { car: car.name }),
    size: 'lg',
    content: html`
      <form class="car-form" id="${formId}" novalidate>
        <section class="fieldset">
          <h3 class="fieldset__title">${t('editor.details')}</h3>
          <div class="form-grid form-grid--3">
            ${field(t('field.brand'), input('brand', values.brand, 'required maxlength="60"'))}
            ${field(t('field.model'), input('model', values.model, 'required maxlength="80"'))}
            ${field(t('field.trim'), input('trim', values.trim, 'maxlength="60"'))}
            ${field(t('field.year'), input('year', values.year, 'type="number" min="1900" max="2100"'))}
            ${field(
              t('field.category'),
              html`<select class="control" name="category">${CATEGORIES.map((c) => html`<option value="${c}"${selected(c === values.category)}>${t(`cat.${c}`)}</option>`)}</select>`,
            )}
            ${field(t('field.color'), input('color', values.color, 'maxlength="40"'))}
            ${field(t('field.seats'), input('seats', values.seats, 'type="number" min="1" max="60" required'))}
            ${field(
              t('field.transmission'),
              html`<select class="control" name="transmission">
                <option value=""${selected(!values.transmission)}>${t('trans.none')}</option>
                <option value="automatic"${selected(values.transmission === 'automatic')}>${t('trans.automatic')}</option>
                <option value="manual"${selected(values.transmission === 'manual')}>${t('trans.manual')}</option>
              </select>`,
            )}
            ${field(
              t('field.fuel'),
              html`<select class="control" name="fuel">${FUELS.map((f) => html`<option value="${f}"${selected(f === values.fuel)}>${t(`fuel.${f}`)}</option>`)}</select>`,
            )}
            ${field(t('field.powerHp'), input('powerHp', values.powerHp, 'type="number" min="1" max="5000"'))}
          </div>
        </section>

        <section class="fieldset">
          <h3 class="fieldset__title">${t('editor.pricing')}</h3>
          <div class="form-grid">
            ${field(`${t('field.dailyRate')} (${ctx.settings.currency})`, input('dailyRate', values.dailyRate, 'type="number" min="1" step="1" required'))}
            ${field(`${t('field.deposit')} (${ctx.settings.currency})`, input('deposit', values.deposit, 'type="number" min="0" step="1"'), { hint: t('field.depositHint') })}
          </div>
        </section>

        <section class="fieldset">
          <h3 class="fieldset__title">${t('editor.photos')}</h3>
          <p class="fieldset__hint">${t('photos.hint')}</p>
          <div class="photo-list" data-photos></div>
          <div class="photo-tools">
            <button class="btn btn--ghost btn--sm" type="button" data-library><i class="ri-image-add-line" aria-hidden="true"></i>${t('photos.add')}</button>
            <label class="btn btn--ghost btn--sm" data-upload-label>
              <i class="ri-upload-2-line" aria-hidden="true"></i>${t('photos.upload')}
              <input class="sr-only" type="file" accept="image/jpeg,image/png,image/webp,image/avif" multiple data-upload>
            </label>
          </div>
        </section>

        <section class="fieldset">
          <h3 class="fieldset__title">${t('editor.content')}</h3>
          <div class="form-grid">
            ${field(t('field.taglineEn'), input('taglineEn', values.taglineEn, 'maxlength="120"'))}
            ${field(t('field.taglineAr'), input('taglineAr', values.taglineAr, 'maxlength="120" dir="rtl"'))}
            ${field(t('field.descriptionEn'), textarea('descriptionEn', values.descriptionEn, 'maxlength="3000"'))}
            ${field(t('field.descriptionAr'), textarea('descriptionAr', values.descriptionAr, 'maxlength="3000" dir="rtl"'))}
          </div>
        </section>

        <section class="fieldset">
          <h3 class="fieldset__title">${t('editor.visibility')}</h3>
          <div class="form-grid">
            ${checkRow('isActive', values.isActive, t('field.isActive'))}
            ${checkRow('isFeatured', values.isFeatured, t('field.isFeatured'))}
            ${field(
              t('field.status'),
              html`<select class="control" name="status">
                <option value="available"${selected(values.status === 'available')}>${t('carStatus.available')}</option>
                <option value="maintenance"${selected(values.status === 'maintenance')}>${t('carStatus.maintenance')}</option>
              </select>`,
            )}
            ${field(t('field.sortOrder'), input('sortOrder', values.sortOrder, 'type="number" step="1"'), { hint: t('field.sortHint') })}
          </div>
        </section>

        <p class="form-error" data-error role="alert"></p>
      </form>`,
    footer: html`
      <button class="btn btn--ghost" type="button" data-modal-close>${t('common.cancel')}</button>
      <button class="btn btn--primary" type="submit" form="${formId}">${t('common.save')}</button>`,
  });

  const form = $(`#${formId}`, dialog);
  const photos = $('[data-photos]', form);
  const errorEl = $('[data-error]', form);

  function drawPhotos() {
    const action = (attr, index, icon, label) =>
      html`<button class="icon-btn" type="button" ${raw(`data-${attr}="${index}"`)} title="${label}" aria-label="${label}"><i class="${icon}"></i></button>`;
    render(
      photos,
      images.length
        ? html`${images.map(
            (image, i) => html`
              <figure class="photo">
                <img src="${image.thumb || image.src}" alt="" loading="lazy">
                ${i === 0 ? html`<span class="badge badge--gold photo__cover">${t('photos.cover')}</span>` : ''}
                <div class="photo__actions">
                  ${i > 0 ? action('cover', i, 'ri-star-line', t('photos.makeCover')) : ''}
                  ${i > 0 ? action('up', i, 'ri-arrow-left-line flip-rtl', t('photos.moveUp')) : ''}
                  ${i < images.length - 1 ? action('down', i, 'ri-arrow-right-line flip-rtl', t('photos.moveDown')) : ''}
                  ${action('remove', i, 'ri-delete-bin-line', t('photos.remove'))}
                </div>
              </figure>`,
          )}`
        : html`<p class="cell-sub">${t('photos.empty')}</p>`,
    );
  }

  const move = (from, to) => {
    const [image] = images.splice(from, 1);
    images.splice(to, 0, image);
    drawPhotos();
  };

  photos.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    const { cover, up, down, remove } = button.dataset;
    if (cover !== undefined) move(Number(cover), 0);
    if (up !== undefined) move(Number(up), Number(up) - 1);
    if (down !== undefined) move(Number(down), Number(down) + 1);
    if (remove !== undefined) {
      images.splice(Number(remove), 1);
      drawPhotos();
    }
  });

  $('[data-library]', form).addEventListener('click', async () => {
    const picked = await pickMedia(ctx, { exclude: images.map((image) => image.src) });
    images = [...images, ...picked];
    drawPhotos();
  });

  $('[data-upload]', form).addEventListener('change', async (event) => {
    const files = [...event.target.files];
    event.target.value = '';
    if (files.length === 0) return;
    const label = $('[data-upload-label]', form);
    label.classList.add('is-loading');
    let uploaded = 0;
    for (const file of files) {
      try {
        const { image } = await ctx.api('/uploads', { method: 'POST', file });
        images.push(image);
        uploaded += 1;
      } catch (err) {
        toast(`${file.name}: ${errorText(err)}`, 'error');
      }
    }
    label.classList.remove('is-loading');
    drawPhotos();
    if (uploaded) toast(t('photos.uploaded', { n: uploaded }));
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    errorEl.textContent = '';
    if (!form.reportValidity()) return;
    const data = { ...readForm(form), images: images.map((image) => image.src) };
    const button = dialog.querySelector(`[form="${formId}"]`);
    await withBusy(button, async () => {
      try {
        const { car: saved } = isNew
          ? await ctx.api('/cars', { method: 'POST', body: data })
          : await ctx.api(`/cars/${car.id}`, { method: 'PUT', body: data });
        toast(t(isNew ? 'editor.created' : 'editor.saved', { car: saved.name }));
        close();
        onSaved(saved);
      } catch (err) {
        errorEl.textContent = errorText(err);
        showFieldErrors(form, err);
      }
    });
  });

  drawPhotos();
}
