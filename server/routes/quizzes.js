import { HttpError, clientIp, readJson, sendJson } from '../http.js';
import { audit, requireSession } from '../security.js';
import { assertUuid } from '../validation.js';

/** @param {unknown} value */
const text = (value) => (typeof value === 'string' ? value.trim() : '');

/** @param {string | null} submittedAt @param {string | null} score */
function assignmentStatus(submittedAt, score) {
  if (score != null) return 'scored';
  if (submittedAt) return 'completed';
  return 'assigned';
}

/** @param {import('../db.js').Queryable} db @param {unknown} body */
async function insertQuiz(db, actorId, body) {
  const title = text(body.title);
  if (title.length < 1 || title.length > 160) {
    throw new HttpError(422, 'Give the quiz a title.', { code: 'VALIDATION', fields: { title: 'Give the quiz a title.' } });
  }
  const questions = Array.isArray(body.questions) ? body.questions : [];
  if (questions.length < 1 || questions.length > 30) {
    throw new HttpError(422, 'Add between 1 and 30 questions.', { code: 'VALIDATION' });
  }
  const employeeIds = Array.isArray(body.employeeIds) ? [...new Set(body.employeeIds.map(String))] : [];
  if (!employeeIds.length || employeeIds.some((id) => !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))) {
    throw new HttpError(422, 'Choose at least one employee.', { code: 'VALIDATION' });
  }

  /** @type {Array<{ kind: 'choice' | 'text', prompt: string, options: string[] }>} */
  const clean = questions.map((question, index) => {
    const kind = question?.kind === 'text' ? 'text' : question?.kind === 'choice' ? 'choice' : '';
    const prompt = text(question?.prompt);
    if (!kind || prompt.length < 1 || prompt.length > 500) {
      throw new HttpError(422, `Check question ${index + 1}.`, { code: 'VALIDATION' });
    }
    const options = kind === 'choice'
      ? (Array.isArray(question.options) ? question.options.map(text).filter(Boolean) : [])
      : [];
    if (kind === 'choice' && (options.length < 2 || options.length > 8 || options.some((option) => option.length > 200))) {
      throw new HttpError(422, `Question ${index + 1} needs two to eight choices.`, { code: 'VALIDATION' });
    }
    return { kind, prompt, options };
  });

  return db.tx(async (tx) => {
    const { rows: people } = await tx.query(
      `select id from app.users where role = 'employee' and deleted_at is null and id = any($1::uuid[])`,
      [employeeIds]
    );
    if (people.length !== employeeIds.length) throw new HttpError(422, 'Choose employees from the directory.', { code: 'VALIDATION' });

    const { rows: created } = await tx.query(
      'insert into app.quizzes (title, created_by) values ($1, $2) returning id',
      [title, actorId]
    );
    const quizId = created[0].id;
    for (let i = 0; i < clean.length; i++) {
      const question = clean[i];
      const { rows: inserted } = await tx.query(
        'insert into app.quiz_questions (quiz_id, position, kind, prompt) values ($1, $2, $3, $4) returning id',
        [quizId, i, question.kind, question.prompt]
      );
      for (let o = 0; o < question.options.length; o++) {
        await tx.query(
          'insert into app.quiz_options (question_id, position, label) values ($1, $2, $3)',
          [inserted[0].id, o, question.options[o]]
        );
      }
    }
    for (const employeeId of employeeIds) {
      await tx.query(
        'insert into app.quiz_assignments (quiz_id, employee_id, assigned_by) values ($1, $2, $3)',
        [quizId, employeeId, actorId]
      );
    }
    await audit(tx, { actorId, action: 'quiz.created', targetType: 'quiz', targetId: quizId, metadata: { assignments: employeeIds.length } });
    return quizId;
  });
}

/** @type {import('../router.js').Handler} */
export async function createQuiz({ db, req, res }) {
  const session = await requireSession(db, req, { roles: ['admin'] });
  const id = await insertQuiz(db, session.user.id, await readJson(req));
  sendJson(res, 201, { id });
}

/** @type {import('../router.js').Handler} */
export async function listQuizzes({ db, req, res }) {
  await requireSession(db, req, { roles: ['admin'] });
  const { rows } = await db.query(
    `select q.id as quiz_id, q.title, q.created_at,
            a.id as assignment_id, a.employee_id, a.assigned_at,
            p.first_name, p.last_name,
            t.submitted_at, t.score::text as score
       from app.quizzes q
       join app.quiz_assignments a on a.quiz_id = q.id
       join app.users u on u.id = a.employee_id
       left join app.employee_profiles p on p.user_id = u.id
       left join app.quiz_attempts t on t.assignment_id = a.id
      where u.deleted_at is null
      order by q.created_at desc, lower(p.last_name), lower(p.first_name)`
  );
  /** @type {Map<string, any>} */
  const quizzes = new Map();
  for (const row of rows) {
    if (!quizzes.has(row.quiz_id)) {
      quizzes.set(row.quiz_id, { id: row.quiz_id, title: row.title, createdAt: row.created_at, assignments: [] });
    }
    quizzes.get(row.quiz_id).assignments.push({
      id: row.assignment_id,
      employeeId: row.employee_id,
      employeeName: `${row.first_name || ''} ${row.last_name || ''}`.trim(),
      status: assignmentStatus(row.submitted_at, row.score),
      score: row.score,
      submittedAt: row.submitted_at
    });
  }
  sendJson(res, 200, { quizzes: [...quizzes.values()] });
}

/** @type {import('../router.js').Handler} */
export async function getAssignment({ db, req, res, params }) {
  await requireSession(db, req, { roles: ['admin'] });
  const id = assertUuid(params.id, 'Quiz not found.');
  const detail = await loadAssignment(db, id, null);
  sendJson(res, 200, detail);
}

/**
 * @param {import('../db.js').Queryable} db
 * @param {string} assignmentId
 * @param {string | null} employeeId
 */
async function loadAssignment(db, assignmentId, employeeId) {
  const { rows } = await db.query(
    `select a.id, a.quiz_id, a.employee_id, q.title,
            t.submitted_at, t.score::text as score, t.id as attempt_id
       from app.quiz_assignments a
       join app.quizzes q on q.id = a.quiz_id
       join app.users u on u.id = a.employee_id and u.deleted_at is null
       left join app.quiz_attempts t on t.assignment_id = a.id
      where a.id = $1 and ($2::uuid is null or a.employee_id = $2)`,
    [assignmentId, employeeId]
  );
  if (!rows[0]) throw new HttpError(404, 'Quiz not found.', { code: 'NOT_FOUND' });
  const assignment = rows[0];
  const { rows: questions } = await db.query(
    `select id, position, kind, prompt from app.quiz_questions where quiz_id = $1 order by position`,
    [assignment.quiz_id]
  );
  const { rows: options } = await db.query(
    `select o.id, o.question_id, o.position, o.label
       from app.quiz_options o
       join app.quiz_questions qq on qq.id = o.question_id
      where qq.quiz_id = $1
      order by o.position`,
    [assignment.quiz_id]
  );
  const { rows: answers } = assignment.attempt_id
    ? await db.query('select question_id, option_id, text_answer from app.quiz_answers where attempt_id = $1', [assignment.attempt_id])
    : { rows: [] };
  const answerByQuestion = new Map(answers.map((answer) => [answer.question_id, answer]));
  return {
    id: assignment.id,
    title: assignment.title,
    status: assignmentStatus(assignment.submitted_at, assignment.score),
    score: assignment.score,
    questions: questions.map((question) => {
      const answer = answerByQuestion.get(question.id);
      return {
        id: question.id,
        kind: question.kind,
        prompt: question.prompt,
        options: options.filter((option) => option.question_id === question.id).map((option) => ({ id: option.id, label: option.label })),
        answer: answer ? { optionId: answer.option_id, text: answer.text_answer } : null
      };
    })
  };
}

/** @type {import('../router.js').Handler} */
export async function scoreAssignment({ db, req, res, params }) {
  const session = await requireSession(db, req, { roles: ['admin'] });
  const id = assertUuid(params.id, 'Quiz not found.');
  const body = await readJson(req);
  const score = typeof body.score === 'number' ? body.score : Number(body.score);
  if (!Number.isFinite(score) || score < 0 || score > 1000) {
    throw new HttpError(422, 'Enter a score from 0 to 1000.', { code: 'VALIDATION', fields: { score: 'Enter a score from 0 to 1000.' } });
  }
  const { rowCount } = await db.query(
    `update app.quiz_attempts
        set score = $2, scored_at = now(), scored_by = $3
      where assignment_id = $1`,
    [id, score, session.user.id]
  );
  if (!rowCount) throw new HttpError(409, 'This quiz has not been completed yet.', { code: 'CONFLICT' });
  await audit(db, { actorId: session.user.id, action: 'quiz.scored', targetType: 'quiz_assignment', targetId: id, metadata: { score }, ip: clientIp(req) });
  sendJson(res, 200, { ok: true, score });
}

/** @type {import('../router.js').Handler} */
export async function listOwnQuizzes({ db, req, res }) {
  const session = await requireSession(db, req, { roles: ['employee'] });
  const { rows } = await db.query(
    `select a.id, q.title, t.submitted_at, t.score::text as score
       from app.quiz_assignments a
       join app.quizzes q on q.id = a.quiz_id
       left join app.quiz_attempts t on t.assignment_id = a.id
      where a.employee_id = $1
      order by a.assigned_at desc`,
    [session.user.id]
  );
  sendJson(res, 200, {
    quizzes: rows.map((row) => ({
      id: row.id,
      title: row.title,
      status: assignmentStatus(row.submitted_at, row.score),
      score: row.score
    }))
  });
}

/** @type {import('../router.js').Handler} */
export async function getOwnQuiz({ db, req, res, params }) {
  const session = await requireSession(db, req, { roles: ['employee'] });
  const id = assertUuid(params.id, 'Quiz not found.');
  sendJson(res, 200, await loadAssignment(db, id, session.user.id));
}

/** @type {import('../router.js').Handler} */
export async function submitQuiz({ db, req, res, params }) {
  const session = await requireSession(db, req, { roles: ['employee'] });
  const id = assertUuid(params.id, 'Quiz not found.');
  const body = await readJson(req);
  const answers = Array.isArray(body.answers) ? body.answers : [];
  await db.tx(async (tx) => {
    const detail = await loadAssignment(tx, id, session.user.id);
    if (detail.status !== 'assigned') throw new HttpError(409, 'This quiz is already completed.', { code: 'CONFLICT' });
    if (answers.length !== detail.questions.length) throw new HttpError(422, 'Answer every question.', { code: 'VALIDATION' });
    const byId = new Map(detail.questions.map((question) => [question.id, question]));
    const seen = new Set();
    /** @type {Array<{ questionId: string, optionId: string | null, text: string | null }>} */
    const clean = [];
    for (const answer of answers) {
      const questionId = text(answer?.questionId);
      const question = byId.get(questionId);
      if (!question || seen.has(questionId)) throw new HttpError(422, 'Answer every question.', { code: 'VALIDATION' });
      seen.add(questionId);
      if (question.kind === 'choice') {
        const optionId = text(answer?.optionId);
        if (!question.options.some((option) => option.id === optionId)) {
          throw new HttpError(422, 'Choose an answer for every question.', { code: 'VALIDATION' });
        }
        clean.push({ questionId, optionId, text: null });
      } else {
        const written = text(answer?.text);
        if (!written || written.length > 2000) throw new HttpError(422, 'Write an answer for every question.', { code: 'VALIDATION' });
        clean.push({ questionId, optionId: null, text: written });
      }
    }
    const { rows } = await tx.query(
      'insert into app.quiz_attempts (assignment_id) values ($1) returning id',
      [id]
    );
    for (const answer of clean) {
      await tx.query(
        'insert into app.quiz_answers (attempt_id, question_id, option_id, text_answer) values ($1, $2, $3, $4)',
        [rows[0].id, answer.questionId, answer.optionId, answer.text]
      );
    }
    await audit(tx, { actorId: session.user.id, action: 'quiz.submitted', targetType: 'quiz_assignment', targetId: id, ip: clientIp(req) });
  });
  sendJson(res, 200, { ok: true });
}
