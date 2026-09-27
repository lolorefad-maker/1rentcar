import { api } from '../core/api.js';

const STORAGE_KEY = 'adminSession';
const unauthorizedListeners = new Set();

function readStored() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return stored?.token && stored.expiresAt > Date.now() ? stored : null;
  } catch {
    return null;
  }
}

let session = readStored();

export const currentSession = () => session;

export function saveSession(next) {
  session = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable — session lives in memory only */
  }
}

export function clearSession() {
  session = null;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage unavailable */
  }
}

export function onUnauthorized(listener) {
  unauthorizedListeners.add(listener);
}

/** Authenticated call to /api/admin/*. A 401 ends the session and returns the user to sign-in. */
export async function adminApi(path, options = {}) {
  try {
    return await api(`/admin${path}`, { ...options, token: session?.token });
  } catch (err) {
    if (err.status === 401) {
      clearSession();
      unauthorizedListeners.forEach((listener) => listener(err));
    }
    throw err;
  }
}
