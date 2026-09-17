import { createSecureFileStore } from '../lib/secure-file-store.js'

// POS-specific wrapper naming what this store holds: the SnapS Sanctum
// bearer token, kept separate from SQLite (see main/db) so the token is
// never sitting in a plain, copyable file. See main/lib/secure-file-store.js
// for the generic encrypt/fallback mechanism this delegates to.
const tokenStore = createSecureFileStore('auth.token')

export function saveToken(token) {
  tokenStore.save(token)
}

export function getToken() {
  return tokenStore.read()
}

export function clearToken() {
  tokenStore.clear()
}
