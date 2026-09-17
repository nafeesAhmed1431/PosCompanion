import { settingsRepository } from './settingsRepository.js'

const { getSetting, setSetting, deleteSetting } = settingsRepository

// Namespaced keys inside the generic app_settings kv store. The bearer
// token itself is deliberately NOT one of these — see src/main/auth/
// tokenStore.js for why it lives in an OS-encrypted file instead.
const KEYS = {
  userId: 'auth.user_id',
  userName: 'auth.user_name',
  userEmail: 'auth.user_email',
  role: 'auth.role',
  permissions: 'auth.permissions',
  isSystemRole: 'auth.is_system_role',
  restaurants: 'auth.restaurants',
  selectedRestaurantId: 'auth.selected_restaurant_id',
  hasToken: 'auth.has_token'
}

function saveAuthState({ user, restaurants, selectedRestaurantId, hasToken }) {
  setSetting(KEYS.userId, user.id)
  setSetting(KEYS.userName, user.full_name)
  setSetting(KEYS.userEmail, user.email)
  setSetting(KEYS.role, user.role_name ?? '')
  setSetting(KEYS.permissions, JSON.stringify(user.permissions ?? []))
  setSetting(KEYS.isSystemRole, user.is_system_role ? '1' : '0')
  setSetting(KEYS.restaurants, JSON.stringify(restaurants ?? []))
  if (selectedRestaurantId) {
    setSetting(KEYS.selectedRestaurantId, selectedRestaurantId)
  }
  setSetting(KEYS.hasToken, hasToken ? '1' : '0')
}

function setSelectedRestaurant(restaurantId) {
  setSetting(KEYS.selectedRestaurantId, restaurantId)
}

function getAuthState() {
  if (getSetting(KEYS.hasToken) !== '1') return null

  const userId = getSetting(KEYS.userId)
  if (!userId) return null

  return {
    user: {
      id: userId,
      full_name: getSetting(KEYS.userName),
      email: getSetting(KEYS.userEmail),
      role_name: getSetting(KEYS.role),
      permissions: JSON.parse(getSetting(KEYS.permissions) || '[]'),
      is_system_role: getSetting(KEYS.isSystemRole) === '1'
    },
    restaurants: JSON.parse(getSetting(KEYS.restaurants) || '[]'),
    selectedRestaurantId: getSetting(KEYS.selectedRestaurantId)
  }
}

function clearAuthState() {
  Object.values(KEYS).forEach(deleteSetting)
}

export const authStateRepository = { saveAuthState, setSelectedRestaurant, getAuthState, clearAuthState }
