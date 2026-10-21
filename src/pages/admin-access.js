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

async function load() {
  const { people } = await api('/admin/access');
  rows.replaceChildren(...people.map((person) => {
    const item = document.createElement('li');
    const text = document.createElement('div');
    const name = document.createElement('strong');
    name.textContent = person.name;
    const email = document.createElement('p');
    email.textContent = person.email;
    text.append(name, email);
    const label = document.createElement('label');
    label.className = 'theme-toggle';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = person.leadership;
    input.setAttribute('aria-label', `Leadership access for ${person.name}`);
    input.addEventListener('change', async () => {
      try {
        await api('/admin/access', { method: 'POST', body: { userId: person.id, leadership: input.checked } });
      } catch (error) {
        input.checked = !input.checked;
        showAlert(alertEl, /** @type {Error} */ (error).message);
      }
    });
    const track = document.createElement('span');
    track.className = 'theme-toggle__track';
    track.innerHTML = '<span class="theme-toggle__thumb"></span>';
    const caption = document.createElement('span');
    caption.className = 'theme-toggle__label';
    caption.textContent = 'Leadership';
    label.append(input, track, caption);
    item.append(text, label);
    return item;
  }));
  empty.hidden = people.length > 0;
}

async function init() {
  const user = await requirePage({ role: 'admin' });
  if (!user) return;
  mountShell({ role: 'admin', active: 'access', title: 'Access Control', user });
  revealPage();
  try {
    await load();
  } catch (error) {
    showAlert(alertEl, /** @type {Error} */ (error).message);
  }
}

init();
