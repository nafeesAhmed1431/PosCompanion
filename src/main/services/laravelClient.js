import { LARAVEL_API_URL } from '../config.js'

// Generic authed-fetch wrapper, pulled out of authService.js's own private
// `postJson` since bootstrap sync (and, later, Orders/Customers sync) all
// need the exact same "prefix the base URL, send Accept: application/json,
// attach whatever auth headers the caller already resolved" shape — no
// point re-deriving that per service. Callers own header resolution (e.g.
// authService.getAuthHeaders()) since only they know whether a request
// needs auth at all.
export async function authedFetch(pathname, { method = 'GET', headers, body } = {}) {
  const finalHeaders = { Accept: 'application/json', ...headers }
  if (body !== undefined) finalHeaders['Content-Type'] = 'application/json'

  return fetch(`${LARAVEL_API_URL}${pathname}`, {
    method,
    headers: finalHeaders,
    body: body !== undefined ? JSON.stringify(body) : undefined
  })
}
