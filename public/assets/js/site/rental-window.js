/** Remembers the customer's chosen dates between the home page and car pages (per tab). */

const KEY = 'rentalWindow';
const LOCAL_DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

export const isValidLocal = (value) => LOCAL_DATETIME_RE.test(value ?? '');

export function readWindow() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(KEY));
    return saved && isValidLocal(saved.pickupAt) && isValidLocal(saved.returnAt) ? saved : null;
  } catch {
    return null;
  }
}

export function saveWindow({ pickupAt, returnAt }) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ pickupAt, returnAt }));
  } catch {
    /* storage unavailable */
  }
}

export function clearWindow() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* storage unavailable */
  }
}
