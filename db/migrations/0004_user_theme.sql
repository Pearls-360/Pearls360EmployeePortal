-- Appearance preference belongs to the account, not the browser.

alter table app.users
  add column if not exists theme text not null default 'light'
    check (theme in ('light', 'dark'));
