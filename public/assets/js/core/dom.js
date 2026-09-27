const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ESCAPES[ch]);

class SafeHtml {
  constructor(value) {
    this.value = value;
  }

  toString() {
    return this.value;
  }
}

/** Marks a string as trusted markup. Only use with markup built by this app. */
export const raw = (value) => new SafeHtml(String(value));

function stringify(value) {
  if (value instanceof SafeHtml) return value.value;
  if (Array.isArray(value)) return value.map(stringify).join('');
  if (value === null || value === undefined) return '';
  // Booleans render as "true"/"false" so attributes like aria-pressed stay valid; use ternaries for conditional markup.
  return escapeHtml(value);
}

/**
 * Tagged template for building markup. Every interpolated value is HTML-escaped
 * unless it is itself an html`` result (or raw()), which makes XSS the opt-in case.
 */
export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i += 1) out += stringify(values[i]) + strings[i + 1];
  return new SafeHtml(out);
}

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

export function render(target, content) {
  target.innerHTML = String(content);
}

export function debounce(fn, wait = 250) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

/** Minimal **bold** support for trusted-shape chat text; input is escaped first. */
export function richText(text) {
  return raw(escapeHtml(text).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>'));
}
