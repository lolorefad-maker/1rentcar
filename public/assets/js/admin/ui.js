import { $, html, raw, render } from '../core/dom.js';
import { t } from '../core/i18n.js';

export { toast } from '../core/toast.js';

let idSequence = 0;

/** Unique DOM id, so stacked dialogs never share form ids (a `form=` attribute binds to the first match). */
export const uniqueId = (prefix) => `${prefix}-${++idSequence}`;

/** Human, translated message for an ApiError (falls back to the server's message). */
export function errorText(err) {
  const key = `errors.${err?.code}`;
  const text = t(key, { hours: err?.details?.minimumNoticeHours ?? '', count: err?.details?.count ?? '' });
  if (text !== key) return text;
  return err?.message || t('errors.server_error');
}

/**
 * Opens a modal <dialog> that removes itself when closed. `onClose` listeners run
 * exactly once. Closing from code cleans up synchronously; the native `close`
 * event (Esc key) covers the rest — browsers may defer that event to the next frame.
 */
export function openModal({ title, size = '', content, footer = null }) {
  const dialog = document.createElement('dialog');
  dialog.className = `modal${size ? ` modal--${size}` : ''}`;
  render(
    dialog,
    html`
      <div class="modal__head">
        <h2 class="modal__title">${title}</h2>
        <button class="icon-btn icon-btn--sm" type="button" data-modal-close aria-label="${t('common.close')}"><i class="ri-close-line"></i></button>
      </div>
      <div class="modal__body" data-modal-body>${content}</div>
      ${footer ? html`<div class="modal__foot">${footer}</div>` : ''}`,
  );
  document.body.append(dialog);

  const closeListeners = [];
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    dialog.remove();
    closeListeners.forEach((listener) => listener());
  };
  const close = () => {
    if (dialog.open) dialog.close();
    finish();
  };
  dialog.addEventListener('close', finish);
  dialog.addEventListener('click', (event) => {
    if (event.target.closest('[data-modal-close]')) close();
  });
  dialog.showModal();
  return {
    dialog,
    body: $('[data-modal-body]', dialog),
    close,
    onClose: (listener) => closeListeners.push(listener),
  };
}

/** Resolves true when the user confirms. */
export function confirmDialog(message, { confirmLabel = t('common.delete'), danger = true } = {}) {
  return new Promise((resolve) => {
    let confirmed = false;
    const { dialog, close, onClose } = openModal({
      title: t('common.confirmTitle'),
      content: html`<p>${message}</p>`,
      footer: html`
        <button class="btn btn--ghost" type="button" data-modal-close>${t('common.cancel')}</button>
        <button class="btn ${danger ? 'btn--danger' : 'btn--primary'}" type="button" data-confirm>${confirmLabel}</button>`,
    });
    $('[data-confirm]', dialog).addEventListener('click', () => {
      confirmed = true;
      close();
    });
    onClose(() => resolve(confirmed));
  });
}

/** Reads named controls: checkboxes → boolean, number inputs → number (empty → null), others → string. */
export function readForm(form) {
  const data = {};
  for (const el of form.elements) {
    if (!el.name || el.disabled || el.type === 'button' || el.type === 'submit') continue;
    if (el.type === 'checkbox') data[el.name] = el.checked;
    else if (el.type === 'number') data[el.name] = el.value === '' ? null : Number(el.value);
    else data[el.name] = el.value;
  }
  return data;
}

export function showFieldErrors(form, err) {
  form.querySelectorAll('[aria-invalid]').forEach((el) => el.removeAttribute('aria-invalid'));
  for (const name of Object.keys(err?.details?.fields ?? {})) {
    form.elements.namedItem(name)?.setAttribute?.('aria-invalid', 'true');
  }
}

/** Runs `task` with a spinner on `button`, re-enabling it afterwards. */
export async function withBusy(button, task) {
  button.classList.add('is-loading');
  button.disabled = true;
  try {
    return await task();
  } finally {
    button.classList.remove('is-loading');
    button.disabled = false;
  }
}

export const field = (label, control, { span = false, hint = '' } = {}) => html`
  <label class="field${span ? ' span-all' : ''}">
    <span class="field__label">${label}</span>
    ${control}
    ${hint ? html`<span class="field__hint">${hint}</span>` : ''}
  </label>`;

export const toggle = (name, checked, label) => html`
  <span class="switch"><input type="checkbox" name="${name}" aria-label="${label}"${raw(checked ? ' checked' : '')}><span></span></span>`;

export const checkRow = (name, checked, label) => html`
  <label class="check-row"><span>${label}</span>${toggle(name, checked, label)}</label>`;

export const selected = (condition) => raw(condition ? ' selected' : '');

/** wa.me link for a customer phone. Local Jordanian numbers (07…) get the 962 country code. */
export function whatsappLink(phone, text = '') {
  let digits = String(phone ?? '').replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  else if (digits.startsWith('0')) digits = `962${digits.slice(1)}`;
  if (digits.length < 8) return '';
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}
