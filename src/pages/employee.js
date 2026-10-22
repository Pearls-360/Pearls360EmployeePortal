import '../styles/base.css';
import '../styles/portal.css';
import '../styles/dashboard.css';
import '../styles/shell.css';
import { api } from '../lib/api.js';
import { showAlert } from '../lib/forms.js';
import { mountShell } from '../lib/shell.js';
import { requirePage, revealPage } from '../lib/session.js';

/** @template {Element} T @param {string} sel @returns {T} */
const $ = (sel) => /** @type {T} */ (document.querySelector(sel));

/** @param {{ id: string, title: string }} doc */
function documentRow(doc) {
  const li = document.createElement('li');
  const name = document.createElement('span');
  name.textContent = doc.title;
  const view = document.createElement('a');
  view.className = 'link';
  view.href = `/api/documents/${doc.id}/file`;
  view.target = '_blank';
  view.rel = 'noopener noreferrer';
  view.textContent = 'View';
  li.append(name, view);
  return li;
}

/** @param {{ invoiceNumber: string, currency: string, amount: string }} invoice */
function invoiceRow(invoice) {
  const li = document.createElement('li');
  const name = document.createElement('span');
  name.textContent = invoice.invoiceNumber;
  const amount = document.createElement('span');
  amount.textContent = `${invoice.currency} ${invoice.amount}`;
  li.append(name, amount);
  return li;
}

async function init() {
  const user = await requirePage({ role: 'employee' });
  if (!user) return;
  mountShell({ role: 'employee', active: 'dashboard', title: 'Dashboard', user });
  try {
    const [{ documents }, { invoices }] = await Promise.all([
      api('/employee/documents'),
      api('/employee/invoices')
    ]);
    const resourceList = /** @type {HTMLElement} */ ($('[data-resource-list]'));
    const trainingList = /** @type {HTMLElement} */ ($('[data-training-list]'));
    const invoiceList = /** @type {HTMLElement} */ ($('[data-invoice-list]'));
    const library = documents.filter((doc) => doc.kind === 'library');
    const training = documents.filter((doc) => doc.kind === 'resource');
    resourceList.replaceChildren(...library.slice(0, 3).map(documentRow));
    trainingList.replaceChildren(...training.slice(0, 3).map(documentRow));
    invoiceList.replaceChildren(...invoices.slice(0, 3).map(invoiceRow));
    /** @type {HTMLElement} */ ($('[data-resource-empty]')).hidden = library.length > 0;
    /** @type {HTMLElement} */ ($('[data-training-empty]')).hidden = training.length > 0;
    /** @type {HTMLElement} */ ($('[data-invoice-empty]')).hidden = invoices.length > 0;
  } catch (error) {
    showAlert($('[data-page-alert]'), /** @type {Error} */ (error).message);
  }
  revealPage();
}

init();
