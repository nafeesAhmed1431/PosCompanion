import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { localApiUrl } from '@shared/index.js'

const AuthContext = createContext(null)

// Single shared auth state instead of every consumer (App's route guard,
// the shell's user-email display) independently fetching /api/auth/me on
// mount — that duplication was also the actual bug reported: neither
// consumer updated on login/logout, so the route guard kept using its
// stale first-load result until a full page reload re-ran the check.
// Login/logout now call setAuthed/setGuest directly so the guard reacts
// immediately, no extra round trip needed.
export function AuthProvider({ children }) {
  const [status, setStatus] = useState('checking') // 'checking' | 'authed' | 'guest'
  const [user, setUser] = useState(null)

  useEffect(() => {
    let cancelled = false
    fetch(localApiUrl('/api/auth/me'))
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled) return
        if (data?.user) {
          setUser(data.user)
          setStatus('authed')
        } else {
          setStatus('guest')
        }
      })
      .catch(() => {
        if (!cancelled) setStatus('guest')
      })
    return () => {
      cancelled = true
    }
  }, [])

  const setAuthed = useCallback((loggedInUser) => {
    setUser(loggedInUser)
    setStatus('authed')
  }, [])

  const setGuest = useCallback(() => {
    setUser(null)
    setStatus('guest')
  }, [])

  return (
    <AuthContext.Provider value={{ status, user, setAuthed, setGuest }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}
