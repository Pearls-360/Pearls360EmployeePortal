const THEME_KEY = 'p360-theme';

/** @returns {'light' | 'dark'} */
export function getTheme() {
  const stored = localStorage.getItem(THEME_KEY);
  if (stored === 'dark' || stored === 'light') return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** @param {'light' | 'dark'} theme */
export function setTheme(theme) {
  localStorage.setItem(THEME_KEY, theme);
  document.documentElement.dataset.theme = theme;
}

/** Apply saved theme before paint when possible. */
export function applyStoredTheme() {
  const stored = localStorage.getItem(THEME_KEY);
  if (stored === 'dark' || stored === 'light') document.documentElement.dataset.theme = stored;
  else document.documentElement.dataset.theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function toggleTheme() {
  const next = getTheme() === 'dark' ? 'light' : 'dark';
  setTheme(next);
  return next;
}

/** Wire the Settings switch. On is dark, off is light. */
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
  input.addEventListener('change', () => {
    setTheme(input.checked ? 'dark' : 'light');
    sync();
  });
  sync();
}
