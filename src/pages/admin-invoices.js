import '../styles/base.css';
import '../styles/portal.css';
import '../styles/dashboard.css';
import '../styles/shell.css';
import { api } from '../lib/api.js';
import { applyFieldErrors, clearErrorsOnInput, clearFieldErrors, formValues, hideAlert, setBusy, showAlert } from '../lib/forms.js';
import { formatDate } from '../lib/format.js';
import { mountShell } from '../lib/shell.js';
import { requirePage, revealPage } from '../lib/session.js';

/** @template {Element} T @param {string} sel @returns {T} */
const $ = (sel) => /** @type {T} */ (document.querySelector(sel));

const form = /** @type {HTMLFormElement} */ ($('#invoice-form'));
const dialog = /** @type {HTMLDialogElement} */ ($('#invoice-dialog'));
const rows = /** @type {HTMLTableSectionElement} */ ($('[data-rows]'));
const empty = /** @type {HTMLElement} */ ($('[data-empty]'));
const alertEl = /** @type {HTMLElement} */ ($('[data-page-alert]'));
const formAlert = /** @type {HTMLElement} */ ($('[data-form-alert]'));
const countEl = /** @type {HTMLElement} */ ($('[data-invoice-count]'));
const save = /** @type {HTMLButtonElement} */ ($('[data-save]'));
const employeeSelect = /** @type {HTMLSelectElement} */ ($('#employeeId'));

function today() {
  return new Date().toISOString().slice(0, 10);
}

function openCreate() {
  hideAlert(formAlert);
  clearFieldErrors(form);
  form.reset();
  /** @type {HTMLInputElement} */ (form.elements.namedItem('currency')).value = 'USD';
  /** @type {HTMLSelectElement} */ (form.elements.namedItem('status')).value = 'open';
  /** @type {HTMLInputElement} */ (form.elements.namedItem('issuedOn')).value = today();
  if (!dialog.open) dialog.showModal();
}

/** @param {string} status */
function statusSelect(id, status) {
  const select = document.createElement('select');
  select.setAttribute('aria-label', 'Invoice status');
  for (const value of ['draft', 'open', 'paid', 'void']) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value[0].toUpperCase() + value.slice(1);
    option.selected = value === status;
    select.append(option);
  }
  select.addEventListener('change', async () => {
    try {
      await api(`/admin/invoices/${id}/status`, { method: 'POST', body: { status: select.value } });
    } catch (error) {
      showAlert(alertEl, /** @type {Error} */ (error).message);
    }
  });
  return select;
}

async function load() {
  const [{ invoices }, { employees }] = await Promise.all([
    api('/admin/invoices'),
    api('/admin/employees')
  ]);
  const current = employeeSelect.value;
  employeeSelect.replaceChildren(new Option('Choose an employee', ''));
  for (const employee of employees) {
    employeeSelect.add(new Option(`${employee.firstName} ${employee.lastName}`, employee.id));
  }
  if (current) employeeSelect.value = current;

  countEl.textContent = invoices.length === 1 ? '1 invoice' : `${invoices.length} invoices`;
  rows.replaceChildren(...invoices.map((invoice) => {
    const tr = document.createElement('tr');
    const cells = [
      invoice.invoiceNumber,
      invoice.employeeName || invoice.employeeEmail,
      invoice.description,
      `${invoice.currency} ${invoice.amount}`,
      formatDate(invoice.issuedOn)
    ];
    for (const value of cells) {
      const td = document.createElement('td');
      td.textContent = value;
      tr.append(td);
    }
    const status = document.createElement('td');
    status.append(statusSelect(invoice.id, invoice.status));
    tr.append(status);
    return tr;
  }));
  empty.hidden = invoices.length > 0;
}

clearErrorsOnInput(form);
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  hideAlert(alertEl);
  hideAlert(formAlert);
  clearFieldErrors(form);
  setBusy(save, true, 'Saving…');
  try {
    await api('/admin/invoices', { method: 'POST', body: formValues(form) });
    setBusy(save, false);
    dialog.close();
    showAlert(alertEl, 'Invoice saved.', 'success');
    await load();
  } catch (error) {
    setBusy(save, false);
    const err = /** @type {import('../lib/api.js').ApiError} */ (error);
    applyFieldErrors(form, err.fields);
    showAlert(formAlert, err.message);
  }
});

document.querySelectorAll('[data-invoice-close]').forEach((button) => {
  button.addEventListener('click', () => dialog.close());
});
dialog.addEventListener('click', (event) => {
  if (event.target === dialog) dialog.close();
});
$('[data-add-invoice]').addEventListener('click', openCreate);

async function init() {
  const user = await requirePage({ role: 'admin' });
  if (!user) return;
  mountShell({ role: 'admin', active: 'invoices', title: 'Employee Invoices', user });
  revealPage();
  try {
    await load();
  } catch (error) {
    showAlert(alertEl, /** @type {Error} */ (error).message);
  }
  if (new URLSearchParams(window.location.search).get('add') === '1') {
    openCreate();
    window.history.replaceState({}, '', '/admin/invoices');
  }
}

init();
