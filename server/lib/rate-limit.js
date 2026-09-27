import rateLimit from 'express-rate-limit';

const passthrough = (_req, _res, next) => next();

/** Rate limiter that is disabled under tests so suites can exercise endpoints freely. */
export function limiter({ windowMinutes, limit, enabled, skipSuccessfulRequests = false }) {
  if (!enabled) return passthrough;
  return rateLimit({
    windowMs: windowMinutes * 60_000,
    limit,
    skipSuccessfulRequests,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: { code: 'rate_limited', message: 'Too many requests — please try again shortly' } },
  });
}
