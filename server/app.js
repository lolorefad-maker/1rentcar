import compression from 'compression';
import express from 'express';
import helmet from 'helmet';
import path from 'node:path';
import { formatMoney } from './lib/format.js';
import { HttpError, errorHandler } from './lib/http.js';
import { limiter } from './lib/rate-limit.js';
import { adminRoutes } from './routes/admin.js';
import { pageRoutes } from './routes/pages.js';
import { publicRoutes } from './routes/public.js';
import { createConcierge } from './services/chat.js';

const CONTENT_SECURITY_POLICY = {
  useDefaults: false,
  directives: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'"],
    styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://cdn.jsdelivr.net'],
    fontSrc: ["'self'", 'data:', 'https://fonts.gstatic.com', 'https://cdn.jsdelivr.net'],
    imgSrc: ["'self'", 'data:', 'blob:'],
    connectSrc: ["'self'"],
    frameSrc: ['https://www.google.com'],
    objectSrc: ["'none'"],
    baseUri: ["'self'"],
    formAction: ["'self'"],
    frameAncestors: ["'self'"],
  },
};

const LONG_CACHE_DIRS = ['/media/', '/uploads/', '/whatsapp_images/'];

function staticHeaders(res, filePath) {
  const webPath = filePath.split(path.sep).join('/');
  if (webPath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
  else res.setHeader('Cache-Control', 'no-cache, must-revalidate');
}

export function createApp({ db, config, media }) {
  const app = express();
  const rateLimited = !config.isTest;
  const concierge = createConcierge({ formatMoney });

  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback');
  app.use(helmet({ contentSecurityPolicy: CONTENT_SECURITY_POLICY, crossOriginEmbedderPolicy: false }));
  app.use(compression());
  app.use(express.json({ limit: '200kb' }));

  app.use('/api', limiter({ windowMinutes: 15, limit: 900, enabled: rateLimited }));
  app.use('/api/admin', adminRoutes({ db, media, config, rateLimited }));
  app.use('/api', publicRoutes({ db, media, concierge, rateLimited }));
  app.use('/api', () => {
    throw new HttpError(404, 'not_found', 'Endpoint not found');
  });

  app.use(pageRoutes({ db, media, config }));
  app.use(express.static(config.publicDir, { index: false, setHeaders: staticHeaders }));
  app.use((_req, res) => res.status(404).set('Cache-Control', 'no-cache').sendFile(path.join(config.publicDir, '404.html')));
  app.use(errorHandler);

  return app;
}
