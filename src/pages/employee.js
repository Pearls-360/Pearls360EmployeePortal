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
  } catch (error) {
    showAlert($('[data-page-alert]'), /** @type {Error} */ (error).message);
  }
  revealPage();
}

init();
