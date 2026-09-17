// Every syncable table gets the same two trailing columns (per the sync
// design in the build plan): `synced_at` (null until pushed/pulled
// successfully) and `dirty` (set on local writes, cleared once synced).
// Kept as one constant so the columns can't drift table-to-table.
const SYNC_COLUMNS = `
  synced_at TEXT,
  dirty INTEGER NOT NULL DEFAULT 0
`

export default {
  id: '001_create_core_tables',
  up(db) {
    db.exec(`
      -- Single pinned row for this till's branch/tenant. id matches the
      -- server's restaurant id directly (UUID PKs throughout, per memory),
      -- so no local/server id mapping is ever needed.
      CREATE TABLE restaurants (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        address TEXT,
        phone TEXT,
        is_active INTEGER NOT NULL DEFAULT 1,
        supports_dine_in INTEGER NOT NULL DEFAULT 1,
        supports_takeaway INTEGER NOT NULL DEFAULT 1,
        supports_delivery INTEGER NOT NULL DEFAULT 1,
        default_price_level_id TEXT,
        agent_token TEXT,
        ${SYNC_COLUMNS}
      );

      CREATE TABLE categories (
        id TEXT PRIMARY KEY,
        restaurant_id TEXT NOT NULL,
        name TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        ${SYNC_COLUMNS}
      );
      CREATE INDEX idx_categories_restaurant ON categories(restaurant_id);

      CREATE TABLE products (
        id TEXT PRIMARY KEY,
        restaurant_id TEXT NOT NULL,
        category_id TEXT,
        name TEXT NOT NULL,
        sku TEXT,
        image_url TEXT,
        price REAL NOT NULL DEFAULT 0,
        tax_rate REAL NOT NULL DEFAULT 0,
        is_active INTEGER NOT NULL DEFAULT 1,
        is_refundable INTEGER NOT NULL DEFAULT 1,
        is_ready_to_sale INTEGER NOT NULL DEFAULT 1,
        ${SYNC_COLUMNS}
      );
      CREATE INDEX idx_products_restaurant ON products(restaurant_id);
      CREATE INDEX idx_products_category ON products(category_id);

      -- Composite PK matches the server's product_prices table exactly
      -- (product_id + price_level_id), so upserts from a bootstrap pull are
      -- a plain INSERT ... ON CONFLICT without a synthetic local id.
      CREATE TABLE product_prices (
        product_id TEXT NOT NULL,
        price_level_id TEXT NOT NULL,
        price REAL NOT NULL,
        ${SYNC_COLUMNS},
        PRIMARY KEY (product_id, price_level_id)
      );

      CREATE TABLE price_levels (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        ${SYNC_COLUMNS}
      );

      CREATE TABLE customers (
        id TEXT PRIMARY KEY,
        restaurant_id TEXT NOT NULL,
        name TEXT NOT NULL,
        phone TEXT,
        address TEXT,
        default_price_level_id TEXT,
        customer_code TEXT,
        ${SYNC_COLUMNS}
      );
      CREATE INDEX idx_customers_restaurant ON customers(restaurant_id);

      CREATE TABLE restaurant_tables (
        id TEXT PRIMARY KEY,
        restaurant_id TEXT NOT NULL,
        name TEXT NOT NULL,
        seats INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'free',
        ${SYNC_COLUMNS}
      );
      CREATE INDEX idx_tables_restaurant ON restaurant_tables(restaurant_id);

      CREATE TABLE shifts (
        id TEXT PRIMARY KEY,
        restaurant_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        label TEXT,
        opening_balance REAL NOT NULL DEFAULT 0,
        closing_balance REAL,
        opened_at TEXT NOT NULL,
        closed_at TEXT,
        status TEXT NOT NULL DEFAULT 'open',
        ${SYNC_COLUMNS}
      );
      CREATE INDEX idx_shifts_restaurant ON shifts(restaurant_id);

      CREATE TABLE payment_methods (
        id TEXT PRIMARY KEY,
        restaurant_id TEXT NOT NULL,
        code TEXT NOT NULL,
        label TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        sort_order INTEGER NOT NULL DEFAULT 0,
        ${SYNC_COLUMNS}
      );
      CREATE INDEX idx_payment_methods_restaurant ON payment_methods(restaurant_id);

      -- idempotency_key unique constraint mirrors the server's own backstop
      -- (unique index + QueryException catch in OrderService) so a retried
      -- sync push can never double-create an order, offline or online.
      CREATE TABLE orders (
        id TEXT PRIMARY KEY,
        restaurant_id TEXT NOT NULL,
        order_no INTEGER,
        order_type TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'open',
        parent_order_id TEXT,
        idempotency_key TEXT NOT NULL UNIQUE,
        table_id TEXT,
        customer_id TEXT,
        subtotal REAL NOT NULL DEFAULT 0,
        discount REAL NOT NULL DEFAULT 0,
        tax REAL NOT NULL DEFAULT 0,
        service_charge REAL NOT NULL DEFAULT 0,
        total REAL NOT NULL DEFAULT 0,
        payment_method TEXT,
        note TEXT,
        created_at TEXT NOT NULL,
        created_by TEXT,
        shift_id TEXT,
        ${SYNC_COLUMNS}
      );
      CREATE INDEX idx_orders_restaurant ON orders(restaurant_id);
      CREATE INDEX idx_orders_shift ON orders(shift_id);

      -- name/unit_price/is_refundable are snapshots taken at order time (per
      -- memory: server does the same in OrderService) — never re-read from
      -- the live products table, so a later price change never mutates a
      -- past order.
      CREATE TABLE order_items (
        id TEXT PRIMARY KEY,
        restaurant_id TEXT NOT NULL,
        order_id TEXT NOT NULL,
        product_id TEXT,
        name TEXT NOT NULL,
        note TEXT,
        qty REAL NOT NULL DEFAULT 1,
        unit_price REAL NOT NULL DEFAULT 0,
        line_total REAL NOT NULL DEFAULT 0,
        refunded_qty REAL NOT NULL DEFAULT 0,
        is_refundable INTEGER NOT NULL DEFAULT 1,
        ${SYNC_COLUMNS}
      );
      CREATE INDEX idx_order_items_order ON order_items(order_id);

      CREATE TABLE order_payments (
        id TEXT PRIMARY KEY,
        order_id TEXT NOT NULL,
        method TEXT NOT NULL,
        amount REAL NOT NULL DEFAULT 0,
        tendered_amount REAL,
        change_amount REAL,
        ${SYNC_COLUMNS}
      );
      CREATE INDEX idx_order_payments_order ON order_payments(order_id);
    `)
  }
}
