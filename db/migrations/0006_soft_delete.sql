-- Soft delete keeps an employee and their invoices recoverable for at least 30 days.
-- Rows stay in place; lists and sign-in ignore deleted_at.

alter table app.users add column deleted_at timestamptz;
alter table app.invoices add column deleted_at timestamptz;

create index users_not_deleted_idx on app.users (role) where deleted_at is null;
create index invoices_not_deleted_idx on app.invoices (employee_id) where deleted_at is null;
