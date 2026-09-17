import { getDb } from '../index.js'

// Local-only table (no restaurant_id, no synced_at/dirty — see migration
// 002) so this repository is a plain standalone CRUD, not built on
// createRepository's sync-aware helpers which assume those columns exist.
function findAll() {
  return getDb().prepare('SELECT * FROM printers').all()
}

function findById(id) {
  return getDb().prepare('SELECT * FROM printers WHERE id = ?').get(id)
}

function findDefaultForTicketType(ticketType) {
  return getDb()
    .prepare('SELECT * FROM printers WHERE ticket_type = ? AND is_default = 1 LIMIT 1')
    .get(ticketType)
}

function upsert(row) {
  getDb()
    .prepare(
      `INSERT INTO printers (id, name, type, connection_config, ticket_type, is_default)
       VALUES (@id, @name, @type, @connection_config, @ticket_type, @is_default)
       ON CONFLICT (id) DO UPDATE SET
         name = excluded.name,
         type = excluded.type,
         connection_config = excluded.connection_config,
         ticket_type = excluded.ticket_type,
         is_default = excluded.is_default`
    )
    .run({ is_default: 0, ...row })
  return findById(row.id)
}

function remove(id) {
  getDb().prepare('DELETE FROM printers WHERE id = ?').run(id)
}

export const printersRepository = { findAll, findById, findDefaultForTicketType, upsert, remove }
