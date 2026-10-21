import { HttpError } from '../http.js';

const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp']);
export const AVATAR_MAX_BYTES = 512_000;

/**
 * Parses a `data:image/...;base64,...` payload from the client (after resize).
 * @param {unknown} value
 * @returns {{ mime: string, bytes: Buffer } | null} null clears the avatar
 */
export function parseAvatarInput(value) {
  if (value === null || value === '') return null;
  if (typeof value !== 'string') throw new HttpError(422, 'Invalid avatar upload.', { code: 'VALIDATION', fields: { avatar: 'Choose a JPEG, PNG or WebP image.' } });
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\s]+)$/i.exec(value.trim());
  if (!match) {
    throw new HttpError(422, 'Invalid avatar upload.', { code: 'VALIDATION', fields: { avatar: 'Choose a JPEG, PNG or WebP image under 500 KB.' } });
  }
  const mime = match[1].toLowerCase();
  if (!ALLOWED.has(mime)) {
    throw new HttpError(422, 'Invalid avatar upload.', { code: 'VALIDATION', fields: { avatar: 'Use JPEG, PNG or WebP.' } });
  }
  let bytes;
  try {
    bytes = Buffer.from(match[2].replace(/\s+/g, ''), 'base64');
  } catch {
    throw new HttpError(422, 'Invalid avatar upload.', { code: 'VALIDATION', fields: { avatar: 'The image data could not be read.' } });
  }
  if (!bytes.length || bytes.length > AVATAR_MAX_BYTES) {
    throw new HttpError(422, 'Invalid avatar upload.', { code: 'VALIDATION', fields: { avatar: 'Keep the photo under 500 KB.' } });
  }
  return { mime, bytes };
}

/**
 * @param {import('../db.js').Queryable} db
 * @param {string} userId
 * @param {{ mime: string, bytes: Buffer } | null} avatar
 */
export async function setUserAvatar(db, userId, avatar) {
  if (avatar === null) {
    await db.query(
      'update app.users set avatar_mime = null, avatar_bytes = null, avatar_updated_at = null where id = $1',
      [userId]
    );
    return;
  }
  await db.query(
    'update app.users set avatar_mime = $2, avatar_bytes = $3, avatar_updated_at = now() where id = $1',
    [userId, avatar.mime, avatar.bytes]
  );
}

/** @param {import('../db.js').Queryable} db @param {string} userId */
export async function loadUserAvatar(db, userId) {
  const { rows } = await db.query(
    'select avatar_mime, avatar_bytes, avatar_updated_at from app.users where id = $1',
    [userId]
  );
  const row = rows[0];
  if (!row?.avatar_bytes || !row.avatar_mime) return null;
  return {
    mime: row.avatar_mime,
    bytes: Buffer.isBuffer(row.avatar_bytes) ? row.avatar_bytes : Buffer.from(row.avatar_bytes),
    updatedAt: row.avatar_updated_at
  };
}

/** Cache-busting query value for avatar URLs. @param {string | Date | null | undefined} updatedAt */
export function avatarVersion(updatedAt) {
  if (!updatedAt) return '0';
  return String(new Date(updatedAt).getTime());
}
