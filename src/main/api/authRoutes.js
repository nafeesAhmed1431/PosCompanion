import { Router } from 'express'
import { login, logout, selectRestaurant, getCurrentSession } from '../auth/authService.js'

export const authRouter = Router()

authRouter.post('/login', async (req, res) => {
  const { email, password } = req.body ?? {}
  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required.' })
  }

  try {
    const result = await login(email, password)
    res.json(result)
  } catch (err) {
    res.status(401).json({ message: err.message })
  }
})

// Separate from /login so the renderer can show a restaurant picker after a
// successful login (when the account has access to more than one) without
// re-submitting credentials.
authRouter.post('/select-restaurant', (req, res) => {
  const { restaurant_id: restaurantId } = req.body ?? {}
  if (!restaurantId) {
    return res.status(400).json({ message: 'restaurant_id is required.' })
  }
  res.json(selectRestaurant(restaurantId))
})

authRouter.post('/logout', async (req, res) => {
  await logout()
  res.json({ success: true })
})

// Polled by the renderer's auth guard on app start to decide whether to
// redirect to /login or allow the shell routes.
authRouter.get('/me', (req, res) => {
  const session = getCurrentSession()
  if (!session) return res.status(401).json({ message: 'Not logged in.' })
  res.json(session)
})
