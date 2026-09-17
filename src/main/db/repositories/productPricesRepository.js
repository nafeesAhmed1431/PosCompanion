import { getDb } from '../index.js'

// product_prices has a composite PK (product_id, price_level_id), so it
// doesn't fit createRepository's single-id-column assumption — kept as a
// small standalone repository instead of forcing the shared factory to
// support composite keys for this one table.
function findByProduct(productId) {
  return getDb().prepare('SELECT * FROM product_prices WHERE product_id = ?').all(productId)
}

function findOne(productId, priceLevelId) {
  return getDb()
    .prepare('SELECT * FROM product_prices WHERE product_id = ? AND price_level_id = ?')
    .get(productId, priceLevelId)
}

function upsert({ product_id: productId, price_level_id: priceLevelId, price, synced_at: syncedAt, dirty }) {
  getDb()
    .prepare(
      `INSERT INTO product_prices (product_id, price_level_id, price, synced_at, dirty)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (product_id, price_level_id) DO UPDATE SET
         price = excluded.price,
         synced_at = excluded.synced_at,
         dirty = excluded.dirty`
    )
    .run(productId, priceLevelId, price, syncedAt ?? null, dirty ?? 0)
  return findOne(productId, priceLevelId)
}

function remove(productId, priceLevelId) {
  getDb()
    .prepare('DELETE FROM product_prices WHERE product_id = ? AND price_level_id = ?')
    .run(productId, priceLevelId)
}

export const productPricesRepository = { findByProduct, findOne, upsert, remove }
