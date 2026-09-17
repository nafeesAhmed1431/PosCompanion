import { getDb } from '../index.js'

// Generic key/value store backing app_settings — used directly by
// authStateRepository below, and available for any other small piece of
// local device state that doesn't warrant its own table.
function setSetting(key, value) {
  getDb()
    .prepare(
      `INSERT INTO app_settings (key, value) VALUES (?, ?)
       ON CONFLICT (key) DO UPDATE SET value = excluded.value`
    )
    .run(key, value === null || value === undefined ? null : String(value))
}

function getSetting(key) {
  const row = getDb().prepare('SELECT value FROM app_settings WHERE key = ?').get(key)
  return row ? row.value : null
}

function deleteSetting(key) {
  getDb().prepare('DELETE FROM app_settings WHERE key = ?').run(key)
}

export const settingsRepository = { setSetting, getSetting, deleteSetting }
