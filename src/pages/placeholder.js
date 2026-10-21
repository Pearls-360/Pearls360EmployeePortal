import '../styles/base.css';
import '../styles/portal.css';
import '../styles/dashboard.css';
import '../styles/shell.css';
import { mountShell } from '../lib/shell.js';
import { requirePage, revealPage } from '../lib/session.js';

async function init() {
  const role = /** @type {'admin' | 'employee'} */ (document.body.dataset.role || 'admin');
  const active = /** @type {any} */ (document.body.dataset.nav || 'dashboard');
  const title = document.body.dataset.title || 'Pearls360';
  const user = await requirePage({ role });
  if (!user) return;
  mountShell({ role, active, title, user });
  revealPage();
}

init();
