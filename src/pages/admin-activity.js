import '../styles/base.css';
import '../styles/portal.css';
import '../styles/dashboard.css';
import '../styles/shell.css';
import { api } from '../lib/api.js';
import { showAlert } from '../lib/forms.js';
import { auditLabel, formatDateTime } from '../lib/format.js';
import { mountShell } from '../lib/shell.js';
import { requirePage, revealPage } from '../lib/session.js';

/** @param {string} tag @param {string} [className] @param {string} [content] */
function el(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
}

async function init() {
  const user = await requirePage({ role: 'admin' });
  if (!user) return;
  mountShell({ role: 'admin', active: 'activity', title: 'Activity Logs', user });
  const list = /** @type {HTMLUListElement} */ (document.querySelector('[data-activity]'));
  const alert = /** @type {HTMLElement} */ (document.querySelector('[data-page-alert]'));
  revealPage();
  try {
    const { entries } = await api('/admin/audit-logs?limit=100');
    if (!entries.length) {
      list.replaceChildren(el('li', 'empty', 'No activity recorded yet.'));
      return;
    }
    list.replaceChildren(
      ...entries.map((/** @type {{ action: string, at: string, actor: string | null, targetName?: string | null }} */ entry) => {
        const li = el('li');
        const what = auditLabel(entry.action) + (entry.targetName ? ` · ${entry.targetName}` : '');
        li.append(
          el('span', 'activity__what', what),
          el('span', 'activity__who', entry.actor || 'System'),
          el('span', 'activity__when', formatDateTime(entry.at))
        );
        return li;
      })
    );
  } catch (error) {
    showAlert(alert, /** @type {Error} */ (error).message);
  }
}

init();
