export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details ?? {};
  }
}

/**
 * JSON client for the /api endpoints. Errors are normalised to ApiError with
 * the server's stable `code`, which the UI translates.
 */
export async function api(path, { method = 'GET', body, token, signal, file } = {}) {
  const headers = {};
  let payload;
  if (token) headers.Authorization = `Bearer ${token}`;
  if (file) {
    headers['Content-Type'] = file.type || 'application/octet-stream';
    payload = file;
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  let response;
  try {
    response = await fetch(`/api${path}`, { method, headers, body: payload, signal });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new ApiError(0, 'network_error', 'Network error');
  }

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const error = data?.error ?? {};
    throw new ApiError(response.status, error.code ?? 'server_error', error.message ?? response.statusText, error.details);
  }
  return data;
}
