import { t } from '../core/i18n.js';

export { toast } from '../core/toast.js';

/** Translates an ApiError into a human sentence in the current language. */
export function errorMessage(err) {
  const key = `errors.${err?.code}`;
  const message = t(key, { hours: err?.details?.minimumNoticeHours ?? '' });
  return message === key ? t('errors.server_error') : message;
}

export function markInvalid(form, err) {
  for (const name of Object.keys(err?.details?.fields ?? {})) {
    form.elements.namedItem(name)?.setAttribute?.('aria-invalid', 'true');
  }
}

export function clearInvalid(element) {
  element?.removeAttribute?.('aria-invalid');
}

/** Fades sections in as they scroll into view. */
export function initReveal() {
  document.documentElement.classList.add('js');
  const items = document.querySelectorAll('[data-reveal]');
  if (!('IntersectionObserver' in window)) {
    items.forEach((item) => item.classList.add('is-visible'));
    return;
  }
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    },
    { rootMargin: '0px 0px -8% 0px' },
  );
  items.forEach((item) => observer.observe(item));
}
