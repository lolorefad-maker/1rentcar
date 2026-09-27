/**
 * Tiny i18n layer shared by the storefront and the admin.
 *  - data-i18n="key"                       → element text
 *  - data-i18n-attr="placeholder:key;..."  → attributes
 *  - t('key', { vars })                    → strings in JS
 * Changing language updates <html lang/dir> and emits a `langchange` event.
 */

const STORAGE_KEY = 'lang';
const dictionary = { en: {}, ar: {} };

function detectLanguage() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'en' || saved === 'ar') return saved;
  } catch {
    /* storage unavailable */
  }
  return navigator.language?.toLowerCase().startsWith('ar') ? 'ar' : 'en';
}

let current = detectLanguage();

export const lang = () => current;
export const isArabic = () => current === 'ar';

export function registerStrings(strings) {
  Object.assign(dictionary.en, strings.en);
  Object.assign(dictionary.ar, strings.ar);
}

export function t(key, vars = {}) {
  const template = dictionary[current][key] ?? dictionary.en[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (match, name) => (name in vars ? String(vars[name]) : match));
}

/** Picks the language variant of a bilingual field, e.g. pick(car, 'description') → descriptionEn/Ar. */
export function pick(record, field) {
  const en = record?.[`${field}En`] ?? '';
  const ar = record?.[`${field}Ar`] ?? '';
  return current === 'ar' ? ar || en : en || ar;
}

export function syncDocument() {
  document.documentElement.lang = current;
  document.documentElement.dir = current === 'ar' ? 'rtl' : 'ltr';
}

export function applyTranslations(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  root.querySelectorAll('[data-i18n-attr]').forEach((el) => {
    for (const pair of el.dataset.i18nAttr.split(';')) {
      const [attr, key] = pair.split(':').map((part) => part.trim());
      if (attr && key) el.setAttribute(attr, t(key));
    }
  });
}

export function setLang(next) {
  if (next === current) return;
  current = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    /* storage unavailable */
  }
  syncDocument();
  applyTranslations();
  document.dispatchEvent(new CustomEvent('langchange', { detail: next }));
}

/** Call once per page after registering strings. */
export function initI18n(strings) {
  registerStrings(strings);
  syncDocument();
  applyTranslations();
}
