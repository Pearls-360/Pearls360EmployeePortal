-- The top-bar clock follows the account, not the browser.

alter table app.users
  add column if not exists timezone text not null default 'America/New_York';
