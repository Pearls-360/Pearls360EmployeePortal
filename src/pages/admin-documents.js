import '../styles/base.css';
import '../styles/portal.css';
import '../styles/dashboard.css';
import '../styles/shell.css';
import { api } from '../lib/api.js';
import { applyFieldErrors, clearErrorsOnInput, clearFieldErrors, hideAlert, setBusy, showAlert } from '../lib/forms.js';
import { formatDateTime } from '../lib/format.js';
import { mountShell } from '../lib/shell.js';
import { requirePage, revealPage } from '../lib/session.js';

/** @template {Element} T @param {string} sel @returns {T} */
const $ = (sel) => /** @type {T} */ (document.querySelector(sel));

const kind = document.body.dataset.kind === 'resource' ? 'resource' : 'library';
const nav = kind === 'resource' ? 'resources' : 'library';
const title = kind === 'resource' ? 'Team Resources' : 'Internal Library';

/** @param {File} file */
function readFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.readAsDataURL(file);
  });
}

/** @param {number} bytes */
function sizeLabel(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const rows = /** @type {HTMLElement} */ ($('[data-rows]'));
const empty = /** @type {HTMLElement} */ ($('[data-empty]'));
const form = /** @type {HTMLFormElement} */ ($('#upload-form'));
const alertEl = /** @type {HTMLElement} */ ($('[data-page-alert]'));
const save = /** @type {HTMLButtonElement} */ ($('[data-save]'));

async function load() {
  const { documents } = await api(`/admin/documents?kind=${kind}`);
  rows.replaceChildren(...documents.map((doc) => {
    const item = document.createElement('li');
    const text = document.createElement('div');
    const name = document.createElement('strong');
    name.textContent = doc.title;
    const meta = document.createElement('p');
    meta.textContent = [doc.category, doc.visibility === 'leadership' ? 'Leadership only' : 'All employees', sizeLabel(doc.byteSize), formatDateTime(doc.createdAt)].filter(Boolean).join(' · ');
    text.append(name, meta);
    const actions = document.createElement('div');
    actions.className = 'form-actions';
    const open = document.createElement('a');
    open.className = 'link';
    open.href = `/api/documents/${doc.id}/file`;
    open.textContent = 'Download';
    const remove = document.createElement('button');
    remove.className = 'link';
    remove.type = 'button';
    remove.textContent = 'Remove';
    remove.addEventListener('click', async () => {
      if (!window.confirm(`Remove “${doc.title}” from the database?`)) return;
      await api(`/admin/documents/${doc.id}`, { method: 'DELETE' });
      await load();
    });
    actions.append(open, remove);
    item.append(text, actions);
    return item;
  }));
  empty.hidden = documents.length > 0;
}

clearErrorsOnInput(form);
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  hideAlert(alertEl);
  clearFieldErrors(form);
  const file = /** @type {HTMLInputElement} */ (form.elements.namedItem('file')).files?.[0];
  if (!file) {
    showAlert(alertEl, 'Choose a file.');
    return;
  }
  if (file.size > 2_000_000) {
    showAlert(alertEl, 'Keep the file under 2 MB.');
    return;
  }
  setBusy(save, true, 'Saving…');
  try {
    await api('/admin/documents', {
      method: 'POST',
      body: {
        kind,
        title: /** @type {HTMLInputElement} */ (form.elements.namedItem('title')).value,
        category: /** @type {HTMLInputElement} */ (form.elements.namedItem('category')).value,
        visibility: /** @type {HTMLSelectElement} */ (form.elements.namedItem('visibility')).value,
        fileName: file.name,
        file: await readFile(file)
      }
    });
    form.reset();
    setBusy(save, false);
    showAlert(alertEl, 'Saved in the database.', 'success');
    await load();
  } catch (error) {
    setBusy(save, false);
    const err = /** @type {import('../lib/api.js').ApiError} */ (error);
    applyFieldErrors(form, err.fields);
    showAlert(alertEl, err.message);
  }
});

async function init() {
  const user = await requirePage({ role: 'admin' });
  if (!user) return;
  mountShell({ role: 'admin', active: nav, title, user });
  revealPage();
  try {
    await load();
  } catch (error) {
    showAlert(alertEl, /** @type {Error} */ (error).message);
  }
}

init();
