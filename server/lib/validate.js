import { HttpError } from './http.js';

const DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?[\d\s()-]{7,20}$/;

const isBlank = (value) => value === undefined || value === null || (typeof value === 'string' && value.trim() === '');

/** Each coercer returns the clean value, or undefined when the input is invalid. */
const coercers = {
  string(value, rule) {
    if (typeof value !== 'string' && typeof value !== 'number') return undefined;
    const text = String(value).trim();
    return text.length <= (rule.max ?? 500) ? text : undefined;
  },
  int(value, rule) {
    const n = typeof value === 'string' ? Number(value.trim()) : value;
    if (!Number.isInteger(n)) return undefined;
    if (rule.min !== undefined && n < rule.min) return undefined;
    if (rule.max !== undefined && n > rule.max) return undefined;
    return n;
  },
  bool(value) {
    if (value === true || value === 1 || value === '1' || value === 'true') return true;
    if (value === false || value === 0 || value === '0' || value === 'false') return false;
    return undefined;
  },
  enum(value, rule) {
    return rule.values.includes(value) ? value : undefined;
  },
  datetime(value) {
    return typeof value === 'string' && DATETIME_RE.test(value) ? value.slice(0, 16) : undefined;
  },
  date(value) {
    return typeof value === 'string' && DATE_RE.test(value) ? value : undefined;
  },
  email(value) {
    const text = coercers.string(value, { max: 120 });
    return text !== undefined && EMAIL_RE.test(text) ? text.toLowerCase() : undefined;
  },
  phone(value) {
    const text = coercers.string(value, { max: 30 });
    return text !== undefined && PHONE_RE.test(text) ? text : undefined;
  },
  stringList(value, rule) {
    if (!Array.isArray(value) || value.length > (rule.maxItems ?? 30)) return undefined;
    const items = value.map((item) => coercers.string(item, { max: rule.maxItem ?? 300 }));
    return items.includes(undefined) ? undefined : items.filter(Boolean);
  },
};

const emptyValue = (rule) => (rule.type === 'string' || rule.type === 'email' || rule.type === 'phone' ? '' : null);

/**
 * Validates and normalises `input` against `schema`.
 * Rule shape: { type, required?, default?, min?, max?, values? }.
 * In `partial` mode (updates) fields that are absent are skipped entirely.
 * Throws HttpError 400 `validation_failed` with `details.fields` on failure.
 */
export function validate(input, schema, { partial = false } = {}) {
  const source = input && typeof input === 'object' ? input : {};
  const clean = {};
  const fields = {};

  for (const [field, rule] of Object.entries(schema)) {
    const raw = source[field];

    if (isBlank(raw)) {
      if (partial && raw === undefined) continue;
      if (rule.required) fields[field] = 'required';
      else if ('default' in rule) clean[field] = rule.default;
      else clean[field] = emptyValue(rule);
      continue;
    }

    const value = coercers[rule.type](raw, rule);
    if (value === undefined) fields[field] = 'invalid';
    else clean[field] = value;
  }

  if (Object.keys(fields).length > 0) {
    throw new HttpError(400, 'validation_failed', 'Some fields are missing or invalid', { fields });
  }
  return clean;
}
