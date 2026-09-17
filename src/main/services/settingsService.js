import { settingsRepository } from '../db/repositories/settingsRepository.js'
import { getSyncSummary } from './statsService.js'

// Namespaced key inside the generic app_settings kv store (same pattern as
// authStateRepository's 'auth.*' keys). Only the setting itself is
// persisted here — the actual periodic sync timer is Phase 5+ and out of
// scope for this page; this just gives that future engine a value to read.
const SYNC_INTERVAL_KEY = 'sync.interval_minutes'
const DEFAULT_SYNC_INTERVAL_MINUTES = 15

function getSyncSettings() {
  const stored = settingsRepository.getSetting(SYNC_INTERVAL_KEY)
  const intervalMinutes = stored ? Number(stored) : DEFAULT_SYNC_INTERVAL_MINUTES
  return {
    ...getSyncSummary(),
    intervalMinutes: Number.isFinite(intervalMinutes) ? intervalMinutes : DEFAULT_SYNC_INTERVAL_MINUTES
  }
}

function setSyncInterval(minutes) {
  const value = Number(minutes)
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error('Sync interval must be a positive number of minutes.')
  }
  settingsRepository.setSetting(SYNC_INTERVAL_KEY, String(value))
  return getSyncSettings()
}

export const settingsService = { getSyncSettings, setSyncInterval }
