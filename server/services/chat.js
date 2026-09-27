/**
 * Bilingual concierge. Rule-based and fully data-driven: every price, phone
 * number, fee and promo code comes from the live database and admin settings.
 */
import { carDisplayName } from './cars.js';

/** Folds Arabic letter variants and case so matching is forgiving. */
function normalize(text) {
  return String(text)
    .toLowerCase()
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const words = (list) => list.map(normalize);

const INTENTS = {
  location: words(['location', 'address', 'where', 'map', 'موقع', 'عنوان', 'وين', 'مكان', 'فرع']),
  contact: words(['phone', 'number', 'contact', 'call', 'whatsapp', 'email', 'رقم', 'هاتف', 'تلفون', 'اتصال', 'واتس', 'تواصل', 'ايميل']),
  chauffeur: words(['driver', 'chauffeur', 'سائق', 'شوفير', 'سواق']),
  airport: words(['airport', 'flight', 'delivery', 'deliver', 'مطار', 'توصيل', 'استقبال']),
  offers: words(['discount', 'offer', 'promo', 'coupon', 'deal', 'خصم', 'عرض', 'عروض', 'كود', 'كوبون']),
  cheap: words(['cheap', 'budget', 'cheapest', 'lowest', 'affordable', 'رخيص', 'ارخص', 'اقل سعر', 'اقتصادي']),
  hours: words(['hours', 'open', 'opening', 'دوام', 'ساعات', 'مفتوح']),
};

const CATEGORY_WORDS = {
  classic: words(['classic', 'vintage', 'كلاسيك', 'كلاسيكيه']),
  convertible: words(['convertible', 'cabrio', 'roadster', 'open top', 'مكشوفه', 'كشف', 'كابريو']),
  electric: words(['electric', 'كهربائيه', 'كهربائي', 'كهرباء']),
  suv: words(['suv', '4x4', 'offroad', 'off-road', 'desert', 'دفع رباعي', 'صحراء', 'عائليه']),
  sports: words(['sport', 'sports', 'fast', 'performance', 'رياضيه', 'رياضي', 'سريعه']),
  luxury: words(['luxury', 'executive', 'sedan', 'wedding', 'bride', 'عرس', 'زفاف', 'اعراس', 'عروس', 'فخمه', 'فاخره', 'تنفيذيه', 'صالون']),
};

/** Extra search words (mostly Arabic spellings) keyed by a brand/model fragment. */
const ALIASES = {
  'rolls-royce': ['rolls', 'royce', 'رولز', 'رويس', 'رولز رويس'],
  ghost: ['غوست', 'جوست'],
  'mercedes-benz': ['mercedes', 'benz', 'مرسيدس', 'بنز'],
  maybach: ['مايباخ', 'ميباخ'],
  'g 63': ['g63', 'g-class', 'g class', 'جي كلاس', 'جي 63', 'جي كلاس'],
  's-class': ['s class', 's500', 'اس كلاس'],
  'e-class': ['e class', 'اي كلاس'],
  brabus: ['برابوس'],
  'land rover': ['landrover', 'لاند روفر'],
  'range rover': ['range', 'رنج', 'رينج', 'رنج روفر', 'رينج روفر'],
  defender: ['ديفندر', 'ديفيندر'],
  cadillac: ['كاديلاك', 'كاديلك'],
  escalade: ['اسكاليد', 'اسكاليد'],
  chevrolet: ['chevy', 'شيفروليه', 'شفروليه', 'شيفرليه'],
  tahoe: ['تاهو'],
  camaro: ['كامارو'],
  impala: ['امبالا'],
  toyota: ['تويوتا'],
  'land cruiser': ['landcruiser', 'lc300', 'لاندكروزر', 'لاند كروزر', 'لكزس'],
  sequoia: ['سيكويا'],
  jeep: ['جيب'],
  gladiator: ['جلادياتور'],
  cherokee: ['شيروكي', 'جراند شيروكي'],
  bmw: ['بي ام', 'بي ام دبليو', 'بمو'],
  hongqi: ['هونشي', 'هونغ تشي', 'هونغشي'],
  polestar: ['بولستار'],
  jetour: ['جيتور'],
};

const includesAny = (query, list) => list.some((word) => word && query.includes(word));

function carKeywords(car) {
  const name = normalize(`${car.brand} ${car.model} ${car.trim}`);
  const keywords = new Set(name.split(' ').filter((token) => token.length >= 3 || /\d/.test(token)));
  keywords.add(normalize(car.model));
  for (const [key, aliases] of Object.entries(ALIASES)) {
    if (name.includes(normalize(key))) {
      keywords.add(normalize(key));
      aliases.forEach((alias) => keywords.add(normalize(alias)));
    }
  }
  return [...keywords];
}

function matchCars(query, cars) {
  return cars
    .map((car) => ({ car, score: carKeywords(car).filter((keyword) => query.includes(keyword)).length }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || b.car.isFeatured - a.car.isFeatured || b.car.dailyRate - a.car.dailyRate)
    .map((entry) => entry.car);
}

export function createConcierge({ formatMoney }) {
  return function reply({ message, lang, cars, settings, offers }) {
    const ar = lang === 'ar';
    const query = normalize(message);
    const name = settings.businessName;
    const money = (amount) => formatMoney(amount, settings.currency, lang);
    const suggestion = (car) => ({ slug: car.slug, name: carDisplayName(car), dailyRate: car.dailyRate, image: car.image });
    const answer = (text, picks = []) => ({ reply: text, cars: picks.slice(0, 4).map(suggestion) });

    const matched = matchCars(query, cars);
    if (matched.length > 0) {
      const [top] = matched;
      const text = ar
        ? `وجدت لك ${matched.length > 1 ? `${matched.length} خيارات` : 'هذا الخيار'} 👇\n**${carDisplayName(top)}** ابتداءً من **${money(top.dailyRate)}** يومياً.\nاضغط على السيارة لرؤية الصور والتوفر وإتمام الحجز.`
        : `I found ${matched.length > 1 ? `${matched.length} matches` : 'a match'} for you 👇\n**${carDisplayName(top)}** from **${money(top.dailyRate)}** per day.\nTap a car to see photos, availability and book instantly.`;
      return answer(text, matched);
    }

    const category = Object.entries(CATEGORY_WORDS).find(([, list]) => includesAny(query, list))?.[0];
    if (category) {
      const picks = cars.filter((car) => car.category === category);
      const text = ar
        ? `إليك أبرز سياراتنا من هذه الفئة (${picks.length} سيارة متاحة في الأسطول):`
        : `Here are highlights from this collection (${picks.length} in our fleet):`;
      return answer(text, picks);
    }

    if (includesAny(query, INTENTS.cheap)) {
      const picks = [...cars].sort((a, b) => a.dailyRate - b.dailyRate);
      return answer(ar ? 'أفضل الخيارات من حيث السعر:' : 'Our best-value options:', picks);
    }

    if (includesAny(query, INTENTS.offers)) {
      if (offers.length === 0) {
        return answer(ar ? 'لا توجد عروض عامة حالياً، لكن تواصل معنا لطلب سعر خاص للحجوزات الطويلة.' : 'There are no public offers right now — contact us for a tailored long-term rate.');
      }
      const lines = offers.map((offer) => {
        const description = (ar ? offer.descriptionAr || offer.descriptionEn : offer.descriptionEn || offer.descriptionAr) || '';
        return `• **${offer.code}** — ${offer.discountPercent}%${description ? ` · ${description}` : ''}`;
      });
      return answer(`${ar ? '🎁 العروض الحالية:' : '🎁 Current offers:'}\n${lines.join('\n')}`);
    }

    if (includesAny(query, INTENTS.chauffeur)) {
      return answer(ar
        ? `👨‍✈️ نوفر سائقين محترفين بتكلفة **${money(settings.chauffeurDailyRate)}** يومياً. فعّل خيار "سائق خاص" عند الحجز.`
        : `👨‍✈️ Professional chauffeurs are available for **${money(settings.chauffeurDailyRate)}** per day. Just enable "Private chauffeur" when booking.`);
    }

    if (includesAny(query, INTENTS.airport)) {
      return answer(ar
        ? `✈️ نسلّمك السيارة في مطار الملكة علياء الدولي أو فندقك مقابل **${money(settings.airportFee)}** لمرة واحدة.`
        : `✈️ We deliver to Queen Alia International Airport or your hotel for a one-time **${money(settings.airportFee)}**.`);
    }

    if (includesAny(query, INTENTS.location)) {
      return answer(ar ? `📍 **${settings.addressAr}**\nونوفر التوصيل إلى أي عنوان في عمّان.` : `📍 **${settings.addressEn}**\nWe also deliver anywhere in Amman.`);
    }

    if (includesAny(query, INTENTS.hours)) {
      return answer(ar ? `🕐 ${settings.hoursAr}` : `🕐 ${settings.hoursEn}`);
    }

    if (includesAny(query, INTENTS.contact)) {
      const lines = [
        settings.phone && `📞 ${settings.phone}`,
        settings.whatsapp && `🟢 WhatsApp: +${settings.whatsapp}`,
        settings.email && `✉️ ${settings.email}`,
      ].filter(Boolean);
      return answer(`${ar ? 'يسعدنا تواصلك:' : 'We would love to hear from you:'}\n${lines.join('\n')}`);
    }

    const featured = cars.filter((car) => car.isFeatured);
    return answer(
      ar
        ? `أهلاً بك في **${name}** 🖤\nأستطيع مساعدتك في اختيار السيارة، الأسعار، العروض، السائق الخاص أو التوصيل للمطار. اكتب اسم السيارة (مثال: G63، رنج روفر، رولز رويس) أو المناسبة (عرس، رحلة صحراوية).`
        : `Welcome to **${name}** 🖤\nI can help with cars, prices, offers, chauffeurs or airport delivery. Try a car name (e.g. G63, Range Rover, Rolls-Royce) or an occasion (wedding, desert trip).`,
      featured.length > 0 ? featured : cars,
    );
  };
}
