import '../styles/base.css';
import '../styles/portal.css';
import '../styles/dashboard.css';
import '../styles/shell.css';
import { api } from '../lib/api.js';
import { showAlert } from '../lib/forms.js';
import { formatDate } from '../lib/format.js';
import { mountShell } from '../lib/shell.js';
import { requirePage, revealPage } from '../lib/session.js';

/** @template {Element} T @param {string} sel @returns {T} */
const $ = (sel) => /** @type {T} */ (document.querySelector(sel));

async function init() {
  const user = await requirePage({ role: 'employee' });
  if (!user) return;
  mountShell({ role: 'employee', active: 'dashboard', title: 'Dashboard', user });
  try {
    const { profile } = await api('/employee/profile');
    $('[data-welcome]').textContent = `Welcome, ${profile.firstName}`;
    $('[data-role-line]').textContent = `${profile.designation} · ${profile.department}`;
    $('[data-field="employeeCode"]').textContent = profile.employeeCode;
    $('[data-field="department"]').textContent = profile.department;
    $('[data-field="designation"]').textContent = profile.designation;
    $('[data-field="joiningDate"]').textContent = formatDate(profile.joiningDate);
    const [{ documents }, { invoices }] = await Promise.all([
      api('/employee/documents'),
      api('/employee/invoices')
    ]);
    const resourceList = /** @type {HTMLElement} */ ($('[data-resource-list]'));
    const invoiceList = /** @type {HTMLElement} */ ($('[data-invoice-list]'));
    resourceList.replaceChildren(...documents.slice(0, 4).map((doc) => {
      const li = document.createElement('li');
      const link = document.createElement('a');
      link.href = `/api/documents/${doc.id}/file`;
      link.textContent = doc.title;
      li.append(link);
      return li;
    }));
    invoiceList.replaceChildren(...invoices.slice(0, 4).map((invoice) => {
      const li = document.createElement('li');
      li.textContent = `${invoice.invoiceNumber} · ${invoice.currency} ${invoice.amount}`;
      return li;
    }));
    /** @type {HTMLElement} */ ($('[data-resource-empty]')).hidden = documents.length > 0;
    /** @type {HTMLElement} */ ($('[data-invoice-empty]')).hidden = invoices.length > 0;
  } catch (error) {
    showAlert($('[data-page-alert]'), /** @type {Error} */ (error).message);
  }
  revealPage();
}

init();
