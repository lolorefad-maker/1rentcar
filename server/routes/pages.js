import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { formatMoney } from '../lib/format.js';
import { getCar, listCars, serializeCar } from '../services/cars.js';
import { getSettings } from '../services/settings.js';

/** 1×1 transparent GIF, used when the fleet is empty so no <img src=""> is emitted. */
const BLANK_IMAGE = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';

const escapeHtml = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

/** Replaces {{key}} placeholders with HTML-escaped values. */
const render = (template, values) => template.replace(/\{\{(\w+)\}\}/g, (_, key) => escapeHtml(values[key]));

/**
 * Server-rendered <head> metadata for shareable pages, so links pasted into
 * WhatsApp / social apps show the right title, description and photo.
 */
export function pageRoutes({ db, media, config }) {
  const router = express.Router();
  const cache = new Map();

  async function template(name) {
    if (config.isTest || !cache.has(name)) cache.set(name, await fs.readFile(path.join(config.publicDir, name), 'utf8'));
    return cache.get(name);
  }

  const sendHtml = (res, html, status = 200) => res.status(status).set('Cache-Control', 'no-cache').type('html').send(html);

  router.get(['/', '/index.html'], async (req, res) => {
    const [settings, [lead]] = await Promise.all([getSettings(db), listCars(db)]);
    const origin = `${req.protocol}://${req.get('host')}`;
    // The lead car's photo is rendered into the hero (and preloaded) for a fast first paint.
    const heroImage = lead ? (serializeCar(lead, media).images[0]?.src ?? BLANK_IMAGE) : BLANK_IMAGE;
    sendHtml(res, render(await template('index.html'), { businessName: settings.businessName, origin, heroImage }));
  });

  // The car template is only meaningful behind /cars/:slug.
  router.get('/car.html', (_req, res) => res.redirect(302, '/#fleet'));

  router.get('/cars/:slug', async (req, res, next) => {
    let row;
    try {
      row = await getCar(db, req.params.slug);
    } catch {
      return next();
    }
    const settings = await getSettings(db);
    const car = serializeCar(row, media);
    const origin = `${req.protocol}://${req.get('host')}`;
    const price = formatMoney(car.dailyRate, settings.currency, 'en');
    sendHtml(
      res,
      render(await template('car.html'), {
        businessName: settings.businessName,
        title: `${car.name}${car.year ? ` ${car.year}` : ''} — ${settings.businessName}`,
        description: `${car.descriptionEn} From ${price}/day.`,
        image: car.images[0] ? `${origin}${car.images[0].src}` : '',
        url: `${origin}/cars/${car.slug}`,
      }),
    );
  });

  // Links shared from the previous version of the site.
  router.get('/car-detail.html', async (req, res) => {
    try {
      const row = await getCar(db, req.query.id);
      res.redirect(301, `/cars/${row.slug}`);
    } catch {
      res.redirect(302, '/#fleet');
    }
  });

  return router;
}
