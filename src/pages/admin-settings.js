import '../styles/base.css';
import '../styles/portal.css';
import '../styles/dashboard.css';
import '../styles/shell.css';
import { mountShell } from '../lib/shell.js';
import { requirePage, revealPage } from '../lib/session.js';
import { bindThemePicker } from '../lib/theme.js';

async function init() {
  const user = await requirePage({ role: 'admin' });
  if (!user) return;
  mountShell({ role: 'admin', active: 'settings', title: 'Settings', user });
  bindThemePicker();
  revealPage();
}

init();
