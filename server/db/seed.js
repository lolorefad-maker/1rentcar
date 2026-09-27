import fs from 'node:fs/promises';

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return fallback;
    throw err;
  }
}

const DEFAULT_OFFERS = [
  {
    code: 'VIPGOLD',
    discountPercent: 15,
    descriptionEn: '15% off for our premium members',
    descriptionAr: 'خصم 15% لأعضائنا المميزين',
  },
  {
    code: 'WELCOME10',
    discountPercent: 10,
    descriptionEn: '10% off your first booking',
    descriptionAr: 'خصم 10% على حجزك الأول',
  },
];

/** Seeds the curated fleet into an empty cars table, with images from the media manifest. */
async function seedFleet(db, fleetFile, manifestFile) {
  const { count } = await db.get('SELECT COUNT(*) AS count FROM cars');
  if (count > 0) return 0;

  const fleet = await readJson(fleetFile, []);
  const manifest = await readJson(manifestFile, {});
  for (const [index, car] of fleet.entries()) {
    await db.run(
      `INSERT INTO cars (slug, brand, model, trim, year, category, color, seats, transmission, fuel, powerHp,
         dailyRate, taglineEn, taglineAr, descriptionEn, descriptionAr, images, isFeatured, isActive, sortOrder)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        car.slug, car.brand, car.model, car.trim ?? '', car.year, car.category, car.color ?? '', car.seats,
        car.transmission, car.fuel, car.powerHp, car.dailyRate, car.taglineEn ?? '', car.taglineAr ?? '',
        car.descriptionEn ?? '', car.descriptionAr ?? '', JSON.stringify(manifest[car.slug]?.images ?? []),
        car.isFeatured ? 1 : 0, car.isActive !== undefined ? (car.isActive ? 1 : 0) : 1, (index + 1) * 10,
      ],
    );
  }
  return fleet.length;
}

async function seedOffers(db) {
  const { count } = await db.get('SELECT COUNT(*) AS count FROM offers');
  if (count === 0) {
    for (const offer of DEFAULT_OFFERS) {
      await db.run(
        'INSERT INTO offers (code, discountPercent, descriptionEn, descriptionAr) VALUES (?, ?, ?, ?)',
        [offer.code, offer.discountPercent, offer.descriptionEn, offer.descriptionAr],
      );
    }
  }
  // Offers imported from the prototype only had English copy.
  for (const offer of DEFAULT_OFFERS) {
    await db.run("UPDATE offers SET descriptionAr = ? WHERE code = ? AND descriptionAr = ''", [offer.descriptionAr, offer.code]);
  }
}

/**
 * Puts the website's launch copy into the editable tables, once. After that the
 * admin panel owns this content and the seeder never touches it again.
 */
async function seedSiteContent(db, contentFile) {
  const [reviews, questions] = await Promise.all([
    db.get('SELECT COUNT(*) AS count FROM testimonials'),
    db.get('SELECT COUNT(*) AS count FROM faqs'),
  ]);
  if (reviews.count > 0 && questions.count > 0) return;

  const content = await readJson(contentFile, { testimonials: [], faqs: [] });
  if (reviews.count === 0) {
    for (const [index, item] of content.testimonials.entries()) {
      await db.run(
        `INSERT INTO testimonials (nameEn, nameAr, roleEn, roleAr, textEn, textAr, rating, sortOrder)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [item.nameEn, item.nameAr, item.roleEn, item.roleAr, item.textEn, item.textAr, item.rating ?? 5, (index + 1) * 10],
      );
    }
  }
  if (questions.count === 0) {
    for (const [index, item] of content.faqs.entries()) {
      await db.run(
        'INSERT INTO faqs (questionEn, questionAr, answerEn, answerAr, sortOrder) VALUES (?, ?, ?, ?, ?)',
        [item.questionEn, item.questionAr, item.answerEn, item.answerAr, (index + 1) * 10],
      );
    }
  }
}

export async function seed(db, { fleetFile, manifestFile, contentFile }) {
  const cars = await seedFleet(db, fleetFile, manifestFile);
  await seedOffers(db);
  await seedSiteContent(db, contentFile);
  return { cars };
}
