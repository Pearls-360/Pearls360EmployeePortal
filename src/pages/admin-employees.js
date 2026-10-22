import '../styles/base.css';
import '../styles/portal.css';
import '../styles/dashboard.css';
import '../styles/shell.css';
import { api } from '../lib/api.js';
import { EMAIL_PATTERN, applyFieldErrors, clearErrorsOnInput, clearFieldErrors, confirmAction, formValues, hideAlert, setBusy, setFieldError, showAlert } from '../lib/forms.js';
import { ACCOUNT_STATUS_LABELS, auditLabel, formatDateTime } from '../lib/format.js';
import { mountShell } from '../lib/shell.js';
import { requirePage, revealPage } from '../lib/session.js';

/**
 * @typedef {{ id: string, email: string, accountStatus: 'active' | 'inactive' | 'pending', hasPassword: boolean,
 *   employeeCode: string, firstName: string, lastName: string, phone: string | null, department: string,
 *   designation: string, joiningDate: string, employmentStatus: string, lastLoginAt: string | null }} Employee
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

const rows = /** @type {HTMLTableSectionElement} */ ($('[data-rows]'));
const empty = /** @type {HTMLElement} */ ($('[data-empty]'));
const count = /** @type {HTMLElement} */ ($('[data-directory-count]'));
const search = /** @type {HTMLInputElement} */ ($('#search'));
const statusFilter = /** @type {HTMLSelectElement} */ ($('#status-filter'));
const directoryAlert = /** @type {HTMLElement} */ ($('[data-directory-alert]'));

let listRequest = 0;
async function loadEmployees() {
  const id = ++listRequest;
  const params = new URLSearchParams();
  if (search.value.trim()) params.set('q', search.value.trim());
  if (statusFilter.value) params.set('status', statusFilter.value);
  try {
    const { employees } = await api(`/admin/employees?${params}`);
    if (id !== listRequest) return;
    hideAlert(directoryAlert);
    renderEmployees(employees);
  } catch (error) {
    showAlert(directoryAlert, /** @type {Error} */ (error).message);
  }
}

/** @param {Employee[]} employees */
function renderEmployees(employees) {
  rows.replaceChildren(
    ...employees.map((e) => {
      const tr = el('tr');
      const nameCell = el('td');
      nameCell.append(el('span', 'table__name', `${e.firstName} ${e.lastName}`), el('span', 'table__sub', e.email));
      const viewCell = el('td', 'table__actions');
      const view = el('button', 'btn btn--ghost btn--sm', 'View');
      view.type = 'button';
      view.addEventListener('click', () => openEmployee(e.id));
      viewCell.append(view);
      tr.append(nameCell, el('td', 'table__code', e.employeeCode), viewCell);
      return tr;
    })
  );
  empty.hidden = employees.length > 0;
  empty.textContent = search.value || statusFilter.value ? 'No employees match your search.' : 'No employees yet. Use “Add Employee” to create the first account.';
  count.textContent = `${employees.length} ${employees.length === 1 ? 'employee' : 'employees'}`;
}

let searchTimer = 0;
search.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = window.setTimeout(loadEmployees, 250);
});
statusFilter.addEventListener('change', loadEmployees);

/** @param {HTMLUListElement} list @param {Array<{ action: string, at: string, actor: string | null, targetName?: string | null }>} entries */
function renderActivity(list, entries) {
  if (!entries.length) {
    list.replaceChildren(el('li', 'empty', 'No activity recorded yet.'));
    return;
  }
  list.replaceChildren(
    ...entries.map((entry) => {
      const li = el('li');
      const what = auditLabel(entry.action) + (entry.targetName ? ` · ${entry.targetName}` : '');
      li.append(el('span', 'activity__what', what), el('span', 'activity__who', entry.actor || 'System'), el('span', 'activity__when', formatDateTime(entry.at)));
      return li;
    })
  );
}

function refreshAll() {
  return loadEmployees();
}

// ---------------------------------------------------------------- Employee drawer
const dialog = /** @type {HTMLDialogElement} */ ($('#employee-dialog'));
const form = /** @type {HTMLFormElement} */ ($('#employee-form'));
const saveButton = /** @type {HTMLButtonElement} */ ($('[data-save]'));
const dialogTitle = /** @type {HTMLElement} */ ($('#dialog-title'));
const dialogEyebrow = /** @type {HTMLElement} */ ($('[data-dialog-eyebrow]'));
const dialogAlert = /** @type {HTMLElement} */ ($('[data-dialog-alert]'));
const linkBox = /** @type {HTMLElement} */ ($('[data-link-box]'));
const linkMessage = /** @type {HTMLElement} */ ($('[data-link-message]'));
const linkInput = /** @type {HTMLInputElement} */ ($('[data-link-input]'));
const accountSection = /** @type {HTMLElement} */ ($('[data-account-section]'));
const historySection = /** @type {HTMLElement} */ ($('[data-history-section]'));
const historyList = /** @type {HTMLUListElement} */ ($('[data-history]'));
const accessLinkButton = /** @type {HTMLButtonElement} */ ($('[data-access-link]'));
const toggleStatusButton = /** @type {HTMLButtonElement} */ ($('[data-toggle-status]'));
const deleteButton = /** @type {HTMLButtonElement} */ ($('[data-delete-employee]'));

/** @type {Employee | null} */
let current = null;
const FIELDS = ['firstName', 'lastName', 'email', 'phone', 'employeeCode', 'joiningDate', 'department', 'designation', 'employmentStatus'];

function resetDialog() {
  form.reset();
  clearFieldErrors(form);
  hideAlert(dialogAlert);
  linkBox.hidden = true;
  linkInput.value = '';
}

function openCreate() {
  current = null;
  resetDialog();
  dialogEyebrow.textContent = 'New account';
  dialogTitle.textContent = 'Add Employee';
  saveButton.textContent = 'Create Employee';
  accountSection.hidden = true;
  historySection.hidden = true;
  /** @type {HTMLInputElement} */ (form.elements.namedItem('joiningDate')).value = new Date().toISOString().slice(0, 10);
  dialog.showModal();
  /** @type {HTMLInputElement} */ (form.elements.namedItem('firstName')).focus();
}

/** @param {Employee} employee */
function fillEmployee(employee) {
  current = employee;
  dialogEyebrow.textContent = employee.employeeCode;
  dialogTitle.textContent = `${employee.firstName} ${employee.lastName}`;
  saveButton.textContent = 'Save Changes';
  for (const name of FIELDS) {
    const input = /** @type {HTMLInputElement} */ (form.elements.namedItem(name));
    input.value = /** @type {any} */ (employee)[name] ?? '';
  }
  $('[data-account-status]').replaceChildren(pill(employee.accountStatus));
  $('[data-last-login]').textContent = employee.lastLoginAt ? formatDateTime(employee.lastLoginAt) : 'Never';
  accessLinkButton.textContent = employee.hasPassword ? 'Send Password Reset Link' : 'New Activation Link';
  accessLinkButton.hidden = employee.accountStatus === 'inactive';
  toggleStatusButton.textContent = employee.accountStatus === 'inactive' ? 'Activate Account' : 'Deactivate Account';
  accountSection.hidden = false;
}

/** @param {string} id */
async function openEmployee(id) {
  resetDialog();
  try {
    const { employee, activity: entries } = await api(`/admin/employees/${encodeURIComponent(id)}`);
    fillEmployee(employee);
    renderActivity(historyList, entries);
    historySection.hidden = false;
    if (!dialog.open) dialog.showModal();
  } catch (error) {
    showAlert(directoryAlert, /** @type {Error} */ (error).message);
  }
}

/**
 * @param {{ box: HTMLElement, message: HTMLElement, input: HTMLInputElement }} target
 * @param {{ emailed: boolean, purpose: string, url: string | null, expiresAt: string }} link
 * @param {string} who
 */
function revealLink(target, link, who) {
  const kind = link.purpose === 'activation' ? 'activation' : 'password reset';
  if (link.emailed) {
    target.message.textContent = `A one-time ${kind} link has been emailed to ${who}. It expires ${formatDateTime(link.expiresAt)}.`;
    target.input.parentElement && (target.input.parentElement.hidden = true);
  } else {
    target.message.textContent = `Email delivery is not configured. Share this one-time ${kind} link with ${who} through a trusted channel. It expires ${formatDateTime(link.expiresAt)} and will not be shown again.`;
    target.input.value = link.url || '';
    target.input.parentElement && (target.input.parentElement.hidden = false);
  }
  target.box.hidden = false;
  target.box.scrollIntoView({ block: 'nearest' });
}

/** @param {{ emailed: boolean, purpose: string, url: string | null, expiresAt: string }} link */
function showAccessLink(link) {
  revealLink({ box: linkBox, message: linkMessage, input: linkInput }, link, 'the employee');
}

/** @returns {string} first client-side error */
function validateForm() {
  clearFieldErrors(form);
  const v = formValues(form);
  /** @type {Record<string, string>} */
  const errors = {};
  for (const [key, label] of [['firstName', 'First name'], ['lastName', 'Last name'], ['department', 'Department'], ['designation', 'Job title'], ['employeeCode', 'Employee ID']]) {
    if (!v[key]) errors[key] = `${label} is required.`;
  }
  if (!v.email) errors.email = 'Email is required.';
  else if (!EMAIL_PATTERN.test(v.email)) errors.email = 'Enter a valid email address.';
  if (v.employeeCode && !/^[A-Za-z0-9_-]{2,32}$/.test(v.employeeCode)) errors.employeeCode = 'Use 2–32 letters, numbers, dashes or underscores.';
  if (v.phone && !/^\+?[0-9 ()-]{7,20}$/.test(v.phone)) errors.phone = 'Enter a valid phone number.';
  if (!v.joiningDate) errors.joiningDate = 'Joining date is required.';
  for (const [name, message] of Object.entries(errors)) {
    setFieldError(/** @type {HTMLInputElement} */ (form.elements.namedItem(name)), message);
  }
  const first = Object.keys(errors)[0];
  if (first) /** @type {HTMLInputElement} */ (form.elements.namedItem(first)).focus();
  return first || '';
}

clearErrorsOnInput(form);
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (saveButton.disabled || validateForm()) return;
  hideAlert(dialogAlert);
  const values = formValues(form);

  setBusy(saveButton, true, current ? 'Saving…' : 'Creating…');
  try {
    if (!current) {
      const { employee, accessLink } = await api('/admin/employees', { method: 'POST', body: values });
      setBusy(saveButton, false);
      fillEmployee(employee);
      historySection.hidden = true;
      showAccessLink(accessLink);
    } else {
      /** @type {Record<string, string>} */
      const changes = {};
      for (const name of FIELDS) {
        const before = /** @type {any} */ (current)[name] ?? '';
        if (values[name] !== String(before)) changes[name] = values[name];
      }
      if (!Object.keys(changes).length) {
        setBusy(saveButton, false);
        showAlert(dialogAlert, 'No changes to save.', 'info');
        return;
      }
      const { employee } = await api(`/admin/employees/${current.id}`, { method: 'PATCH', body: changes });
      setBusy(saveButton, false);
      fillEmployee(employee);
      showAlert(dialogAlert, 'Changes saved.', 'success');
    }
    refreshAll();
  } catch (error) {
    setBusy(saveButton, false);
    const err = /** @type {import('../lib/api.js').ApiError} */ (error);
    applyFieldErrors(form, err.fields);
    showAlert(dialogAlert, err.message);
  }
});

accessLinkButton.addEventListener('click', async () => {
  if (!current) return;
  const verb = current.hasPassword ? 'send a password reset link to' : 'issue a new activation link for';
  if (!window.confirm(`Do you want to ${verb} ${current.firstName} ${current.lastName}? Any previous link will stop working.`)) return;
  setBusy(accessLinkButton, true, 'Generating…');
  try {
    const { accessLink } = await api(`/admin/employees/${current.id}/access-link`, { method: 'POST', body: {} });
    showAccessLink(accessLink);
    openEmployeeHistory();
  } catch (error) {
    showAlert(dialogAlert, /** @type {Error} */ (error).message);
  } finally {
    setBusy(accessLinkButton, false);
  }
});

toggleStatusButton.addEventListener('click', async () => {
  if (!current) return;
  const deactivate = current.accountStatus !== 'inactive';
  const name = `${current.firstName} ${current.lastName}`;
  const question = deactivate
    ? `Deactivate ${name}? They will be signed out immediately and will not be able to sign in.`
    : `Reactivate ${name}'s account?`;
  if (!window.confirm(question)) return;
  setBusy(toggleStatusButton, true, deactivate ? 'Deactivating…' : 'Activating…');
  try {
    const { employee } = await api(`/admin/employees/${current.id}/status`, { method: 'POST', body: { status: deactivate ? 'inactive' : 'active' } });
    setBusy(toggleStatusButton, false);
    fillEmployee(employee);
    linkBox.hidden = true;
    showAlert(dialogAlert, deactivate ? 'Account deactivated and signed out everywhere.' : 'Account reactivated.', 'success');
    refreshAll();
    openEmployeeHistory();
  } catch (error) {
    setBusy(toggleStatusButton, false);
    showAlert(dialogAlert, /** @type {Error} */ (error).message);
  }
});

deleteButton.addEventListener('click', async () => {
  if (!current) return;
  const name = `${current.firstName} ${current.lastName}`;
  const confirmed = await confirmAction({
    title: 'Move this account to Soft Delete?',
    message: `${name} and their invoices will leave the directory. You can restore them together from Soft Delete for at least 30 days.`,
    confirmLabel: 'Move to Soft Delete',
    cancelLabel: 'Keep account',
    danger: true
  });
  if (!confirmed) return;
  setBusy(deleteButton, true, 'Deleting…');
  try {
    await api(`/admin/employees/${current.id}`, { method: 'DELETE' });
    dialog.close();
    showAlert(directoryAlert, 'Moved to Soft Delete.', 'success');
    refreshAll();
  } catch (error) {
    setBusy(deleteButton, false);
    showAlert(dialogAlert, /** @type {Error} */ (error).message);
  }
});

async function openEmployeeHistory() {
  if (!current) return;
  const { activity: entries } = await api(`/admin/employees/${current.id}`);
  renderActivity(historyList, entries);
  historySection.hidden = false;
}

$('[data-copy-link]').addEventListener('click', async (event) => {
  const button = /** @type {HTMLButtonElement} */ (event.currentTarget);
  try {
    await navigator.clipboard.writeText(linkInput.value);
    button.textContent = 'Copied';
  } catch {
    linkInput.select();
    button.textContent = 'Press ⌘/Ctrl+C';
  }
  setTimeout(() => { button.textContent = 'Copy'; }, 2000);
});

document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => dialog.close()));
dialog.addEventListener('click', (event) => {
  if (event.target === dialog) dialog.close();
});
dialog.addEventListener('close', () => {
  linkInput.value = '';
  linkBox.hidden = true;
});
$('[data-add-employee]').addEventListener('click', openCreate);

async function init() {
  const user = await requirePage({ role: 'admin' });
  if (!user) return;
  mountShell({ role: 'admin', active: 'employees', title: 'Employees', user });
  revealPage();
  await refreshAll();

  const params = new URLSearchParams(window.location.search);
  if (params.get('add') === '1') {
    openCreate();
    window.history.replaceState({}, '', '/admin/employees');
  } else if (params.get('id')) {
    await openEmployee(params.get('id') || '');
    window.history.replaceState({}, '', '/admin/employees');
  }
}

init();
