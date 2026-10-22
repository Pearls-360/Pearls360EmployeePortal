import { api } from './api.js';
import { showAlert } from './forms.js';
import { DEFAULT_TIMEZONE, TIMEZONES, timezoneById } from './timezones.js';

/** @type {ReturnType<typeof setInterval> | 0} */
let timer = 0;
let zoneId = DEFAULT_TIMEZONE;

/** @param {string | null | undefined} timezone */
export function startClock(timezone) {
  zoneId = timezoneById(timezone).id;
  paint();
  clearInterval(timer);
  timer = setInterval(paint, 1000);
}

function paint() {
  const root = document.querySelector('[data-clock]');
  if (!(root instanceof HTMLElement)) return;
  const zone = timezoneById(zoneId);
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone.id,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
    weekday: 'short'
  }).formatToParts(now);
  const part = (type) => parts.find((item) => item.type === type)?.value || '';
  const hour = root.querySelector('[data-clock-hour]');
  const minute = root.querySelector('[data-clock-minute]');
  const second = root.querySelector('[data-clock-second]');
  const period = root.querySelector('[data-clock-period]');
  const place = root.querySelector('[data-clock-place]');
  if (hour) hour.textContent = part('hour');
  if (minute) minute.textContent = part('minute');
  if (second) second.textContent = part('second');
  if (period) period.textContent = part('dayPeriod');
  if (place) place.textContent = `${part('weekday')} · ${zone.place}`;
  root.setAttribute('datetime', now.toISOString());
  root.setAttribute('aria-label', `${part('hour')}:${part('minute')} ${part('dayPeriod')}, ${zone.label}`);
}

/** Fills the region list in Settings and saves the choice on the account. */
export function bindClockPicker(root = document) {
  const select = root.querySelector('[data-timezone]');
  if (!(select instanceof HTMLSelectElement)) return;
  select.replaceChildren(...TIMEZONES.map((zone) => {
    const option = document.createElement('option');
    option.value = zone.id;
    option.textContent = `${zone.label} · ${zone.place}`;
    return option;
  }));
  select.value = zoneId;
  select.addEventListener('change', async () => {
    const next = select.value;
    const previous = zoneId;
    startClock(next);
    select.disabled = true;
    try {
      await api('/auth/timezone', { method: 'PATCH', body: { timezone: next } });
      const alert = document.querySelector('[data-page-alert]');
      if (alert instanceof HTMLElement) showAlert(alert, 'Clock updated.', 'success');
    } catch (error) {
      startClock(previous);
      select.value = timezoneById(previous).id;
      const alert = document.querySelector('[data-page-alert]');
      if (alert instanceof HTMLElement) showAlert(alert, error instanceof Error ? error.message : 'Could not save that region.');
    } finally {
      select.disabled = false;
    }
  });
}
