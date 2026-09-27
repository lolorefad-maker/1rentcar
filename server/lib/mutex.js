/**
 * Serialises async critical sections (e.g. "check availability, then insert")
 * so two concurrent requests can never double-book the same car.
 */
export function createMutex() {
  let tail = Promise.resolve();
  return function runExclusive(task) {
    const result = tail.then(() => task());
    tail = result.catch(() => {});
    return result;
  };
}
