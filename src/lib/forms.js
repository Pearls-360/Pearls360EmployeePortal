export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const PASSWORD_MIN_LENGTH = 12;

/**
 * @param {HTMLInputElement | HTMLSelectElement} input
 * @param {string} message empty string clears the error
 */
export function setFieldError(input, message) {
  const field = input.closest('.field');
  field?.classList.toggle('is-invalid', Boolean(message));
  input.setAttribute('aria-invalid', message ? 'true' : 'false');
  let error = field?.querySelector('.field__error');
  if (!error && field && message) {
    error = document.createElement('p');
    error.className = 'field__error';
    error.id = `${input.id}-error`;
    error.setAttribute('aria-live', 'polite');
    field.appendChild(error);
    const describedBy = new Set((input.getAttribute('aria-describedby') || '').split(' ').filter(Boolean));
    describedBy.add(error.id);
    input.setAttribute('aria-describedby', [...describedBy].join(' '));
  }
  if (error) error.textContent = message;
}

/** @param {HTMLFormElement} form */
export function clearFieldErrors(form) {
  form.querySelectorAll('input, select, textarea').forEach((el) => setFieldError(/** @type {HTMLInputElement} */ (el), ''));
}

/** Clears a field's error as soon as the user edits it. @param {HTMLFormElement} form */
export function clearErrorsOnInput(form) {
  const clear = (/** @type {Event} */ event) => {
    const input = /** @type {HTMLInputElement} */ (event.target);
    if (input.closest('.field')?.classList.contains('is-invalid')) setFieldError(input, '');
  };
  form.addEventListener('input', clear);
  form.addEventListener('change', clear);
}

/**
 * Applies server-side field errors (keys = input `name`). Returns true if any matched.
 * @param {HTMLFormElement} form
 * @param {Record<string, string> | undefined} fields
 */
export function applyFieldErrors(form, fields) {
  if (!fields) return false;
  /** @type {HTMLInputElement | null} */
  let first = null;
  for (const [name, message] of Object.entries(fields)) {
    const input = /** @type {HTMLInputElement | null} */ (form.elements.namedItem(name));
    if (!input || !('focus' in input)) continue;
    setFieldError(input, message);
    if (!first) first = input;
  }
  if (!first) return false;
  first.focus();
  return true;
}

/**
 * @param {HTMLElement} box  `.form__alert` element containing `[data-alert-text]`
 * @param {string} message
 * @param {'error' | 'info' | 'success'} [tone]
 */
export function showAlert(box, message, tone = 'error') {
  const text = box.querySelector('[data-alert-text]') || box;
  text.textContent = message;
  box.classList.toggle('form__alert--info', tone === 'info');
  box.classList.toggle('form__alert--success', tone === 'success');
  box.setAttribute('role', tone === 'error' ? 'alert' : 'status');
  box.hidden = false;
}

/** @param {HTMLElement} box */
export function hideAlert(box) {
  box.hidden = true;
}

/**
 * Busy state for a submit button; also blocks duplicate submissions.
 * @param {HTMLButtonElement} button
 * @param {boolean} busy
 * @param {string} [busyLabel]
 */
export function setBusy(button, busy, busyLabel = 'Saving…') {
  if (busy) {
    button.dataset.label = button.textContent?.trim() || '';
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    button.innerHTML = '<span class="spinner" aria-hidden="true"></span>';
    button.append(busyLabel);
  } else {
    button.disabled = false;
    button.removeAttribute('aria-busy');
    button.textContent = button.dataset.label || button.textContent;
  }
}

/** Show/hide toggles for every `.field__toggle` inside `root`. @param {ParentNode} root */
export function bindPasswordToggles(root = document) {
  root.querySelectorAll('.field__toggle').forEach((el) => {
    const toggle = /** @type {HTMLButtonElement} */ (el);
    const input = /** @type {HTMLInputElement | null} */ (document.getElementById(toggle.getAttribute('aria-controls') || ''));
    if (!input) return;
    toggle.addEventListener('click', () => {
      const reveal = input.type === 'password';
      input.type = reveal ? 'text' : 'password';
      toggle.setAttribute('aria-pressed', String(reveal));
      toggle.setAttribute('aria-label', reveal ? 'Hide password' : 'Show password');
    });
  });
}

/**
 * Client-side mirror of the server password policy (the server is authoritative).
 * @param {string} password
 * @param {string} [email]
 */
export function passwordProblem(password, email) {
  if (!password) return 'Please enter a password.';
  if (password.length < PASSWORD_MIN_LENGTH) return `Use at least ${PASSWORD_MIN_LENGTH} characters.`;
  if (password.length > 128) return 'Use at most 128 characters.';
  if (/^\s|\s$/.test(password)) return 'The password cannot start or end with a space.';
  if (new Set(password).size < 5) return 'Choose a less repetitive password.';
  const local = (email || '').split('@')[0].toLowerCase();
  if (local.length >= 4 && password.toLowerCase().includes(local)) return 'The password cannot contain your email name.';
  return '';
}

/** @param {HTMLFormElement} form */
export function formValues(form) {
  /** @type {Record<string, string>} */
  const out = {};
  new FormData(form).forEach((value, key) => {
    out[key] = String(value).trim();
  });
  return out;
}
