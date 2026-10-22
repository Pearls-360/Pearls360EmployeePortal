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

const rows = /** @type {HTMLElement} */ ($('[data-rows]'));
const empty = /** @type {HTMLElement} */ ($('[data-empty]'));
const alertEl = /** @type {HTMLElement} */ ($('[data-page-alert]'));

/** @param {string} value */
function keptUntil(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
}

async function load() {
  const { accounts } = await api('/admin/deleted');
  rows.replaceChildren(...accounts.map((account) => {
    const item = document.createElement('li');
    const text = document.createElement('div');
    const name = document.createElement('strong');
    name.textContent = account.name;
    const meta = document.createElement('p');
    const invoices = account.invoiceCount === 1 ? '1 invoice' : `${account.invoiceCount} invoices`;
    meta.textContent = `${account.email} · ${account.employeeCode} · ${invoices} · Kept until ${keptUntil(account.keepUntil)}`;
    text.append(name, meta);
    const restore = document.createElement('button');
    restore.className = 'btn btn--ghost btn--sm';
    restore.type = 'button';
    restore.textContent = 'Restore';
    restore.addEventListener('click', async () => {
      restore.disabled = true;
      try {
        await api(`/admin/deleted/${account.id}/restore`, { method: 'POST', body: {} });
        showAlert(alertEl, `${account.name} and their invoices are back.`, 'success');
        await load();
      } catch (error) {
        restore.disabled = false;
        showAlert(alertEl, /** @type {Error} */ (error).message);
      }
    });
    item.append(text, restore);
    return item;
  }));
  empty.hidden = accounts.length > 0;
}

async function init() {
  const user = await requirePage({ role: 'admin' });
  if (!user) return;
  mountShell({ role: 'admin', active: 'deleted', title: 'Soft Delete', user });
  revealPage();
  try {
    await load();
  } catch (error) {
    showAlert(alertEl, /** @type {Error} */ (error).message);
  }
}

init();
