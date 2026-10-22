-- Training quizzes assigned to employees, with a submission and an admin score.

create table app.quizzes (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (length(btrim(title)) between 1 and 160),
  created_by  uuid references app.users (id) on delete set null,
  created_at  timestamptz not null default now()
);

create table app.quiz_questions (
  id        uuid primary key default gen_random_uuid(),
  quiz_id   uuid not null references app.quizzes (id) on delete cascade,
  position  integer not null check (position >= 0),
  kind      text not null check (kind in ('choice', 'text')),
  prompt    text not null check (length(btrim(prompt)) between 1 and 500),
  unique (quiz_id, position)
);

create table app.quiz_options (
  id           uuid primary key default gen_random_uuid(),
  question_id  uuid not null references app.quiz_questions (id) on delete cascade,
  position     integer not null check (position >= 0),
  label        text not null check (length(btrim(label)) between 1 and 200),
  unique (question_id, position)
);

create table app.quiz_assignments (
  id           uuid primary key default gen_random_uuid(),
  quiz_id      uuid not null references app.quizzes (id) on delete cascade,
  employee_id  uuid not null references app.users (id) on delete cascade,
  assigned_by  uuid references app.users (id) on delete set null,
  assigned_at  timestamptz not null default now(),
  unique (quiz_id, employee_id)
);

create table app.quiz_attempts (
  id              uuid primary key default gen_random_uuid(),
  assignment_id   uuid not null unique references app.quiz_assignments (id) on delete cascade,
  submitted_at    timestamptz not null default now(),
  score           numeric(7, 2) check (score is null or (score >= 0 and score <= 1000)),
  scored_at       timestamptz,
  scored_by       uuid references app.users (id) on delete set null
);

create table app.quiz_answers (
  id           uuid primary key default gen_random_uuid(),
  attempt_id   uuid not null references app.quiz_attempts (id) on delete cascade,
  question_id  uuid not null references app.quiz_questions (id) on delete cascade,
  option_id    uuid references app.quiz_options (id) on delete set null,
  text_answer  text check (text_answer is null or length(text_answer) <= 2000),
  unique (attempt_id, question_id)
);

create index quiz_assignments_employee_idx on app.quiz_assignments (employee_id);
