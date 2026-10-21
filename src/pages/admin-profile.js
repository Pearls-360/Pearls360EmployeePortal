import '../styles/base.css';
import '../styles/portal.css';
import '../styles/dashboard.css';
import '../styles/shell.css';
import { api } from '../lib/api.js';
import { prepareAvatar } from '../lib/avatar.js';
import { applyFieldErrors, clearErrorsOnInput, clearFieldErrors, hideAlert, setBusy, showAlert } from '../lib/forms.js';
import { formatDateTime } from '../lib/format.js';
import { mountShell } from '../lib/shell.js';
import { requirePage, revealPage } from '../lib/session.js';

/** @template {Element} T @param {string} sel @returns {T} */
const $ = (sel) => /** @type {T} */ (document.querySelector(sel));

const form = /** @type {HTMLFormElement} */ ($('#profile-form'));
const formAlert = /** @type {HTMLElement} */ ($('[data-form-alert]'));
const pageAlert = /** @type {HTMLElement} */ ($('[data-page-alert]'));
const avatarInput = /** @type {HTMLInputElement} */ ($('[data-avatar-input]'));
const avatarImg = /** @type {HTMLImageElement} */ ($('[data-avatar-img]'));
const avatarInitial = /** @type {HTMLElement} */ ($('[data-avatar-initial]'));
const removeAvatar = /** @type {HTMLButtonElement} */ ($('[data-remove-avatar]'));
const displayNameInput = /** @type {HTMLInputElement} */ ($('#displayName'));
const emailInput = /** @type {HTMLInputElement} */ ($('#email'));

/** @type {{ email: string, displayName: string | null, hasAvatar: boolean, avatarUrl: string | null, lastLoginAt: string | null } | null} */
let profile = null;
/** @type {string | null} */
let pendingAvatar = null;
let clearAvatar = false;

/** @param {typeof profile} data */
function render(data) {
  if (!data) return;
  profile = data;
  const name = data.displayName || data.email.split('@')[0];
  $('[data-profile-name]').textContent = name;
  $('[data-profile-email]').textContent = data.email;
  $('[data-last-login]').textContent = data.lastLoginAt ? `Last sign-in · ${formatDateTime(data.lastLoginAt)}` : 'Last sign-in · Never';
  displayNameInput.value = data.displayName || '';
  emailInput.value = data.email;
  avatarInitial.textContent = (name[0] || 'A').toUpperCase();

  if (pendingAvatar) {
    avatarImg.src = pendingAvatar;
    avatarImg.hidden = false;
    avatarInitial.hidden = true;
    removeAvatar.hidden = false;
  } else if (data.hasAvatar && data.avatarUrl && !clearAvatar) {
    avatarImg.src = data.avatarUrl;
    avatarImg.hidden = false;
    avatarInitial.hidden = true;
    removeAvatar.hidden = false;
  } else {
    avatarImg.removeAttribute('src');
    avatarImg.hidden = true;
    avatarInitial.hidden = false;
    removeAvatar.hidden = true;
  }
}

avatarInput.addEventListener('change', async () => {
  const file = avatarInput.files?.[0];
  avatarInput.value = '';
  if (!file) return;
  hideAlert(pageAlert);
  try {
    pendingAvatar = await prepareAvatar(file);
    clearAvatar = false;
    render(profile);
  } catch (error) {
    showAlert(pageAlert, /** @type {Error} */ (error).message);
  }
});

removeAvatar.addEventListener('click', () => {
  pendingAvatar = null;
  clearAvatar = true;
  render(profile);
});

clearErrorsOnInput(form);
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = /** @type {HTMLButtonElement} */ ($('[data-save]'));
  if (button.disabled) return;
  clearFieldErrors(form);
  hideAlert(formAlert);
  hideAlert(pageAlert);

  /** @type {Record<string, unknown>} */
  const body = { displayName: displayNameInput.value.trim() };
  if (pendingAvatar) body.avatar = pendingAvatar;
  else if (clearAvatar) body.clearAvatar = true;

  setBusy(button, true, 'Saving…');
  try {
    const result = await api('/auth/profile', { method: 'PATCH', body });
    pendingAvatar = null;
    clearAvatar = false;
    render(result.profile);
    showAlert(formAlert, 'Profile updated.', 'success');
  } catch (error) {
    const err = /** @type {import('../lib/api.js').ApiError} */ (error);
    if (!applyFieldErrors(form, err.fields)) showAlert(pageAlert, err.message);
  } finally {
    setBusy(button, false);
  }
});

async function init() {
  const user = await requirePage({ role: 'admin' });
  if (!user) return;
  mountShell({ role: 'admin', active: 'profile', title: 'My Profile', user });
  try {
    const { profile: data } = await api('/auth/profile');
    render(data);
  } catch (error) {
    showAlert(pageAlert, /** @type {Error} */ (error).message);
  }
  revealPage();
}

init();
