-- Library and resource files may be any document type. The old check
-- only allowed PDF and a few images.

alter table app.documents drop constraint if exists documents_mime_check;

alter table app.documents
  add constraint documents_mime_format
  check (
    char_length(mime) between 3 and 180
    and mime ~ '^[a-z0-9][a-z0-9.+-]{0,127}/[a-z0-9][a-z0-9.+-]{0,127}$'
  );
