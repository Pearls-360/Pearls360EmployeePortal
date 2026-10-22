import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { Agent, createActiveEmployee, createTestDb, setupAdmin } from './helpers.js';

/** @type {Awaited<ReturnType<typeof createTestDb>>} */
let db;
/** @type {Agent} */
let admin;

before(async () => {
  db = await createTestDb();
  admin = await setupAdmin(db);
});
after(() => db.end());

describe('training quizzes', () => {
  test('an assigned employee can submit, and only an admin can record the score', async () => {
    const ada = await createActiveEmployee(admin, { email: 'ada.quiz@example.test', employeeCode: 'QUIZ-1' });
    const beau = await createActiveEmployee(admin, { email: 'beau.quiz@example.test', employeeCode: 'QUIZ-2' });
    const created = await admin.post('/admin/quizzes', {
      title: 'Site safety',
      employeeIds: [ada.employee.id],
      questions: [
        { kind: 'choice', prompt: 'What is required on site?', options: ['Helmet', 'Nothing'] },
        { kind: 'text', prompt: 'Name your supervisor.' }
      ]
    });
    assert.equal(created.status, 201);

    const listed = await admin.get('/admin/quizzes');
    const quiz = listed.body.quizzes.find((row) => row.title === 'Site safety');
    assert.equal(quiz.assignments.length, 1);
    assert.equal(quiz.assignments[0].status, 'assigned');
    assert.equal(quiz.assignments[0].employeeName.includes('Ada') || quiz.assignments[0].employeeId === ada.employee.id, true);

    const own = await ada.agent.get('/employee/quizzes');
    assert.equal(own.body.quizzes.length, 1);
    assert.equal((await beau.agent.get('/employee/quizzes')).body.quizzes.length, 0);
    assert.equal((await beau.agent.get(`/employee/quizzes/${own.body.quizzes[0].id}`)).status, 404);

    const paper = await ada.agent.get(`/employee/quizzes/${own.body.quizzes[0].id}`);
    const choice = paper.body.questions.find((question) => question.kind === 'choice');
    const written = paper.body.questions.find((question) => question.kind === 'text');
    const submitted = await ada.agent.post(`/employee/quizzes/${own.body.quizzes[0].id}/submit`, {
      answers: [
        { questionId: choice.id, optionId: choice.options[0].id },
        { questionId: written.id, text: 'Nabila' }
      ]
    });
    assert.equal(submitted.status, 200);
    assert.equal((await ada.agent.post(`/employee/quizzes/${own.body.quizzes[0].id}/submit`, { answers: [] })).status, 409);

    const review = await admin.get(`/admin/quiz-assignments/${own.body.quizzes[0].id}`);
    assert.equal(review.body.status, 'completed');
    assert.equal(review.body.questions.find((question) => question.kind === 'text').answer.text, 'Nabila');

    const early = await ada.agent.post(`/admin/quiz-assignments/${own.body.quizzes[0].id}/score`, { score: 10 });
    assert.equal(early.status, 403);
    const scored = await admin.post(`/admin/quiz-assignments/${own.body.quizzes[0].id}/score`, { score: 18 });
    assert.equal(scored.status, 200);
    assert.equal((await ada.agent.get('/employee/quizzes')).body.quizzes[0].score, '18.00');
  });
});
