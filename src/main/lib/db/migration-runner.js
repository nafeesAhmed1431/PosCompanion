// Generic infra, no app-specific knowledge (it has no idea what tables or
// columns exist) — safe to copy into another Electron/better-sqlite3
// project as-is. Hand-rolled rather than pulling in an external migration
// library, since a small, sync (better-sqlite3) schema doesn't need one.
// Each migration is a plain JS module exporting { id, up(db) }; applied ids
// are recorded in `_migrations` so running the full list on every app boot
// is a no-op once a migration has already applied (idempotent by tracking,
// not by re-checking table state).
export function runMigrations(db, migrations) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

  const applied = new Set(db.prepare('SELECT id FROM _migrations').all().map((row) => row.id))

  const applyOne = db.transaction((migration) => {
    migration.up(db)
    db.prepare('INSERT INTO _migrations (id) VALUES (?)').run(migration.id)
  })

  for (const migration of migrations) {
    if (applied.has(migration.id)) continue
    applyOne(migration)
  }
}
