/**
 * An error that maps directly onto an HTTP response.
 * `code` is a stable machine-readable identifier the frontend translates.
 */
export class HttpError extends Error {
  constructor(status, code, message = code, details = undefined) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const notFound = (what = 'resource') => new HttpError(404, 'not_found', `${what} not found`);

/** Parses a positive integer route param or throws 404. */
export function idParam(value, what) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw notFound(what);
  return id;
}

export function errorHandler(err, req, res, _next) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'invalid_json', message: 'Malformed JSON body' } });
  }
  console.error(`[${req.method} ${req.originalUrl}]`, err);
  return res.status(500).json({ error: { code: 'server_error', message: 'Unexpected server error' } });
}
