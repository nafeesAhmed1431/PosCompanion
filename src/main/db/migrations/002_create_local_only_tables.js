export default {
  id: '002_create_local_only_tables',
  up(db) {
    db.exec(`
      -- Printer profiles are hardware attached to THIS till and never mean
      -- anything on another machine or the server, so this table
      -- deliberately has no synced_at/dirty columns — it is excluded from
      -- the sync engine entirely, not just currently unsynced.
      CREATE TABLE printers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL,               -- 'usb' | 'serial' | 'network'
        connection_config TEXT NOT NULL,  -- JSON: {vendorId,productId} | {path,baudRate} | {ip,port}
        ticket_type TEXT NOT NULL,        -- 'receipt' | 'kitchen'
        is_default INTEGER NOT NULL DEFAULT 0
      );

      -- Generic key/value store for local-device state that doesn't warrant
      -- its own table: logged-in user snapshot, selected restaurant, and a
      -- has-token flag. The actual bearer token is never written here — see
      -- src/main/auth/tokenStore.js for why it lives in an OS-encrypted
      -- file instead of plain SQLite.
      CREATE TABLE app_settings (
        key TEXT PRIMARY KEY,
        value TEXT
      );
    `)
  }
}
