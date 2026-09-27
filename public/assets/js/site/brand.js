import { api } from '../core/api.js';
import { pick, t } from '../core/i18n.js';

/** Used only if the settings endpoint is unreachable, so the page still renders. */
const FALLBACK_SETTINGS = {
  businessName: '1 Rent Car',
  currency: 'USD',
  phone: '+962 7 8857 7884',
  whatsapp: '962788577884',
  email: 'rcar7625@gmail.com',
  addressEn: 'Amman, Jordan',
  addressAr: 'عمّان، الأردن',
  hoursEn: 'Open 24/7',
  hoursAr: 'على مدار الساعة 24/7',
  instagramUrl: 'https://www.instagram.com/1rentcar.jo/',
  facebookUrl: 'https://www.facebook.com/1rentcar',
  tiktokUrl: 'https://www.tiktok.com/@1.rent.car',
  airportFee: 0,
  chauffeurDailyRate: 0,
  weeklyDiscountPercent: 0,
  monthlyDiscountPercent: 0,
  minimumNoticeHours: 0,
};

export async function loadSettings() {
  try {
    return { ...FALLBACK_SETTINGS, ...(await api('/settings')) };
  } catch {
    return { ...FALLBACK_SETTINGS };
  }
}

const digits = (value) => String(value ?? '').replace(/\D/g, '');

export function whatsappUrl(settings, text = '') {
  const number = digits(settings.whatsapp);
  if (!number) return '';
  return `https://wa.me/${number}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}

/** "Luxury Motors" → Luxury <span class="brand__accent">Motors</span> */
function brandNodes(name) {
  const [first, ...rest] = name.trim().split(/\s+/);
  const nodes = [document.createTextNode(first)];
  if (rest.length > 0) {
    const accent = document.createElement('span');
    accent.className = 'brand__accent';
    accent.textContent = rest.join(' ');
    nodes.push(accent);
  }
  return nodes;
}

/**
 * Pushes admin-managed business details into the page:
 *  [data-brand] wordmark · [data-bind="phone|email|…"] text · [data-link="phone|whatsapp|…"] hrefs
 * Elements whose link is not configured are hidden.
 */
export function applyBrand(settings) {
  document.querySelectorAll('[data-brand]').forEach((el) => el.replaceChildren(...brandNodes(settings.businessName)));

  const text = {
    businessName: settings.businessName,
    phone: settings.phone,
    email: settings.email,
    whatsapp: settings.whatsapp ? `+${digits(settings.whatsapp)}` : '',
    address: pick(settings, 'address'),
    hours: pick(settings, 'hours'),
    year: String(new Date().getFullYear()),
  };
  document.querySelectorAll('[data-bind]').forEach((el) => {
    el.textContent = text[el.dataset.bind] ?? '';
  });

  const links = {
    phone: settings.phone ? `tel:${settings.phone.replace(/[^\d+]/g, '')}` : '',
    email: settings.email ? `mailto:${settings.email}` : '',
    whatsapp: whatsappUrl(settings, t('wa.general', { business: settings.businessName })),
    map: settings.addressEn ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(settings.addressEn)}` : '',
    instagram: settings.instagramUrl,
    facebook: settings.facebookUrl,
    tiktok: settings.tiktokUrl,
  };
  document.querySelectorAll('[data-link]').forEach((el) => {
    const href = links[el.dataset.link];
    el.hidden = !href;
    if (href) el.href = href;
  });

  document.querySelectorAll('[data-map]').forEach((frame) => {
    const wrapper = frame.closest('[data-map-wrap]');
    if (!settings.addressEn) {
      wrapper?.setAttribute('hidden', '');
      return;
    }
    const src = `https://www.google.com/maps?q=${encodeURIComponent(settings.addressEn)}&output=embed`;
    if (frame.getAttribute('src') !== src) frame.setAttribute('src', src);
  });
}
