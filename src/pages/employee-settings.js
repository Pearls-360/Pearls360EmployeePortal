import '../styles/base.css';
import '../styles/portal.css';
import '../styles/dashboard.css';
import '../styles/shell.css';
import { mountShell } from '../lib/shell.js';
import { requirePage, revealPage } from '../lib/session.js';
import { bindClockPicker } from '../lib/clock.js';
import { bindThemePicker } from '../lib/theme.js';

async function init() {
  const user = await requirePage({ role: 'employee' });
  if (!user) return;
  mountShell({ role: 'employee', active: 'settings', title: 'Settings', user });
  bindThemePicker();
  bindClockPicker();
  revealPage();
}

init();
