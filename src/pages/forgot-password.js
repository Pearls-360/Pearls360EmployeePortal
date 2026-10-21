import '../styles/base.css';
import '../styles/portal.css';
import { api } from '../lib/api.js';
import { EMAIL_PATTERN, applyFieldErrors, hideAlert, setBusy, setFieldError, showAlert } from '../lib/forms.js';
import { markReady } from '../lib/page.js';

const form = /** @type {HTMLFormElement} */ (document.getElementById('forgot-form'));
const email = /** @type {HTMLInputElement} */ (form.elements.namedItem('email'));
const submit = /** @type {HTMLButtonElement} */ (form.querySelector('button[type="submit"]'));
const alertBox = /** @type {HTMLElement} */ (form.querySelector('[data-alert]'));

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (submit.disabled) return;
  hideAlert(alertBox);
  const value = email.value.trim();
  const problem = !value ? 'Please enter your email address.' : EMAIL_PATTERN.test(value) ? '' : 'Please enter a valid email address.';
  setFieldError(email, problem);
  if (problem) {
    email.focus();
    return;
  }

  setBusy(submit, true, 'Sending…');
  try {
    const result = await api('/auth/forgot-password', { method: 'POST', body: { email: value }, redirectOnAuthError: false });
    showAlert(alertBox, result.message, 'success');
    email.readOnly = true;
    submit.hidden = true;
  } catch (error) {
    setBusy(submit, false);
    const err = /** @type {import('../lib/api.js').ApiError} */ (error);
    if (!applyFieldErrors(form, err.fields)) showAlert(alertBox, err.message);
  }
});

markReady();
