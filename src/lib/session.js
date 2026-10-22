import { api } from './api.js';
import { applyTheme } from './theme.js';

/**
 * @typedef {{ email: string, role: 'admin' | 'employee', mustChangePassword: boolean, firstName: string | null,
 *   displayName?: string | null, hasAvatar?: boolean, avatarUrl?: string | null, theme?: 'light' | 'dark', timezone?: string }} CurrentUser
 */

/** @returns {Promise<{ user: CurrentUser, home: string } | null>} */
export async function fetchSession() {
  try {
    return await api('/auth/session', { redirectOnAuthError: false });
  } catch {
    return null;
  }
}

/**
 * Page guard: sends the visitor to the right place before showing a protected
 * page. This only decides what the browser renders — every API call is
 * authorized again on the server.
 * @param {{ role?: 'admin' | 'employee' }} opts
 * @returns {Promise<CurrentUser | null>}
 */
export async function requirePage({ role } = {}) {
  const session = await fetchSession();
  if (!session) {
    window.location.replace('/auth/login');
    return null;
  }
  const { user, home } = session;
  if (role && user.role !== role) {
    window.location.replace(home);
    return null;
  }
  if (user.theme === 'dark' || user.theme === 'light') applyTheme(user.theme);
  return user;
}

export async function signOut() {
  try {
    await api('/auth/logout', { method: 'POST', body: {}, redirectOnAuthError: false });
  } finally {
    window.location.replace('/auth/login');
  }
}

/** Wires every `[data-sign-out]` button on the page. */
export function bindSignOut() {
  document.querySelectorAll('[data-sign-out]').forEach((el) => {
    const button = /** @type {HTMLButtonElement} */ (el);
    button.addEventListener('click', () => {
      document.querySelectorAll('[data-sign-out]').forEach((b) => {
        /** @type {HTMLButtonElement} */ (b).disabled = true;
      });
      button.textContent = 'Signing out…';
      signOut();
    });
  });
}

/** Reveals a guarded page once the session check has passed. */
export function revealPage() {
  document.body.removeAttribute('data-auth');
  requestAnimationFrame(() => document.body.classList.add('is-ready'));
}
