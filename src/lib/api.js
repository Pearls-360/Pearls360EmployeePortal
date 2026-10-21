export class ApiError extends Error {
  /**
   * @param {number} status
   * @param {string} message
   * @param {string | undefined} code
   * @param {Record<string, string> | undefined} fields
   */
  constructor(status, message, code, fields) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

/**
 * JSON call to the portal API. The session lives in an HttpOnly cookie, so no
 * token is ever handled by JavaScript.
 * @param {string} path  e.g. '/auth/login'
 * @param {{ method?: string, body?: unknown, redirectOnAuthError?: boolean }} [options]
 */
export async function api(path, { method = 'GET', body, redirectOnAuthError = true } = {}) {
  let response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? { Accept: 'application/json' } : { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
  } catch {
    throw new ApiError(0, 'We could not reach the server. Check your connection and try again.', 'NETWORK', undefined);
  }

  /** @type {any} */
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const err = data?.error || {};
    const error = new ApiError(response.status, err.message || 'Something went wrong. Please try again.', err.code, err.fields);
    if (redirectOnAuthError && error.code === 'UNAUTHENTICATED') {
      window.location.replace('/auth/login');
    }
    throw error;
  }
  return data;
}
