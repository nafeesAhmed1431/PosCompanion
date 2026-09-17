import os from 'os'
import { LARAVEL_API_URL, API_V1_PATH } from '../config.js'
import { saveToken, getToken, clearToken } from './tokenStore.js'
import { authStateRepository } from '../db/repositories/authStateRepository.js'

// Tied to the till's hostname (rather than e.g. a random per-install id) so
// the server's "one live token per device_name" rule (AuthController::login
// deletes any existing token for that name before issuing a new one) does
// what we actually want: re-logging in on the SAME physical till replaces
// its old token instead of accumulating an unbounded number of live tokens
// for one machine.
function getDeviceName() {
  return `PosCompanion-${os.hostname()}`
}

async function postJson(pathname, { body, token } = {}) {
  const headers = { Accept: 'application/json' }
  if (body) headers['Content-Type'] = 'application/json'
  if (token) headers.Authorization = `Bearer ${token}`

  return fetch(`${LARAVEL_API_URL}${pathname}`, {
    method: 'POST',
    headers,
    body: body ? JSON.stringify(body) : undefined
  })
}

export async function login(email, password) {
  let response
  try {
    response = await postJson(`${API_V1_PATH}/login`, {
      body: { email, password, device_name: getDeviceName() }
    })
  } catch {
    throw new Error('Could not reach the SnapS POS server. Check your network connection.')
  }

  if (!response.ok) {
    // Laravel returns 422 with {message, errors} for bad credentials/lockout
    // (and 429-style throttling via the same shape) — surface only the
    // human-readable message, never the raw validation payload.
    let message = 'Login failed. Please check your email and password.'
    try {
      const body = await response.json()
      if (body?.message) message = body.message
    } catch {
      // Unparsable/empty error body — keep the generic message.
    }
    throw new Error(message)
  }

  const data = await response.json()
  const restaurants = data.restaurants ?? []
  // Auto-pick when there's only one restaurant so single-branch users never
  // see a picker with one option in it; multi-branch users choose via
  // POST /api/auth/select-restaurant from the renderer.
  const selectedRestaurantId = restaurants.length === 1 ? restaurants[0].id : null

  saveToken(data.token)
  authStateRepository.saveAuthState({
    user: data.user,
    restaurants,
    selectedRestaurantId,
    hasToken: true
  })

  return { user: data.user, restaurants, selectedRestaurantId }
}

export function selectRestaurant(restaurantId) {
  authStateRepository.setSelectedRestaurant(restaurantId)
  return authStateRepository.getAuthState()
}

export async function logout() {
  const token = getToken()
  if (token) {
    try {
      await postJson(`${API_V1_PATH}/logout`, { token })
    } catch {
      // Best-effort — if the till is offline right now, the server-side
      // token simply gets replaced next time this device_name logs in
      // again, rather than being explicitly revoked immediately.
    }
  }
  clearToken()
  authStateRepository.clearAuthState()
}

export function getCurrentSession() {
  return authStateRepository.getAuthState()
}

// Used by later phases (bootstrap sync, orders/customers API calls) to
// attach the two headers every authenticated Laravel request needs.
export function getAuthHeaders() {
  const token = getToken()
  const session = authStateRepository.getAuthState()
  if (!token || !session?.selectedRestaurantId) return null

  return {
    Authorization: `Bearer ${token}`,
    'X-Restaurant-Id': session.selectedRestaurantId
  }
}
