/**
 * Thin API client.
 *
 * Requests go to a relative /api path: in dev Vite proxies that to the Express
 * process, in production the same Node process serves both. No API base URL is
 * ever baked into the bundle, and no credential is ever reachable from here.
 */

/** Carries the server's HTTP status plus its per-field validation map. */
export class ApiError extends Error {
  constructor(message, { status, code, errors } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status ?? 0;
    this.code = code ?? 'NETWORK_ERROR';
    /** @type {Record<string,string>} */
    this.errors = errors ?? {};
  }
}

async function request(path, { method = 'GET', body, signal } = {}) {
  let response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    throw new ApiError('Could not reach the server. Is the API running on port 4000?');
  }

  if (response.status === 204) return null;

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const err = payload?.error ?? {};
    throw new ApiError(err.message || `Request failed (${response.status}).`, {
      status: response.status,
      code: err.code,
      errors: err.errors,
    });
  }
  return payload;
}

export const api = {
  health: () => request('/health'),
  list: () => request('/invoices'),
  get: (id) => request(`/invoices/${id}`),
  create: (invoice) => request('/invoices', { method: 'POST', body: { invoice } }),
  update: (id, invoice) => request(`/invoices/${id}`, { method: 'PUT', body: { invoice } }),
  remove: (id) => request(`/invoices/${id}`, { method: 'DELETE' }),
  sendEmail: (id, { to, message }) =>
    request(`/invoices/${id}/email`, { method: 'POST', body: { to, message } }),
};
