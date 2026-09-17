import path from 'path'
import { app } from 'electron'
import Database from 'better-sqlite3'
import { runMigrations } from '../lib/db/migration-runner.js'
import { migrations } from './migrations/index.js'

let dbInstance = null

// Lazily opened singleton so repositories can `import { getDb }` without
// needing the Electron app to be ready yet at module-load time (app.getPath
// only works after `app.whenReady()`), while still only opening the file
// once per process.
export function getDb() {
  if (dbInstance) return dbInstance

  const dbPath = path.join(app.getPath('userData'), 'pos-companion.db')
  dbInstance = new Database(dbPath)
  dbInstance.pragma('journal_mode = WAL')
  dbInstance.pragma('foreign_keys = ON')

  runMigrations(dbInstance, migrations)

  return dbInstance
}

export function closeDb() {
  if (dbInstance) {
    dbInstance.close()
    dbInstance = null
  }
}
