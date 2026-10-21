-- Pearls360 Employee Portal — initial schema.
-- Everything lives in the private `app` schema, which is not exposed through
-- Supabase's Data API. RLS is enabled with no policies as defense in depth:
-- only the server-side connection (table owner) can read or write.

create schema if not exists app;
revoke all on schema app from public;

do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on schema app from %I', r);
    end if;
  end loop;
end $$;

create or replace function app.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Users (credentials + role). password_hash is null until the account owner
-- sets a password through a one-time activation link.
-- ---------------------------------------------------------------------------
create table app.users (
  id                   uuid primary key default gen_random_uuid(),
  email                text not null,
  password_hash        text,
  role                 text not null check (role in ('admin', 'employee')),
  status               text not null default 'pending' check (status in ('pending', 'active', 'inactive')),
  must_change_password boolean not null default false,
  password_changed_at  timestamptz,
  last_login_at        timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint users_email_normalized check (email = lower(btrim(email))),
  constraint users_email_format check (length(email) <= 254 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  constraint users_active_requires_password check (status <> 'active' or password_hash is not null)
);
create unique index users_email_key on app.users (email);
create index users_role_status_idx on app.users (role, status);
create trigger users_set_updated_at before update on app.users
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- Employee profiles (1:1 with employee users)
-- ---------------------------------------------------------------------------
create table app.employee_profiles (
  user_id           uuid primary key references app.users (id) on delete cascade,
  employee_code     text not null,
  first_name        text not null check (length(btrim(first_name)) between 1 and 100),
  last_name         text not null check (length(btrim(last_name)) between 1 and 100),
  phone             text check (phone is null or phone ~ '^\+?[0-9 ()-]{7,20}$'),
  department        text not null check (length(btrim(department)) between 1 and 100),
  designation       text not null check (length(btrim(designation)) between 1 and 100),
  joining_date      date not null,
  employment_status text not null default 'active'
                    check (employment_status in ('active', 'probation', 'on_leave', 'resigned', 'terminated')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint employee_profiles_code_format check (employee_code ~ '^[A-Za-z0-9_-]{2,32}$')
);
create unique index employee_profiles_code_key on app.employee_profiles (upper(employee_code));
create index employee_profiles_name_idx on app.employee_profiles (lower(last_name), lower(first_name));
create index employee_profiles_department_idx on app.employee_profiles (department);
create trigger employee_profiles_set_updated_at before update on app.employee_profiles
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- Sessions. Only a SHA-256 hash of the cookie token is stored.
-- ---------------------------------------------------------------------------
create table app.sessions (
  id             uuid primary key default gen_random_uuid(),
  token_hash     text not null,
  user_id        uuid not null references app.users (id) on delete cascade,
  expires_at     timestamptz not null,
  revoked_at     timestamptz,
  revoked_reason text,
  ip_address     text,
  user_agent     text,
  last_seen_at   timestamptz not null default now(),
  created_at     timestamptz not null default now()
);
create unique index sessions_token_hash_key on app.sessions (token_hash);
create index sessions_user_active_idx on app.sessions (user_id) where revoked_at is null;
create index sessions_expires_at_idx on app.sessions (expires_at);

-- ---------------------------------------------------------------------------
-- One-time tokens for account activation and password reset (hashed).
-- ---------------------------------------------------------------------------
create table app.password_reset_tokens (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references app.users (id) on delete cascade,
  token_hash text not null,
  purpose    text not null check (purpose in ('activation', 'reset')),
  expires_at timestamptz not null,
  used_at    timestamptz,
  revoked_at timestamptz,
  created_by uuid references app.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index password_reset_tokens_hash_key on app.password_reset_tokens (token_hash);
create index password_reset_tokens_open_idx on app.password_reset_tokens (user_id)
  where used_at is null and revoked_at is null;

-- ---------------------------------------------------------------------------
-- Audit log. Metadata must never contain passwords, tokens or hashes.
-- ---------------------------------------------------------------------------
create table app.audit_logs (
  id            bigint generated always as identity primary key,
  actor_user_id uuid references app.users (id) on delete set null,
  action        text not null check (length(action) between 1 and 100),
  target_type   text,
  target_id     text,
  metadata      jsonb not null default '{}'::jsonb,
  ip_address    text,
  created_at    timestamptz not null default now()
);
create index audit_logs_created_at_idx on app.audit_logs (created_at desc);
create index audit_logs_actor_idx on app.audit_logs (actor_user_id);
create index audit_logs_target_idx on app.audit_logs (target_type, target_id);

-- ---------------------------------------------------------------------------
-- Fixed-window rate limit counters (shared across serverless instances).
-- ---------------------------------------------------------------------------
create table app.rate_limits (
  bucket   text primary key,
  hits     integer not null,
  reset_at timestamptz not null
);
create index rate_limits_reset_at_idx on app.rate_limits (reset_at);

-- ---------------------------------------------------------------------------
-- Lock down: RLS on, no policies, no grants to Supabase API roles.
-- ---------------------------------------------------------------------------
alter table app.users enable row level security;
alter table app.employee_profiles enable row level security;
alter table app.sessions enable row level security;
alter table app.password_reset_tokens enable row level security;
alter table app.audit_logs enable row level security;
alter table app.rate_limits enable row level security;

revoke all on all tables in schema app from public;
revoke all on all sequences in schema app from public;
revoke all on all functions in schema app from public;

do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on all tables in schema app from %I', r);
      execute format('revoke all on all sequences in schema app from %I', r);
      execute format('revoke all on all functions in schema app from %I', r);
    end if;
  end loop;
end $$;
