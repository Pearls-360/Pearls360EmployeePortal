-- Display name + profile photo for Admin and Employee accounts.
-- Photos are stored as compressed bytes (set by the API after client-side resize).

alter table app.users
  add column if not exists display_name text
    check (display_name is null or length(btrim(display_name)) between 1 and 100),
  add column if not exists avatar_mime text
    check (avatar_mime is null or avatar_mime in ('image/jpeg', 'image/png', 'image/webp')),
  add column if not exists avatar_bytes bytea
    check (avatar_bytes is null or octet_length(avatar_bytes) <= 512000),
  add column if not exists avatar_updated_at timestamptz;

alter table app.users
  add constraint users_avatar_pair check (
    (avatar_mime is null and avatar_bytes is null)
    or (avatar_mime is not null and avatar_bytes is not null)
  );
