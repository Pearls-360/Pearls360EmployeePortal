import '../styles/base.css';
import '../styles/portal.css';
import { bindChangePasswordForm } from '../lib/change-password-form.js';
import { showAlert } from '../lib/forms.js';
import { bindSignOut, requirePage, revealPage } from '../lib/session.js';

async function init() {
  const user = await requirePage({ allowPasswordChange: true });
  if (!user) return;

  const form = /** @type {HTMLFormElement} */ (document.querySelector('[data-change-password]'));
  const back = /** @type {HTMLAnchorElement} */ (document.querySelector('[data-back]'));
  const requiredNote = /** @type {HTMLElement} */ (document.querySelector('[data-required-note]'));
  const home = user.role === 'admin' ? '/admin' : '/employee';

  if (user.mustChangePassword) {
    requiredNote.hidden = false;
  } else {
    back.href = home;
    back.hidden = false;
  }

  bindSignOut();
  bindChangePasswordForm(form, {
    email: user.email,
    onSuccess: (result) => {
      showAlert(/** @type {HTMLElement} */ (form.querySelector('[data-alert]')), 'Your password has been updated.', 'success');
      setTimeout(() => window.location.replace(result.redirectTo || home), 900);
    }
  });
  revealPage();
}

init();
