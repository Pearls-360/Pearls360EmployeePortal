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

const mode = document.body.dataset.records === 'invoices' ? 'invoices' : 'documents';

async function init() {
  const user = await requirePage({ role: 'employee' });
  if (!user) return;
  mountShell({
    role: 'employee',
    active: mode === 'invoices' ? 'my-invoices' : 'my-resources',
    title: mode === 'invoices' ? 'My Invoices' : 'My Resources',
    user
  });
  const list = /** @type {HTMLElement} */ ($('[data-rows]'));
  const empty = /** @type {HTMLElement} */ ($('[data-empty]'));
  revealPage();
  try {
    if (mode === 'documents') {
      const { documents } = await api('/employee/documents');
      list.replaceChildren(...documents.map((doc) => {
        const item = document.createElement('li');
        const link = document.createElement('a');
        link.className = 'table__link';
        link.href = `/api/documents/${doc.id}/file`;
        link.textContent = doc.title;
        const meta = document.createElement('p');
        meta.textContent = [doc.category, doc.kind === 'resource' ? 'Team resource' : 'Library'].filter(Boolean).join(' · ');
        item.append(link, meta);
        return item;
      }));
      empty.hidden = documents.length > 0;
    } else {
      const { invoices } = await api('/employee/invoices');
      list.replaceChildren(...invoices.map((invoice) => {
        const item = document.createElement('li');
        const name = document.createElement('strong');
        name.textContent = `${invoice.invoiceNumber} · ${invoice.currency} ${invoice.amount}`;
        const meta = document.createElement('p');
        meta.textContent = `${invoice.description} · ${invoice.status} · ${formatDate(invoice.issuedOn)}`;
        item.append(name, meta);
        return item;
      }));
      empty.hidden = invoices.length > 0;
    }
  } catch (error) {
    showAlert($('[data-page-alert]'), /** @type {Error} */ (error).message);
  }
}

init();
