import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AppLogoIcon from '@/components/app-logo-icon'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { localApiUrl } from '@shared/index.js'
import { useAuth } from '@/lib/auth-context'

// Visual layout mirrors snaps_lvl_pos's auth-simple-layout.tsx (centered
// card, brand-gradient glow blobs, no sidebar). Talks to our own local
// Express API (main/api/authRoutes.js), which in turn calls the live
// Laravel server — the renderer never hits Laravel directly.
export default function LoginPage() {
  const navigate = useNavigate()
  const { setAuthed } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  // Set once login succeeds with >1 restaurant — swaps the form for a
  // simple restaurant picker instead of completing the login immediately.
  const [restaurantChoice, setRestaurantChoice] = useState(null)
  const [selectedRestaurantId, setSelectedRestaurantId] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const response = await fetch(localApiUrl('/api/auth/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.message || 'Login failed.')
      }

      if (data.restaurants.length > 1) {
        // login() already picked null in this case — ask the user, then
        // finish via /select-restaurant instead of re-submitting credentials.
        setRestaurantChoice(data.restaurants)
        setSelectedRestaurantId(data.restaurants[0].id)
        return
      }

      // Update the shared auth state immediately rather than letting
      // App's route guard find out via its own next /api/auth/me check —
      // otherwise the guard's stale 'guest' status bounces this navigate
      // straight back to /login until a full page reload.
      setAuthed(data.user)
      navigate('/dashboard')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleConfirmRestaurant(e) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const response = await fetch(localApiUrl('/api/auth/select-restaurant'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restaurant_id: selectedRestaurantId })
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data.message || 'Could not select restaurant.')
      }
      setAuthed(data.user)
      navigate('/dashboard')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative flex min-h-svh flex-col items-center justify-center overflow-hidden bg-background p-6 md:p-10">
      <div className="brand-gradient pointer-events-none absolute -top-32 left-1/2 h-72 w-[36rem] -translate-x-1/2 rounded-full opacity-20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -left-24 h-72 w-72 rounded-full bg-brand-sky opacity-10 blur-3xl" />

      <div className="relative w-full max-w-sm">
        <div className="flex flex-col items-center gap-3">
          <span className="brand-gradient flex size-14 items-center justify-center rounded-2xl shadow-lg shadow-black/20">
            <AppLogoIcon className="size-7 fill-current text-white" />
          </span>
          <span className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
            POS Companion
          </span>
        </div>

        <div className="mt-8 rounded-2xl border border-border bg-card/80 p-8 shadow-xl backdrop-blur-sm">
          {!restaurantChoice ? (
            <>
              <div className="mb-6 space-y-1 text-center">
                <h1 className="text-xl font-semibold">Sign in to this till</h1>
                <p className="text-sm text-balance text-muted-foreground">
                  Use your SnapS POS account credentials.
                </p>
              </div>
              <form className="space-y-4" onSubmit={handleSubmit}>
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="username"
                    placeholder="you@restaurant.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? 'Signing in…' : 'Sign in'}
                </Button>
              </form>
            </>
          ) : (
            <>
              <div className="mb-6 space-y-1 text-center">
                <h1 className="text-xl font-semibold">Choose a restaurant</h1>
                <p className="text-sm text-balance text-muted-foreground">
                  Your account has access to more than one branch.
                </p>
              </div>
              <form className="space-y-4" onSubmit={handleConfirmRestaurant}>
                <div className="space-y-1.5">
                  <Label htmlFor="restaurant">Restaurant</Label>
                  <select
                    id="restaurant"
                    className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs"
                    value={selectedRestaurantId}
                    onChange={(e) => setSelectedRestaurantId(e.target.value)}
                  >
                    {restaurantChoice.map((restaurant) => (
                      <option key={restaurant.id} value={restaurant.id}>
                        {restaurant.name}
                      </option>
                    ))}
                  </select>
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? 'Continuing…' : 'Continue'}
                </Button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
