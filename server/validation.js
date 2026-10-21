import { HttpError } from './http.js';

export const EMPLOYMENT_STATUSES = ['active', 'probation', 'on_leave', 'resigned', 'terminated'];

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^\+?[0-9 ()-]{7,20}$/;
const EMPLOYEE_CODE = /^[A-Za-z0-9_-]{2,32}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** @param {unknown} v */
const str = (v) => (typeof v === 'string' ? v.trim() : '');

/** @param {unknown} value */
export function normalizeEmail(value) {
  return str(value).toLowerCase();
}

/** @param {unknown} value */
export function isValidEmail(value) {
  const email = normalizeEmail(value);
  return email.length > 0 && email.length <= 254 && EMAIL.test(email);
}

/** @param {unknown} value */
/** @param {unknown} value @param {string} [message] */
export function assertUuid(value, message = 'Employee not found.') {
  if (typeof value !== 'string' || !UUID.test(value)) throw new HttpError(404, message);
  return value;
}

/** @param {string} value */
function isRealDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

const FIELDS = {
  firstName: { label: 'First name', max: 100 },
  lastName: { label: 'Last name', max: 100 },
  department: { label: 'Department', max: 100 },
  designation: { label: 'Job title', max: 100 }
};

/**
 * Validates admin-supplied employee data.
 * @param {Record<string, unknown>} body
 * @param {{ partial?: boolean }} [opts] partial = update (only provided keys)
 */
export function validateEmployeeInput(body, { partial = false } = {}) {
  /** @type {Record<string, string>} */
  const errors = {};
  /** @type {Record<string, string | null>} */
  const data = {};
  const has = (key) => !partial || Object.prototype.hasOwnProperty.call(body, key);

  for (const [key, { label, max }] of Object.entries(FIELDS)) {
    if (!has(key)) continue;
    const value = str(body[key]);
    if (!value) errors[key] = `${label} is required.`;
    else if (value.length > max) errors[key] = `${label} must be ${max} characters or fewer.`;
    else data[key] = value;
  }

  if (has('email')) {
    if (!isValidEmail(body.email)) errors.email = 'Enter a valid email address.';
    else data.email = normalizeEmail(body.email);
  }

  if (has('employeeCode')) {
    const code = str(body.employeeCode).toUpperCase();
    if (!EMPLOYEE_CODE.test(code)) errors.employeeCode = 'Use 2–32 letters, numbers, dashes or underscores.';
    else data.employeeCode = code;
  }

  if (has('phone')) {
    const phone = str(body.phone);
    if (phone && !PHONE.test(phone)) errors.phone = 'Enter a valid phone number.';
    else data.phone = phone || null;
  }

  if (has('joiningDate')) {
    const date = str(body.joiningDate);
    if (!isRealDate(date)) errors.joiningDate = 'Enter a valid joining date.';
    else data.joiningDate = date;
  }

  if (has('employmentStatus')) {
    const status = str(body.employmentStatus);
    if (!EMPLOYMENT_STATUSES.includes(status)) errors.employmentStatus = 'Choose an employment status.';
    else data.employmentStatus = status;
  }

  if (Object.keys(errors).length) {
    throw new HttpError(422, 'Please correct the highlighted fields.', { code: 'VALIDATION', fields: errors });
  }
  return data;
}

/**
 * Validates an invitation for a new administrator. They receive the same role
 * as the admin who creates them.
 * @param {Record<string, unknown>} body
 */
export function validateAdminInvite(body) {
  /** @type {Record<string, string>} */
  const errors = {};
  const firstName = str(body.firstName);
  const lastName = str(body.lastName);
  if (!firstName) errors.firstName = 'First name is required.';
  else if (firstName.length > 100) errors.firstName = 'First name must be 100 characters or fewer.';
  if (!lastName) errors.lastName = 'Last name is required.';
  else if (lastName.length > 100) errors.lastName = 'Last name must be 100 characters or fewer.';
  if (!isValidEmail(body.email)) errors.email = 'Enter a valid email address.';

  const displayName = `${firstName} ${lastName}`.trim();
  if (!errors.firstName && !errors.lastName && displayName.length > 100) {
    errors.firstName = 'Name must be 100 characters or fewer.';
  }

  if (Object.keys(errors).length) {
    throw new HttpError(422, 'Please correct the highlighted fields.', { code: 'VALIDATION', fields: errors });
  }
  return { firstName, lastName, email: normalizeEmail(body.email), displayName };
}

/**
 * Fields an employee may change on their own profile (partial).
 * @param {Record<string, unknown>} body
 */
export function validateSelfProfileInput(body) {
  /** @type {Record<string, string>} */
  const errors = {};
  /** @type {{ phone?: string | null, firstName?: string, lastName?: string, avatar?: unknown, clearAvatar?: boolean }} */
  const data = {};

  if (Object.prototype.hasOwnProperty.call(body, 'phone')) {
    const phone = str(body.phone);
    if (phone && !PHONE.test(phone)) errors.phone = 'Enter a valid phone number.';
    else data.phone = phone || null;
  }
  if (Object.prototype.hasOwnProperty.call(body, 'firstName')) {
    const value = str(body.firstName);
    if (!value) errors.firstName = 'First name is required.';
    else if (value.length > 100) errors.firstName = 'First name must be 100 characters or fewer.';
    else data.firstName = value;
  }
  if (Object.prototype.hasOwnProperty.call(body, 'lastName')) {
    const value = str(body.lastName);
    if (!value) errors.lastName = 'Last name is required.';
    else if (value.length > 100) errors.lastName = 'Last name must be 100 characters or fewer.';
    else data.lastName = value;
  }
  if (Object.prototype.hasOwnProperty.call(body, 'avatar')) data.avatar = body.avatar;
  if (body.clearAvatar === true) data.clearAvatar = true;

  if (Object.keys(errors).length) {
    throw new HttpError(422, 'Please correct the highlighted fields.', { code: 'VALIDATION', fields: errors });
  }
  if (!Object.keys(data).length) {
    throw new HttpError(422, 'Nothing to update.', { code: 'VALIDATION' });
  }
  return data;
}

/**
 * Fields an admin may change on their own account (partial).
 * @param {Record<string, unknown>} body
 */
export function validateAdminSelfProfileInput(body) {
  /** @type {Record<string, string>} */
  const errors = {};
  /** @type {{ displayName?: string | null, avatar?: unknown, clearAvatar?: boolean }} */
  const data = {};

  if (Object.prototype.hasOwnProperty.call(body, 'displayName')) {
    const value = str(body.displayName);
    if (value && value.length > 100) errors.displayName = 'Display name must be 100 characters or fewer.';
    else data.displayName = value || null;
  }
  if (Object.prototype.hasOwnProperty.call(body, 'avatar')) data.avatar = body.avatar;
  if (body.clearAvatar === true) data.clearAvatar = true;

  if (Object.keys(errors).length) {
    throw new HttpError(422, 'Please correct the highlighted fields.', { code: 'VALIDATION', fields: errors });
  }
  if (!Object.keys(data).length) {
    throw new HttpError(422, 'Nothing to update.', { code: 'VALIDATION' });
  }
  return data;
}
