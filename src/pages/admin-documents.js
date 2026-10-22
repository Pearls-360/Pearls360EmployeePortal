import '../styles/base.css';
import '../styles/portal.css';
import '../styles/dashboard.css';
import '../styles/shell.css';
import { api } from '../lib/api.js';
import { applyFieldErrors, clearErrorsOnInput, clearFieldErrors, confirmAction, hideAlert, setBusy, showAlert } from '../lib/forms.js';
import { formatDateTime } from '../lib/format.js';
import { mountShell } from '../lib/shell.js';
import { requirePage, revealPage } from '../lib/session.js';
import { mountQuizzes } from './admin-quizzes.js';

/** @template {Element} T @param {string} sel @returns {T} */
const $ = (sel) => /** @type {T} */ (document.querySelector(sel));

const kind = document.body.dataset.kind === 'resource' ? 'resource' : 'library';
const nav = kind === 'resource' ? 'resources' : 'library';
const title = kind === 'resource' ? 'Training Resources' : 'Internal Library';

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
const countEl = /** @type {HTMLElement} */ ($('[data-doc-count]'));
const dialog = /** @type {HTMLDialogElement} */ ($('#upload-dialog'));
const form = /** @type {HTMLFormElement} */ ($('#upload-form'));
const alertEl = /** @type {HTMLElement} */ ($('[data-page-alert]'));
const formAlert = /** @type {HTMLElement} */ ($('[data-form-alert]'));
const save = /** @type {HTMLButtonElement} */ ($('[data-save]'));
const noun = kind === 'resource' ? 'file' : 'document';

function openUpload() {
  hideAlert(formAlert);
  clearFieldErrors(form);
  form.reset();
  if (!dialog.open) dialog.showModal();
}

async function load() {
  const { documents } = await api(`/admin/documents?kind=${kind}`);
  countEl.textContent = documents.length === 1 ? `1 ${noun}` : `${documents.length} ${noun}s`;
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
    open.target = '_blank';
    open.rel = 'noopener noreferrer';
    open.textContent = 'View';
    const remove = document.createElement('button');
    remove.className = 'link';
    remove.type = 'button';
    remove.textContent = 'Remove';
    remove.addEventListener('click', async () => {
      const confirmed = await confirmAction({
        title: 'Remove this file?',
        message: `“${doc.title}” will be removed. People will no longer be able to open it.`,
        confirmLabel: 'Remove',
        cancelLabel: 'Keep it',
        danger: true
      });
      if (!confirmed) return;
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
  hideAlert(formAlert);
  clearFieldErrors(form);
  const file = /** @type {HTMLInputElement} */ (form.elements.namedItem('file')).files?.[0];
  if (!file) {
    showAlert(formAlert, 'Choose a file.');
    return;
  }
  if (file.size > 2_000_000) {
    showAlert(formAlert, 'Keep the file under 2 MB.');
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
    setBusy(save, false);
    dialog.close();
    showAlert(alertEl, kind === 'resource' ? 'Training uploaded.' : 'Document uploaded.', 'success');
    await load();
  } catch (error) {
    setBusy(save, false);
    const err = /** @type {import('../lib/api.js').ApiError} */ (error);
    applyFieldErrors(form, err.fields);
    showAlert(formAlert, err.message);
  }
});

document.querySelectorAll('[data-upload-close]').forEach((button) => {
  button.addEventListener('click', () => dialog.close());
});
dialog.addEventListener('click', (event) => {
  if (event.target === dialog) dialog.close();
});
$('[data-add-document]').addEventListener('click', openUpload);

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
  if (kind === 'resource') mountQuizzes();
  if (new URLSearchParams(window.location.search).get('add') === '1') {
    openUpload();
    window.history.replaceState({}, '', kind === 'resource' ? '/admin/resources' : '/admin/library');
  }
}

init();
