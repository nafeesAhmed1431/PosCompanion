import { getDb } from '../index.js'

// Shared CRUD helpers for the "simple table, single-column id PK" shape
// that most syncable entities follow. Every query here is a static,
// parameterized statement (columns come from this module's own fixed
// config, never from caller input), so there is no SQL-injection surface
// even though this data is local-only. Entity repositories are thin
// wrappers around this so each one stays a short, readable file instead of
// re-deriving the same INSERT/UPDATE boilerplate per table.
export function createRepository({ table, idColumn = 'id', columns }) {
  const otherColumns = columns.filter((c) => c !== idColumn)

  function findAll() {
    return getDb()
      .prepare(`SELECT * FROM ${table}`)
      .all()
  }

  function findById(id) {
    return getDb()
      .prepare(`SELECT * FROM ${table} WHERE ${idColumn} = ?`)
      .get(id)
  }

  function findByRestaurant(restaurantId) {
    return getDb()
      .prepare(`SELECT * FROM ${table} WHERE restaurant_id = ?`)
      .all(restaurantId)
  }

  // Upsert by primary key — used both for local writes (POS/orders screens)
  // and for applying a bootstrap pull from the server, since both cases are
  // "this row should now look exactly like this."
  function upsert(row) {
    const insertCols = columns.join(', ')
    const insertPlaceholders = columns.map(() => '?').join(', ')
    const updateAssignments = otherColumns.map((c) => `${c} = excluded.${c}`).join(', ')

    const stmt = getDb().prepare(`
      INSERT INTO ${table} (${insertCols})
      VALUES (${insertPlaceholders})
      ON CONFLICT (${idColumn}) DO UPDATE SET ${updateAssignments}
    `)
    stmt.run(...columns.map((c) => row[c] ?? null))
    return findById(row[idColumn])
  }

  function remove(id) {
    getDb().prepare(`DELETE FROM ${table} WHERE ${idColumn} = ?`).run(id)
  }

  // Marks a row dirty (needs push) without touching synced_at — the sync
  // engine (Phase 5) clears dirty + sets synced_at together once a push
  // actually succeeds.
  function markDirty(id) {
    getDb().prepare(`UPDATE ${table} SET dirty = 1 WHERE ${idColumn} = ?`).run(id)
  }

  function markSynced(id, syncedAt = new Date().toISOString()) {
    getDb()
      .prepare(`UPDATE ${table} SET dirty = 0, synced_at = ? WHERE ${idColumn} = ?`)
      .run(syncedAt, id)
  }

  function findDirty() {
    return getDb()
      .prepare(`SELECT * FROM ${table} WHERE dirty = 1`)
      .all()
  }

  return { findAll, findById, findByRestaurant, upsert, remove, markDirty, markSynced, findDirty }
}
