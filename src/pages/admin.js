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

const statsEl = /** @type {HTMLElement} */ ($('[data-stats]'));
const pageAlert = /** @type {HTMLElement} */ ($('[data-page-alert]'));

async function load() {
  statsEl.classList.add('is-loading');
  try {
    const data = await api('/admin/overview');
    $('[data-stat="total"]').textContent = String(data.total);
    $('[data-stat="invoices"]').textContent = String(data.invoices);
    $('[data-stat="resources"]').textContent = String(data.documents);
  } catch (error) {
    showAlert(pageAlert, /** @type {Error} */ (error).message);
  } finally {
    statsEl.classList.remove('is-loading');
  }
}

async function init() {
  const user = await requirePage({ role: 'admin' });
  if (!user) return;
  mountShell({ role: 'admin', active: 'dashboard', title: 'Dashboard', user });
  revealPage();
  await load();
}

init();
