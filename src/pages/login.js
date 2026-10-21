import '../styles/base.css';
import '../styles/portal.css';
import { api } from '../lib/api.js';
import { EMAIL_PATTERN, bindPasswordToggles, hideAlert, setFieldError, showAlert } from '../lib/forms.js';
import { markReady } from '../lib/page.js';
import { fetchSession } from '../lib/session.js';

/** @template {Element} T @param {string} selector @returns {T} */
function $(selector) {
  const el = document.querySelector(selector);
  if (!el) throw new Error(`Missing element: ${selector}`);
  return /** @type {T} */ (el);
}

const form = /** @type {HTMLFormElement} */ ($('#login-form'));
const emailInput = /** @type {HTMLInputElement} */ ($('#email'));
const passwordInput = /** @type {HTMLInputElement} */ ($('#password'));
const submit = /** @type {HTMLButtonElement} */ ($('[data-submit]'));
const submitLabel = /** @type {HTMLElement} */ ($('[data-submit-label]'));
const alertBox = /** @type {HTMLElement} */ ($('#form-alert'));

let submitting = false;
let attempted = false;

/** @param {HTMLInputElement} input */
function validate(input) {
  const value = input.value.trim();
  if (input === emailInput) {
    if (!value) return 'Please enter your email address.';
    if (!EMAIL_PATTERN.test(value)) return 'Please enter a valid email address, e.g. name@company.com.';
    return '';
  }
  if (!input.value) return 'Please enter your password.';
  return '';
}

/** @param {boolean} busy */
function setBusy(busy) {
  submitting = busy;
  submit.disabled = busy;
  submit.setAttribute('aria-busy', String(busy));
  form.setAttribute('aria-busy', String(busy));
  emailInput.readOnly = busy;
  passwordInput.readOnly = busy;
  submit.querySelector('.spinner')?.remove();
  if (busy) {
    const spinner = document.createElement('span');
    spinner.className = 'spinner';
    spinner.setAttribute('aria-hidden', 'true');
    submit.prepend(spinner);
  }
  submitLabel.textContent = busy ? 'Signing in…' : 'Sign In';
}

bindPasswordToggles(form);

for (const input of [emailInput, passwordInput]) {
  input.addEventListener('input', () => {
    if (attempted || input.getAttribute('aria-invalid') === 'true') setFieldError(input, validate(input));
  });
  input.addEventListener('blur', () => {
    if (attempted && input.value) setFieldError(input, validate(input));
  });
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (submitting) return;
  attempted = true;
  hideAlert(alertBox);

  const emailError = validate(emailInput);
  const passwordError = validate(passwordInput);
  setFieldError(emailInput, emailError);
  setFieldError(passwordInput, passwordError);
  if (emailError || passwordError) {
    (emailError ? emailInput : passwordInput).focus();
    return;
  }

  setBusy(true);
  try {
    const result = await api('/auth/login', {
      method: 'POST',
      body: { email: emailInput.value.trim(), password: passwordInput.value },
      redirectOnAuthError: false
    });
    submitLabel.textContent = 'Signed in';
    window.location.replace(result.redirectTo);
  } catch (error) {
    setBusy(false);
    passwordInput.value = '';
    showAlert(alertBox, /** @type {Error} */ (error).message);
    alertBox.focus();
  }
});

async function init() {
  const session = await fetchSession();
  if (session) {
    window.location.replace(session.home);
    return;
  }
  markReady();
}

init();
