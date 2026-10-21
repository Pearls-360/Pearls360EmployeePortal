import { api } from './api.js';

/** @returns {'light' | 'dark'} */
export function getTheme() {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

/** @param {'light' | 'dark'} theme */
export function applyTheme(theme) {
  document.documentElement.dataset.theme = theme === 'dark' ? 'dark' : 'light';
}

/** Wire the Settings switch. On is dark, off is light. The choice is saved on the account. */
export function bindThemePicker(root = document) {
  const input = root.querySelector('[data-theme-toggle]');
  const label = root.querySelector('[data-theme-label]');
  if (!(input instanceof HTMLInputElement)) return;
  const sync = () => {
    const dark = getTheme() === 'dark';
    input.checked = dark;
    input.setAttribute('aria-checked', dark ? 'true' : 'false');
    if (label) label.textContent = dark ? 'Dark' : 'Light';
  };
  input.addEventListener('change', async () => {
    const next = input.checked ? 'dark' : 'light';
    const previous = getTheme();
    applyTheme(next);
    sync();
    input.disabled = true;
    try {
      await api('/auth/theme', { method: 'PATCH', body: { theme: next } });
    } catch {
      applyTheme(previous);
      sync();
    } finally {
      input.disabled = false;
    }
  });
  sync();
}
