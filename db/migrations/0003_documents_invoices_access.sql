-- Library documents, team resources, employee invoices, and leadership access.
-- File bytes live in Postgres so they survive deploys. The private app schema
-- stays closed to the Supabase Data API.

create table app.documents (
  id            uuid primary key default gen_random_uuid(),
  kind          text not null check (kind in ('library', 'resource')),
  title         text not null check (length(btrim(title)) between 1 and 160),
  category      text check (category is null or length(btrim(category)) between 1 and 80),
  file_name     text not null check (length(btrim(file_name)) between 1 and 180),
  mime          text not null check (mime in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
  byte_size     integer not null check (byte_size > 0 and byte_size <= 2000000),
  file_bytes    bytea not null,
  visibility    text not null default 'company' check (visibility in ('company', 'leadership')),
  uploaded_by   uuid references app.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint documents_size_matches check (octet_length(file_bytes) = byte_size)
);
create index documents_kind_created_idx on app.documents (kind, created_at desc);
create index documents_visibility_idx on app.documents (visibility);
create trigger documents_set_updated_at before update on app.documents
  for each row execute function app.set_updated_at();

create table app.leadership_access (
  user_id     uuid primary key references app.users (id) on delete cascade,
  granted_by  uuid references app.users (id) on delete set null,
  created_at  timestamptz not null default now()
);

create table app.invoices (
  id              uuid primary key default gen_random_uuid(),
  employee_id     uuid not null references app.users (id) on delete restrict,
  invoice_number  text not null check (invoice_number ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$'),
  description     text not null check (length(btrim(description)) between 1 and 240),
  amount          numeric(14, 2) not null check (amount >= 0 and amount <= 9999999999.99),
  currency        text not null check (currency ~ '^[A-Z]{3}$'),
  status          text not null default 'open' check (status in ('draft', 'open', 'paid', 'void')),
  issued_on       date not null,
  due_on          date,
  created_by      uuid references app.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint invoices_due_after_issue check (due_on is null or due_on >= issued_on)
);
create unique index invoices_number_key on app.invoices (upper(invoice_number));
create index invoices_employee_idx on app.invoices (employee_id, issued_on desc);
create index invoices_status_idx on app.invoices (status);
create trigger invoices_set_updated_at before update on app.invoices
  for each row execute function app.set_updated_at();

alter table app.documents enable row level security;
alter table app.leadership_access enable row level security;
alter table app.invoices enable row level security;

revoke all on app.documents, app.leadership_access, app.invoices from public;

do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on app.documents, app.leadership_access, app.invoices from %I', r);
    end if;
  end loop;
end $$;
