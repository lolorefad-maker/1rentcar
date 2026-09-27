import { config } from '../config.js';

const formatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: config.timezone,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/**
 * The business clock, expressed as wall-clock "YYYY-MM-DDTHH:mm" in the
 * business timezone (the same shape customers enter dates in).
 * Tests replace `nowLocal` to pin time.
 */
export const clock = {
  nowLocal() {
    const parts = Object.fromEntries(formatter.formatToParts(new Date()).map((p) => [p.type, p.value]));
    return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
  },
};

export const isoNow = () => new Date().toISOString();
