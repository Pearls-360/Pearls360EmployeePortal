import { api } from '../lib/api.js';
import { hideAlert, setBusy, showAlert } from '../lib/forms.js';

/** @template {Element} T @param {string} sel @returns {T} */
const $ = (sel) => /** @type {T} */ (document.querySelector(sel));

const dialog = /** @type {HTMLDialogElement} */ ($('#quiz-dialog'));
const form = /** @type {HTMLFormElement} */ ($('#quiz-form'));
const list = /** @type {HTMLElement} */ ($('[data-question-list]'));
const people = /** @type {HTMLSelectElement} */ ($('#quiz-employee'));
const reviewDialog = /** @type {HTMLDialogElement} */ ($('#review-dialog'));
const reviewBody = /** @type {HTMLElement} */ ($('[data-review]'));
const scoreForm = /** @type {HTMLFormElement} */ ($('#score-form'));
let questionCount = 0;

/** @param {'choice' | 'text'} kind */
function addQuestion(kind = 'choice') {
  questionCount += 1;
  const block = document.createElement('div');
  block.className = 'quiz-question';
  block.dataset.question = '';
  block.dataset.kind = kind;
  const head = document.createElement('div');
  head.className = 'quiz-question__head';
  const label = document.createElement('strong');
  label.textContent = `Question ${questionCount}`;
  head.append(label);
  const types = document.createElement('div');
  types.className = 'quiz-kind';
  types.setAttribute('role', 'group');
  types.setAttribute('aria-label', 'Answer type');
  const choiceBtn = document.createElement('button');
  choiceBtn.type = 'button';
  choiceBtn.dataset.kindChoice = 'choice';
  choiceBtn.textContent = 'Multiple choice';
  const textBtn = document.createElement('button');
  textBtn.type = 'button';
  textBtn.dataset.kindChoice = 'text';
  textBtn.textContent = 'Written answer';
  const prompt = document.createElement('input');
  prompt.dataset.prompt = '';
  prompt.placeholder = 'Question';
  prompt.maxLength = 500;
  prompt.required = true;
  const options = document.createElement('div');
  options.dataset.options = '';
  const addOption = document.createElement('button');
  addOption.type = 'button';
  addOption.className = 'link';
  addOption.textContent = 'Add choice';
  const sync = () => {
    const choice = block.dataset.kind === 'choice';
    choiceBtn.classList.toggle('is-selected', choice);
    textBtn.classList.toggle('is-selected', !choice);
    choiceBtn.setAttribute('aria-pressed', choice ? 'true' : 'false');
    textBtn.setAttribute('aria-pressed', choice ? 'false' : 'true');
    options.hidden = !choice;
    addOption.hidden = !choice;
    if (choice && !options.children.length) {
      appendOption(options);
      appendOption(options);
    }
  };
  choiceBtn.addEventListener('click', () => { block.dataset.kind = 'choice'; sync(); });
  textBtn.addEventListener('click', () => { block.dataset.kind = 'text'; sync(); });
  types.append(choiceBtn, textBtn);
  addOption.addEventListener('click', () => appendOption(options));
  block.append(head, types, prompt, options, addOption);
  list.append(block);
  sync();
}

/** @param {HTMLElement} options */
function appendOption(options) {
  const input = document.createElement('input');
  input.dataset.option = '';
  input.placeholder = `Choice ${options.children.length + 1}`;
  input.maxLength = 200;
  options.append(input);
}

function readQuestions() {
  return [...list.querySelectorAll('[data-question]')].map((block) => {
    const kind = /** @type {HTMLElement} */ (block).dataset.kind || 'choice';
    const prompt = /** @type {HTMLInputElement} */ (block.querySelector('[data-prompt]')).value.trim();
    const options = [...block.querySelectorAll('[data-option]')].map((input) => /** @type {HTMLInputElement} */ (input).value.trim()).filter(Boolean);
    return { kind, prompt, options };
  });
}

async function loadQuizzes() {
  const box = /** @type {HTMLElement} */ ($('[data-quizzes]'));
  const empty = /** @type {HTMLElement} */ ($('[data-quizzes-empty]'));
  const { quizzes } = await api('/admin/quizzes');
  box.replaceChildren(...quizzes.map((quiz) => {
    const group = document.createElement('article');
    group.className = 'quiz-group';
    const title = document.createElement('h3');
    title.textContent = quiz.title;
    const rows = document.createElement('ul');
    rows.className = 'record-list';
    rows.append(...quiz.assignments.map((assignment) => {
      const item = document.createElement('li');
      const name = document.createElement('span');
      const status = assignment.status === 'scored'
        ? `Score ${Number(assignment.score)}`
        : assignment.status === 'completed' ? 'Completed' : 'Assigned';
      name.textContent = `${assignment.employeeName} · ${status}`;
      const review = document.createElement('button');
      review.type = 'button';
      review.className = 'link';
      review.textContent = assignment.status === 'assigned' ? 'Waiting' : 'Review';
      review.disabled = assignment.status === 'assigned';
      review.addEventListener('click', () => openReview(assignment.id));
      item.append(name, review);
      return item;
    }));
    group.append(title, rows);
    return group;
  }));
  empty.hidden = quizzes.length > 0;
}

/** @param {string} id */
async function openReview(id) {
  const detail = await api(`/admin/quiz-assignments/${id}`);
  /** @type {HTMLElement} */ ($('#review-dialog-title')).textContent = detail.title;
  reviewBody.replaceChildren(...detail.questions.map((question, index) => {
    const block = document.createElement('div');
    const prompt = document.createElement('strong');
    prompt.textContent = `${index + 1}. ${question.prompt}`;
    const answer = document.createElement('p');
    answer.className = 'quiz-answer';
    if (!question.answer) answer.textContent = 'No answer yet.';
    else if (question.kind === 'text') answer.textContent = question.answer.text || '';
    else answer.textContent = question.options.find((option) => option.id === question.answer.optionId)?.label || '';
    block.append(prompt, answer);
    return block;
  }));
  scoreForm.hidden = detail.status === 'assigned';
  scoreForm.dataset.assignmentId = id;
  /** @type {HTMLInputElement} */ (scoreForm.elements.namedItem('score')).value = detail.score ?? '';
  if (!reviewDialog.open) reviewDialog.showModal();
}

/** Loads the quiz list and wires Create Quiz. Safe to call only on Training Resources. */
export function mountQuizzes() {
  if (!dialog || !form) return;
  addQuestion('choice');
  $('[data-add-question]').addEventListener('click', () => addQuestion('choice'));
  $('[data-create-quiz]').addEventListener('click', async () => {
    hideAlert($('[data-quiz-alert]'));
    form.reset();
    list.replaceChildren();
    questionCount = 0;
    addQuestion('choice');
    const { employees } = await api('/admin/employees');
    people.replaceChildren(...[
      new Option('Select an employee', ''),
      ...employees.filter((employee) => employee.accountStatus !== 'inactive').map((employee) => new Option(`${employee.firstName} ${employee.lastName}`, employee.id))
    ]);
    if (!dialog.open) dialog.showModal();
  });
  document.querySelectorAll('[data-quiz-close]').forEach((button) => button.addEventListener('click', () => dialog.close()));
  dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
  document.querySelectorAll('[data-review-close]').forEach((button) => button.addEventListener('click', () => reviewDialog.close()));
  reviewDialog.addEventListener('click', (event) => { if (event.target === reviewDialog) reviewDialog.close(); });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const alertEl = /** @type {HTMLElement} */ ($('[data-quiz-alert]'));
    const save = /** @type {HTMLButtonElement} */ ($('[data-save-quiz]'));
    const employeeIds = people.value ? [people.value] : [];
    setBusy(save, true, 'Saving…');
    try {
      await api('/admin/quizzes', {
        method: 'POST',
        body: { title: /** @type {HTMLInputElement} */ (form.elements.namedItem('title')).value, questions: readQuestions(), employeeIds }
      });
      setBusy(save, false);
      dialog.close();
      showAlert($('[data-page-alert]'), 'Quiz assigned.', 'success');
      await loadQuizzes();
    } catch (error) {
      setBusy(save, false);
      showAlert(alertEl, /** @type {Error} */ (error).message);
    }
  });

  scoreForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const save = /** @type {HTMLButtonElement} */ (scoreForm.querySelector('button'));
    setBusy(save, true, 'Saving…');
    try {
      await api(`/admin/quiz-assignments/${scoreForm.dataset.assignmentId}/score`, {
        method: 'POST',
        body: { score: Number(/** @type {HTMLInputElement} */ (scoreForm.elements.namedItem('score')).value) }
      });
      setBusy(save, false);
      reviewDialog.close();
      showAlert($('[data-page-alert]'), 'Score saved.', 'success');
      await loadQuizzes();
    } catch (error) {
      setBusy(save, false);
      showAlert($('[data-score-alert]'), /** @type {Error} */ (error).message);
    }
  });

  loadQuizzes().catch((error) => showAlert($('[data-page-alert]'), /** @type {Error} */ (error).message));
}
