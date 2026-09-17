import createCoreTables from './001_create_core_tables.js'
import createLocalOnlyTables from './002_create_local_only_tables.js'

// Applied in array order — append new migrations to the end, never reorder
// or edit an already-shipped one (the runner tracks applied ids, not file
// hashes, so an edited migration silently never re-runs on existing DBs).
export const migrations = [createCoreTables, createLocalOnlyTables]
