export const EMPLOYMENT_STATUS_LABELS = {
  active: 'Active',
  probation: 'Probation',
  on_leave: 'On leave',
  resigned: 'Resigned',
  terminated: 'Terminated'
};

export const ACCOUNT_STATUS_LABELS = {
  active: 'Active',
  inactive: 'Inactive',
  pending: 'Awaiting activation'
};

const AUDIT_LABELS = {
  'auth.login': 'Signed in',
  'auth.login_failed': 'Failed sign-in attempt',
  'auth.login_blocked': 'Sign-in blocked (inactive account)',
  'auth.logout': 'Signed out',
  'auth.password_changed': 'Changed password',
  'auth.password_reset_requested': 'Requested a password reset',
  'auth.password_reset_completed': 'Reset password',
  'auth.account_activated': 'Activated account',
  'admin.bootstrap': 'Admin account created',
  'admin.created': 'Administrator created',
  'admin.activated': 'Administrator reactivated',
  'admin.deactivated': 'Administrator deactivated',
  'admin.activation_link_issued': 'Administrator activation link issued',
  'admin.password_reset_initiated': 'Administrator password reset initiated',
  'employee.created': 'Employee created',
  'employee.updated': 'Employee details updated',
  'employee.activated': 'Account activated',
  'employee.deactivated': 'Account deactivated',
  'employee.activation_link_issued': 'Activation link issued',
  'employee.password_reset_initiated': 'Password reset initiated',
  'profile.updated': 'Updated own profile'
};

/** @param {string} action */
export function auditLabel(action) {
  return AUDIT_LABELS[/** @type {keyof typeof AUDIT_LABELS} */ (action)] || action;
}

/** @param {string | null | undefined} iso yyyy-mm-dd */
export function formatDate(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
}

/** @param {string | null | undefined} iso */
export function formatDateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/** @param {string | null | undefined} value */
export function text(value) {
  return value ? value : '—';
}
