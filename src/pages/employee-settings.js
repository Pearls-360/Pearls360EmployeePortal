import '../styles/base.css';
import '../styles/portal.css';
import '../styles/dashboard.css';
import '../styles/shell.css';
import { bindChangePasswordForm } from '../lib/change-password-form.js';
import { showAlert } from '../lib/forms.js';
import { mountShell } from '../lib/shell.js';
import { requirePage, revealPage } from '../lib/session.js';
import { bindThemePicker } from '../lib/theme.js';

async function init() {
  const user = await requirePage({ role: 'employee' });
  if (!user) return;
  mountShell({ role: 'employee', active: 'settings', title: 'Settings', user });
  bindThemePicker();

  const form = /** @type {HTMLFormElement} */ (document.querySelector('#change-password-form'));
  bindChangePasswordForm(form, {
    email: user.email,
    onSuccess: () => showAlert(/** @type {HTMLElement} */ (form.querySelector('[data-alert]')), 'Your password has been updated.', 'success')
  });
  revealPage();
}

init();
