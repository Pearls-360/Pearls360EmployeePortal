import '../styles/base.css';
import '../styles/portal.css';
import '../styles/dashboard.css';
import '../styles/shell.css';
import { api } from '../lib/api.js';
import { hideAlert, setBusy, showAlert } from '../lib/forms.js';
import { formatDate } from '../lib/format.js';
import { mountShell } from '../lib/shell.js';
import { requirePage, revealPage } from '../lib/session.js';

/** @template {Element} T @param {string} sel @returns {T} */
const $ = (sel) => /** @type {T} */ (document.querySelector(sel));

const mode = document.body.dataset.records === 'invoices'
  ? 'invoices'
  : document.body.dataset.records === 'training'
    ? 'training'
    : 'documents';

async function init() {
  const user = await requirePage({ role: 'employee' });
  if (!user) return;
  const active = mode === 'invoices' ? 'my-invoices' : mode === 'training' ? 'training' : 'my-resources';
  const title = mode === 'invoices' ? 'My Invoices' : mode === 'training' ? 'Training' : 'My Resources';
  mountShell({ role: 'employee', active, title, user });
  const list = /** @type {HTMLElement} */ ($('[data-rows]'));
  const empty = /** @type {HTMLElement} */ ($('[data-empty]'));
  revealPage();
  try {
    if (mode === 'documents' || mode === 'training') {
      const { documents } = await api('/employee/documents');
      const visible = documents.filter((doc) => doc.kind === (mode === 'training' ? 'resource' : 'library'));
      list.replaceChildren(...visible.map((doc) => {
        const item = document.createElement('li');
        const text = document.createElement('div');
        const name = document.createElement('strong');
        name.textContent = doc.title;
        const meta = document.createElement('p');
        meta.textContent = doc.category || '';
        if (doc.category) text.append(name, meta);
        else text.append(name);
        const view = document.createElement('a');
        view.className = 'link';
        view.href = `/api/documents/${doc.id}/file`;
        view.target = '_blank';
        view.rel = 'noopener noreferrer';
        view.textContent = 'View';
        item.append(text, view);
        return item;
      }));
      empty.hidden = visible.length > 0;
      if (mode === 'training') await loadOwnQuizzes();
    } else {
      const { invoices } = await api('/employee/invoices');
      renderEarnings(invoices);
      list.replaceChildren(...invoices.map((invoice) => {
        const item = document.createElement('li');
        const name = document.createElement('strong');
        name.textContent = `${invoice.invoiceNumber} · ${invoice.currency} ${invoice.amount}`;
        const meta = document.createElement('p');
        meta.textContent = `${invoice.description} · ${invoice.status} · ${formatDate(invoice.issuedOn)}`;
        item.append(name, meta);
        return item;
      }));
      empty.hidden = invoices.length > 0;
    }
  } catch (error) {
    showAlert($('[data-page-alert]'), /** @type {Error} */ (error).message);
  }
}

async function loadOwnQuizzes() {
  const list = document.querySelector('[data-quizzes]');
  const empty = document.querySelector('[data-quizzes-empty]');
  if (!(list instanceof HTMLElement) || !(empty instanceof HTMLElement)) return;
  const { quizzes } = await api('/employee/quizzes');
  list.replaceChildren(...quizzes.map((quiz) => {
    const item = document.createElement('li');
    const text = document.createElement('div');
    const name = document.createElement('strong');
    name.textContent = quiz.title;
    const meta = document.createElement('p');
    meta.textContent = quiz.status === 'scored' ? `Score ${Number(quiz.score)}` : quiz.status === 'completed' ? 'Completed' : 'Assigned';
    text.append(name, meta);
    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'link';
    open.textContent = quiz.status === 'assigned' ? 'Take quiz' : 'View';
    open.addEventListener('click', () => openQuiz(quiz.id));
    item.append(text, open);
    return item;
  }));
  empty.hidden = quizzes.length > 0;
}

/** @param {string} id */
async function openQuiz(id) {
  const dialog = /** @type {HTMLDialogElement} */ ($('#take-dialog'));
  const form = /** @type {HTMLFormElement} */ ($('#take-form'));
  const box = /** @type {HTMLElement} */ ($('[data-take-questions]'));
  const submit = /** @type {HTMLButtonElement} */ ($('[data-submit-quiz]'));
  const detail = await api(`/employee/quizzes/${id}`);
  /** @type {HTMLElement} */ ($('#take-dialog-title')).textContent = detail.title;
  hideAlert($('[data-take-alert]'));
  box.replaceChildren(...detail.questions.map((question, index) => {
    const block = document.createElement('fieldset');
    block.className = 'take-question';
    block.dataset.questionId = question.id;
    block.dataset.kind = question.kind;
    const legend = document.createElement('legend');
    legend.textContent = `${index + 1}. ${question.prompt}`;
    block.append(legend);
    if (question.kind === 'choice') {
      for (const option of question.options) {
        const label = document.createElement('label');
        const input = document.createElement('input');
        input.type = 'radio';
        input.name = question.id;
        input.value = option.id;
        input.checked = question.answer?.optionId === option.id;
        input.disabled = detail.status !== 'assigned';
        label.append(input, document.createTextNode(option.label));
        block.append(label);
      }
    } else {
      const input = document.createElement('textarea');
      input.name = question.id;
      input.maxLength = 2000;
      input.rows = 3;
      input.value = question.answer?.text || '';
      input.disabled = detail.status !== 'assigned';
      block.append(input);
    }
    return block;
  }));
  if (detail.score != null && !box.querySelector('.take-score')) {
    const score = document.createElement('p');
    score.className = 'take-score';
    score.textContent = `Your score is ${Number(detail.score)}.`;
    box.prepend(score);
  }
  submit.hidden = detail.status !== 'assigned';
  form.onsubmit = async (event) => {
    event.preventDefault();
    const answers = [...box.querySelectorAll('.take-question')].map((block) => {
      const questionId = /** @type {HTMLElement} */ (block).dataset.questionId;
      if (/** @type {HTMLElement} */ (block).dataset.kind === 'choice') {
        const picked = block.querySelector('input:checked');
        return { questionId, optionId: picked instanceof HTMLInputElement ? picked.value : '' };
      }
      const written = block.querySelector('textarea');
      return { questionId, text: written instanceof HTMLTextAreaElement ? written.value : '' };
    });
    setBusy(submit, true, 'Submitting…');
    try {
      await api(`/employee/quizzes/${id}/submit`, { method: 'POST', body: { answers } });
      setBusy(submit, false);
      dialog.close();
      showAlert($('[data-page-alert]'), 'Quiz submitted.', 'success');
      await loadOwnQuizzes();
    } catch (error) {
      setBusy(submit, false);
      showAlert($('[data-take-alert]'), /** @type {Error} */ (error).message);
    }
  };
  if (!dialog.open) dialog.showModal();
  document.querySelectorAll('[data-take-close]').forEach((button) => {
    button.addEventListener('click', () => dialog.close(), { once: true });
  });
}

/** Paid amounts only. Different currencies are never added together. @param {Array<{ status: string, currency: string, amount: string }>} invoices */
function renderEarnings(invoices) {
  const box = document.querySelector('[data-earnings]');
  if (!box) return;
  /** @type {Map<string, number>} */
  const totals = new Map();
  for (const invoice of invoices) {
    if (invoice.status !== 'paid') continue;
    const cents = Math.round(Number(invoice.amount) * 100);
    if (!Number.isFinite(cents)) continue;
    totals.set(invoice.currency, (totals.get(invoice.currency) || 0) + cents);
  }
  if (!totals.size) {
    const note = document.createElement('p');
    note.className = 'earnings__empty';
    note.textContent = 'No paid invoices yet.';
    box.replaceChildren(note);
    return;
  }
  box.replaceChildren(...[...totals.entries()].map(([currency, cents]) => {
    const row = document.createElement('p');
    row.className = 'earnings__amount';
    row.textContent = `${currency} ${(cents / 100).toFixed(2)}`;
    return row;
  }));
}

init();
