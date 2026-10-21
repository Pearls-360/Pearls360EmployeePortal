import { api } from './api.js';
import { applyFieldErrors, bindPasswordToggles, clearFieldErrors, hideAlert, passwordProblem, setBusy, setFieldError, showAlert } from './forms.js';

/**
 * Wires a form with currentPassword / newPassword / confirmPassword inputs.
 * @param {HTMLFormElement} form
 * @param {{ email: string, onSuccess: (result: { redirectTo: string }) => void }} opts
 */
export function bindChangePasswordForm(form, { email, onSuccess }) {
  const current = /** @type {HTMLInputElement} */ (form.elements.namedItem('currentPassword'));
  const next = /** @type {HTMLInputElement} */ (form.elements.namedItem('newPassword'));
  const confirm = /** @type {HTMLInputElement} */ (form.elements.namedItem('confirmPassword'));
  const submit = /** @type {HTMLButtonElement} */ (form.querySelector('button[type="submit"]'));
  const alertBox = /** @type {HTMLElement} */ (form.querySelector('[data-alert]'));
  const username = /** @type {HTMLInputElement | null} */ (form.querySelector('[data-username]'));
  if (username) username.value = email;

  bindPasswordToggles(form);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (submit.disabled) return;
    hideAlert(alertBox);
    clearFieldErrors(form);

    const errors = {
      currentPassword: current.value ? '' : 'Please enter your current password.',
      newPassword: passwordProblem(next.value, email) || (next.value && next.value === current.value ? 'Choose a password different from your current one.' : ''),
      confirmPassword: confirm.value === next.value ? '' : 'Passwords do not match.'
    };
    let first = null;
    for (const [name, message] of Object.entries(errors)) {
      const input = /** @type {HTMLInputElement} */ (form.elements.namedItem(name));
      setFieldError(input, message);
      if (message && !first) first = input;
    }
    if (first) {
      first.focus();
      return;
    }

    setBusy(submit, true, 'Updating…');
    try {
      const result = await api('/auth/change-password', {
        method: 'POST',
        body: { currentPassword: current.value, newPassword: next.value },
        redirectOnAuthError: true
      });
      form.reset();
      setBusy(submit, false);
      onSuccess(result);
    } catch (error) {
      setBusy(submit, false);
      const err = /** @type {import('./api.js').ApiError} */ (error);
      if (!applyFieldErrors(form, err.fields)) {
        showAlert(alertBox, err.message);
        alertBox.focus();
      }
    }
  });
}
