import '../styles/base.css';
import '../styles/portal.css';
import '../styles/dashboard.css';
import '../styles/shell.css';
import { api } from '../lib/api.js';
import { prepareAvatar } from '../lib/avatar.js';
import { applyFieldErrors, clearErrorsOnInput, clearFieldErrors, formValues, hideAlert, setBusy, setFieldError, showAlert } from '../lib/forms.js';
import { EMPLOYMENT_STATUS_LABELS, formatDate } from '../lib/format.js';
import { mountShell } from '../lib/shell.js';
import { requirePage, revealPage } from '../lib/session.js';

/**
 * @typedef {{ email: string, firstName: string, lastName: string, phone: string | null, employeeCode: string,
 *   department: string, designation: string, joiningDate: string, employmentStatus: string,
 *   hasAvatar: boolean, avatarUrl: string | null }} Profile
 */

/** @template {Element} T @param {string} sel @returns {T} */
const $ = (sel) => /** @type {T} */ (document.querySelector(sel));

const form = /** @type {HTMLFormElement} */ ($('#profile-form'));
const formAlert = /** @type {HTMLElement} */ ($('[data-form-alert]'));
const pageAlert = /** @type {HTMLElement} */ ($('[data-page-alert]'));
const avatarInput = /** @type {HTMLInputElement} */ ($('[data-avatar-input]'));
const avatarImg = /** @type {HTMLImageElement} */ ($('[data-avatar-img]'));
const avatarInitial = /** @type {HTMLElement} */ ($('[data-avatar-initial]'));
const removeAvatar = /** @type {HTMLButtonElement} */ ($('[data-remove-avatar]'));

/** @type {Profile | null} */
let profile = null;
/** @type {string | null} */
let pendingAvatar = null;
let clearAvatar = false;

/** @param {Profile} data */
function render(data) {
  profile = data;
  const name = `${data.firstName} ${data.lastName}`;
  $('[data-profile-name]').textContent = name;
  $('[data-profile-email]').textContent = data.email;
  $('[data-profile-role]').textContent = `${data.designation} · ${data.department}`;
  $('[data-profile-code]').textContent = `ID · ${data.employeeCode}`;
  /** @type {HTMLInputElement} */ ($('#firstName')).value = data.firstName;
  /** @type {HTMLInputElement} */ ($('#lastName')).value = data.lastName;
  /** @type {HTMLInputElement} */ ($('#phone')).value = data.phone || '';
  /** @type {HTMLInputElement} */ ($('#email')).value = data.email;
  avatarInitial.textContent = (data.firstName[0] || 'E').toUpperCase();

  /** @type {Record<string, string>} */
  const values = {
    employeeCode: data.employeeCode,
    department: data.department,
    designation: data.designation,
    joiningDate: formatDate(data.joiningDate),
    employmentStatus: EMPLOYMENT_STATUS_LABELS[/** @type {keyof typeof EMPLOYMENT_STATUS_LABELS} */ (data.employmentStatus)] || data.employmentStatus
  };
  for (const [key, value] of Object.entries(values)) $(`[data-field="${key}"]`).textContent = value;

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
    if (profile) render(profile);
  } catch (error) {
    showAlert(pageAlert, /** @type {Error} */ (error).message);
  }
});

removeAvatar.addEventListener('click', () => {
  pendingAvatar = null;
  clearAvatar = true;
  if (profile) render(profile);
});

clearErrorsOnInput(form);
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = /** @type {HTMLButtonElement} */ ($('[data-save]'));
  if (button.disabled || !profile) return;
  clearFieldErrors(form);
  hideAlert(formAlert);
  hideAlert(pageAlert);

  const values = formValues(form);
  if (!values.firstName) {
    setFieldError(/** @type {HTMLInputElement} */ ($('#firstName')), 'First name is required.');
    return;
  }
  if (!values.lastName) {
    setFieldError(/** @type {HTMLInputElement} */ ($('#lastName')), 'Last name is required.');
    return;
  }
  if (values.phone && !/^\+?[0-9 ()-]{7,20}$/.test(values.phone)) {
    setFieldError(/** @type {HTMLInputElement} */ ($('#phone')), 'Enter a valid phone number.');
    return;
  }

  /** @type {Record<string, unknown>} */
  const body = {
    firstName: values.firstName,
    lastName: values.lastName,
    phone: values.phone
  };
  if (pendingAvatar) body.avatar = pendingAvatar;
  else if (clearAvatar) body.clearAvatar = true;

  setBusy(button, true, 'Saving…');
  try {
    const result = await api('/employee/profile', { method: 'PATCH', body });
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
  const user = await requirePage({ role: 'employee' });
  if (!user) return;
  mountShell({ role: 'employee', active: 'profile', title: 'My Profile', user });
  try {
    const { profile: data } = await api('/employee/profile');
    render(data);
  } catch (error) {
    showAlert(pageAlert, /** @type {Error} */ (error).message);
  }
  revealPage();
}

init();
