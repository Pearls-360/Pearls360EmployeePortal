import '../styles/base.css';
import '../styles/portal.css';
import '../styles/dashboard.css';
import '../styles/shell.css';
import { api } from '../lib/api.js';
import { EMAIL_PATTERN, applyFieldErrors, clearErrorsOnInput, clearFieldErrors, formValues, hideAlert, setBusy, setFieldError, showAlert } from '../lib/forms.js';
import { ACCOUNT_STATUS_LABELS, formatDateTime } from '../lib/format.js';
import { mountShell } from '../lib/shell.js';
import { requirePage, revealPage } from '../lib/session.js';

/**
 * @typedef {{ id: string, email: string, displayName: string, accountStatus: 'active' | 'inactive' | 'pending',
 *   hasPassword: boolean, lastLoginAt: string | null }} AdminAccount
 */

/** @template {Element} T @param {string} sel @param {ParentNode} [root] @returns {T} */
const $ = (sel, root = document) => /** @type {T} */ (root.querySelector(sel));

/** @param {string} tag @param {string} [className] @param {string} [content] */
function el(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
}

/** @param {string} status */
function pill(status) {
  return el('span', `pill pill--${status}`, ACCOUNT_STATUS_LABELS[/** @type {keyof typeof ACCOUNT_STATUS_LABELS} */ (status)] || status);
}

const adminRows = /** @type {HTMLTableSectionElement} */ ($('[data-admin-rows]'));
const adminsEmpty = /** @type {HTMLElement} */ ($('[data-admins-empty]'));
const adminsAlert = /** @type {HTMLElement} */ ($('[data-admins-alert]'));
const count = /** @type {HTMLElement} */ ($('[data-admin-count]'));
const adminDialog = /** @type {HTMLDialogElement} */ ($('#admin-dialog'));
const adminForm = /** @type {HTMLFormElement} */ ($('#admin-form'));
const adminSave = /** @type {HTMLButtonElement} */ ($('[data-admin-save]'));
const adminTitle = /** @type {HTMLElement} */ ($('#admin-dialog-title'));
const adminEyebrow = /** @type {HTMLElement} */ ($('[data-admin-eyebrow]'));
const adminDialogAlert = /** @type {HTMLElement} */ ($('[data-admin-dialog-alert]'));
const adminLinkBox = /** @type {HTMLElement} */ ($('[data-admin-link-box]'));
const adminLinkMessage = /** @type {HTMLElement} */ ($('[data-admin-link-message]'));
const adminLinkInput = /** @type {HTMLInputElement} */ ($('[data-admin-link-input]'));
const adminAccountSection = /** @type {HTMLElement} */ ($('[data-admin-account]'));
const adminAccessButton = /** @type {HTMLButtonElement} */ ($('[data-admin-access]'));
const adminToggleButton = /** @type {HTMLButtonElement} */ ($('[data-admin-toggle]'));

/** @type {string} */
let sessionEmail = '';
/** @type {AdminAccount | null} */
let currentAdmin = null;

async function loadAdmins() {
  try {
    const { admins } = await api('/admin/admins');
    hideAlert(adminsAlert);
    renderAdmins(admins);
  } catch (error) {
    showAlert(adminsAlert, /** @type {Error} */ (error).message);
  }
}

/** @param {AdminAccount[]} admins */
function renderAdmins(admins) {
  adminRows.replaceChildren(
    ...admins.map((account) => {
      const tr = el('tr');
      const nameCell = el('td');
      const label = account.email === sessionEmail ? `${account.displayName} (you)` : account.displayName;
      const name = el('button', 'table__link', label);
      name.setAttribute('type', 'button');
      name.addEventListener('click', () => openAdmin(account));
      nameCell.append(name);
      const status = el('td');
      status.append(pill(account.accountStatus));
      tr.append(nameCell, el('td', '', account.email), status);
      return tr;
    })
  );
  adminsEmpty.hidden = admins.length > 0;
  count.textContent = `${admins.length} ${admins.length === 1 ? 'administrator' : 'administrators'}`;
}

function resetAdminDialog() {
  adminForm.reset();
  clearFieldErrors(adminForm);
  hideAlert(adminDialogAlert);
  adminLinkBox.hidden = true;
  adminLinkInput.value = '';
  currentAdmin = null;
}

function openAdminCreate() {
  resetAdminDialog();
  adminEyebrow.textContent = 'New administrator';
  adminTitle.textContent = 'Add Admin';
  adminForm.hidden = false;
  adminAccountSection.hidden = true;
  adminDialog.showModal();
  /** @type {HTMLInputElement} */ (adminForm.elements.namedItem('firstName')).focus();
}

/** @param {AdminAccount} account */
function fillAdmin(account) {
  currentAdmin = account;
  adminEyebrow.textContent = 'Administrator';
  adminTitle.textContent = account.displayName;
  adminForm.hidden = true;
  $('[data-admin-status]').replaceChildren(pill(account.accountStatus));
  $('[data-admin-login]').textContent = account.lastLoginAt ? formatDateTime(account.lastLoginAt) : 'Never';
  const self = account.email === sessionEmail;
  adminAccessButton.textContent = account.hasPassword ? 'Send Password Reset Link' : 'New Activation Link';
  adminAccessButton.hidden = self || account.accountStatus === 'inactive';
  adminToggleButton.hidden = self;
  adminToggleButton.textContent = account.accountStatus === 'inactive' ? 'Activate Account' : 'Deactivate Account';
  adminAccountSection.hidden = false;
}

/** @param {AdminAccount} account */
function openAdmin(account) {
  resetAdminDialog();
  fillAdmin(account);
  if (!adminDialog.open) adminDialog.showModal();
}

/**
 * @param {{ emailed: boolean, purpose: string, url: string | null, expiresAt: string }} link
 * @param {string} name
 */
function showAdminLink(link, name) {
  const kind = link.purpose === 'activation' ? 'activation' : 'password reset';
  if (link.emailed) {
    adminLinkMessage.textContent = `A one-time ${kind} link has been emailed to ${name}. It expires ${formatDateTime(link.expiresAt)}.`;
    adminLinkInput.parentElement && (adminLinkInput.parentElement.hidden = true);
  } else {
    adminLinkMessage.textContent = `Email delivery is not configured. Share this one-time ${kind} link with ${name} through a trusted channel. It expires ${formatDateTime(link.expiresAt)} and will not be shown again.`;
    adminLinkInput.value = link.url || '';
    adminLinkInput.parentElement && (adminLinkInput.parentElement.hidden = false);
  }
  adminLinkBox.hidden = false;
}

function validateAdminForm() {
  clearFieldErrors(adminForm);
  const v = formValues(adminForm);
  /** @type {Record<string, string>} */
  const errors = {};
  if (!v.firstName) errors.firstName = 'First name is required.';
  if (!v.lastName) errors.lastName = 'Last name is required.';
  if (!v.email) errors.email = 'Email is required.';
  else if (!EMAIL_PATTERN.test(v.email)) errors.email = 'Enter a valid email address.';
  for (const [name, message] of Object.entries(errors)) {
    setFieldError(/** @type {HTMLInputElement} */ (adminForm.elements.namedItem(name)), message);
  }
  const first = Object.keys(errors)[0];
  if (first) /** @type {HTMLInputElement} */ (adminForm.elements.namedItem(first)).focus();
  return first || '';
}

clearErrorsOnInput(adminForm);
adminForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (adminSave.disabled || validateAdminForm()) return;
  hideAlert(adminDialogAlert);
  const values = formValues(adminForm);
  setBusy(adminSave, true, 'Creating…');
  try {
    const { admin: account, accessLink } = await api('/admin/admins', { method: 'POST', body: values });
    setBusy(adminSave, false);
    fillAdmin(account);
    showAdminLink(accessLink, account.displayName);
    loadAdmins();
  } catch (error) {
    setBusy(adminSave, false);
    const err = /** @type {import('../lib/api.js').ApiError} */ (error);
    applyFieldErrors(adminForm, err.fields);
    showAlert(adminDialogAlert, err.message);
  }
});

adminAccessButton.addEventListener('click', async () => {
  if (!currentAdmin) return;
  const verb = currentAdmin.hasPassword ? 'send a password reset link to' : 'issue a new activation link for';
  if (!window.confirm(`Do you want to ${verb} ${currentAdmin.displayName}? Any previous link will stop working.`)) return;
  setBusy(adminAccessButton, true, 'Generating…');
  try {
    const { accessLink } = await api(`/admin/admins/${currentAdmin.id}/access-link`, { method: 'POST', body: {} });
    showAdminLink(accessLink, currentAdmin.displayName);
  } catch (error) {
    showAlert(adminDialogAlert, /** @type {Error} */ (error).message);
  } finally {
    setBusy(adminAccessButton, false);
  }
});

adminToggleButton.addEventListener('click', async () => {
  if (!currentAdmin) return;
  const deactivate = currentAdmin.accountStatus !== 'inactive';
  const question = deactivate
    ? `Deactivate ${currentAdmin.displayName}? They will be signed out immediately and will lose admin access.`
    : `Reactivate ${currentAdmin.displayName}'s account?`;
  if (!window.confirm(question)) return;
  setBusy(adminToggleButton, true, deactivate ? 'Deactivating…' : 'Activating…');
  try {
    const { admin: account } = await api(`/admin/admins/${currentAdmin.id}/status`, { method: 'POST', body: { status: deactivate ? 'inactive' : 'active' } });
    setBusy(adminToggleButton, false);
    fillAdmin(account);
    adminLinkBox.hidden = true;
    showAlert(adminDialogAlert, deactivate ? 'Administrator deactivated and signed out everywhere.' : 'Administrator reactivated.', 'success');
    loadAdmins();
  } catch (error) {
    setBusy(adminToggleButton, false);
    showAlert(adminDialogAlert, /** @type {Error} */ (error).message);
  }
});

$('[data-admin-copy]').addEventListener('click', async (event) => {
  const button = /** @type {HTMLButtonElement} */ (event.currentTarget);
  try {
    await navigator.clipboard.writeText(adminLinkInput.value);
    button.textContent = 'Copied';
  } catch {
    adminLinkInput.select();
    button.textContent = 'Press ⌘/Ctrl+C';
  }
  setTimeout(() => { button.textContent = 'Copy'; }, 2000);
});

document.querySelectorAll('[data-admin-close]').forEach((b) => b.addEventListener('click', () => adminDialog.close()));
adminDialog.addEventListener('click', (event) => {
  if (event.target === adminDialog) adminDialog.close();
});
adminDialog.addEventListener('close', () => {
  adminLinkInput.value = '';
  adminLinkBox.hidden = true;
});
$('[data-add-admin]').addEventListener('click', openAdminCreate);

async function init() {
  const user = await requirePage({ role: 'admin' });
  if (!user) return;
  sessionEmail = user.email;
  mountShell({ role: 'admin', active: 'admins', title: 'Admins', user });
  revealPage();
  await loadAdmins();
  if (new URLSearchParams(window.location.search).get('add') === '1') {
    openAdminCreate();
    window.history.replaceState({}, '', '/admin/admins');
  }
}

init();
