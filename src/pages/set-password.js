import '../styles/base.css';
import '../styles/portal.css';
import { api } from '../lib/api.js';
import { applyFieldErrors, bindPasswordToggles, clearFieldErrors, passwordProblem, setBusy, setFieldError, showAlert } from '../lib/forms.js';
import { markReady } from '../lib/page.js';

const form = /** @type {HTMLFormElement} */ (document.getElementById('set-password-form'));
const password = /** @type {HTMLInputElement} */ (form.elements.namedItem('password'));
const confirm = /** @type {HTMLInputElement} */ (form.elements.namedItem('confirm'));
const submit = /** @type {HTMLButtonElement} */ (form.querySelector('button[type="submit"]'));
const alertBox = /** @type {HTMLElement} */ (document.querySelector('[data-alert]'));
const title = /** @type {HTMLElement} */ (document.querySelector('[data-title]'));
const account = /** @type {HTMLElement} */ (document.querySelector('[data-account]'));
const toLogin = /** @type {HTMLElement} */ (document.querySelector('[data-to-login]'));

// The token arrives in the URL fragment (never sent to the server in the URL).
// Read it once, then remove it from the address bar and browser history.
const token = new URLSearchParams(window.location.hash.slice(1)).get('token') || '';
history.replaceState(null, '', window.location.pathname);

let email = '';

/** @param {string} message */
function showInvalid(message) {
  form.hidden = true;
  showAlert(alertBox, message);
  toLogin.hidden = false;
}

bindPasswordToggles(form);

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (submit.disabled) return;
  clearFieldErrors(form);
  const problem = passwordProblem(password.value, email);
  const mismatch = confirm.value === password.value ? '' : 'Passwords do not match.';
  setFieldError(password, problem);
  setFieldError(confirm, mismatch);
  if (problem || mismatch) {
    (problem ? password : confirm).focus();
    return;
  }

  setBusy(submit, true, 'Saving…');
  try {
    await api('/auth/set-password', { method: 'POST', body: { token, password: password.value }, redirectOnAuthError: false });
    setBusy(submit, false);
    form.hidden = true;
    showAlert(alertBox, 'Your password has been saved. You can now sign in.', 'success', { persist: true });
    toLogin.hidden = false;
    toLogin.focus();
  } catch (error) {
    setBusy(submit, false);
    const err = /** @type {import('../lib/api.js').ApiError} */ (error);
    if (err.code === 'TOKEN_INVALID') showInvalid(err.message);
    else if (!applyFieldErrors(form, err.fields)) showAlert(alertBox, err.message);
  }
});

async function init() {
  if (!token) {
    showInvalid('This link is incomplete. Please open the full link from your email or ask your administrator for a new one.');
    markReady();
    return;
  }
  try {
    const info = await api('/auth/token-info', { method: 'POST', body: { token }, redirectOnAuthError: false });
    email = info.email;
    title.textContent = info.purpose === 'activation' ? 'Activate Account' : 'Reset Password';
    account.textContent = info.email;
    account.hidden = false;
    /** @type {HTMLInputElement} */ (form.querySelector('[data-username]')).value = info.email;
    form.hidden = false;
  } catch (error) {
    showInvalid(/** @type {Error} */ (error).message);
  }
  markReady();
}

init();
