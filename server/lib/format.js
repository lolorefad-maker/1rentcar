const formatters = new Map();

/** Whole-unit currency formatting, Latin digits in both languages (matches the site). */
export function formatMoney(amount, currency, lang = 'en') {
  const key = `${lang}:${currency}`;
  if (!formatters.has(key)) {
    formatters.set(
      key,
      new Intl.NumberFormat(lang === 'ar' ? 'ar-JO-u-nu-latn' : 'en-US', {
        style: 'currency',
        currency,
        maximumFractionDigits: 0,
      }),
    );
  }
  return formatters.get(key).format(amount);
}
