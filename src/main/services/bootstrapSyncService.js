import { API_V1_PATH } from '../config.js'
import { getAuthHeaders, getCurrentSession } from '../auth/authService.js'
import { authedFetch } from './laravelClient.js'
import { categoriesRepository } from '../db/repositories/categoriesRepository.js'
import { productsRepository } from '../db/repositories/productsRepository.js'
import { productPricesRepository } from '../db/repositories/productPricesRepository.js'
import { priceLevelsRepository } from '../db/repositories/priceLevelsRepository.js'
import { customersRepository } from '../db/repositories/customersRepository.js'
import { tablesRepository } from '../db/repositories/tablesRepository.js'
import { paymentMethodsRepository } from '../db/repositories/paymentMethodsRepository.js'

// GET /api/v1/pos/bootstrap (PosController::index, the wantsJson() branch)
// returns everything the POS/Menu screens need in one call: full Eloquent
// model dumps for categories/products/tables/customers (so they already
// carry their own `restaurant_id`/etc. columns as-is), a flat
// {product_id, price_level_id, price} array for product_prices (no
// synthetic id needed — same composite key as the local table), and
// `paymentMethods` as plain [{code, label}] pairs with NO id at all (that
// endpoint reuses PosController::activePaymentMethods(), which only ever
// fed a checkout dropdown server-side and was never meant to be synced as
// rows) — see upsertPaymentMethods() below for how that's handled locally.

function nowIso() {
  return new Date().toISOString()
}

function upsertCategories(categories, syncedAt) {
  for (const c of categories) {
    categoriesRepository.upsert({
      id: c.id,
      restaurant_id: c.restaurant_id,
      name: c.name,
      sort_order: c.sort_order,
      synced_at: syncedAt,
      dirty: 0
    })
  }
  return categories.length
}

function upsertProducts(products, syncedAt) {
  for (const p of products) {
    productsRepository.upsert({
      id: p.id,
      restaurant_id: p.restaurant_id,
      category_id: p.category_id ?? null,
      name: p.name,
      sku: p.sku ?? null,
      image_url: p.image_url ?? null,
      // Laravel's decimal cast serializes these as numeric-looking strings
      // (e.g. "28.00") in JSON — coerced to Number here rather than relying
      // on SQLite's REAL column-affinity auto-conversion, so the value in
      // the DB (and anything reading it back in JS) is unambiguously a
      // number straight away.
      price: Number(p.price),
      tax_rate: Number(p.tax_rate),
      is_active: p.is_active ? 1 : 0,
      is_refundable: p.is_refundable ? 1 : 0,
      is_ready_to_sale: p.is_ready_to_sale ? 1 : 0,
      synced_at: syncedAt,
      dirty: 0
    })
  }
  return products.length
}

function upsertProductPrices(priceOverrides, syncedAt) {
  for (const po of priceOverrides) {
    productPricesRepository.upsert({
      product_id: po.product_id,
      price_level_id: po.price_level_id,
      price: Number(po.price),
      synced_at: syncedAt,
      dirty: 0
    })
  }
  return priceOverrides.length
}

function upsertPriceLevels(priceLevels, syncedAt) {
  for (const pl of priceLevels) {
    priceLevelsRepository.upsert({
      id: pl.id,
      name: pl.name,
      sort_order: pl.sort_order,
      synced_at: syncedAt,
      dirty: 0
    })
  }
  return priceLevels.length
}

function upsertCustomers(customers, syncedAt) {
  for (const c of customers) {
    customersRepository.upsert({
      id: c.id,
      restaurant_id: c.restaurant_id,
      name: c.name,
      phone: c.phone ?? null,
      address: c.address ?? null,
      default_price_level_id: c.default_price_level_id ?? null,
      customer_code: c.customer_code,
      synced_at: syncedAt,
      dirty: 0
    })
  }
  return customers.length
}

function upsertTables(tables, syncedAt) {
  for (const t of tables) {
    tablesRepository.upsert({
      id: t.id,
      restaurant_id: t.restaurant_id,
      name: t.name,
      seats: t.seats,
      status: t.status,
      synced_at: syncedAt,
      dirty: 0
    })
  }
  return tables.length
}

// `paymentMethods` in the bootstrap payload is [{code, label}] with no id
// and no restaurant_id — it comes from PosController::activePaymentMethods,
// which was built only to feed a checkout dropdown, not as syncable rows.
// The local `payment_methods` table still needs a PK, so we synthesize a
// stable one from (restaurantId, code) — deterministic and idempotent
// across repeated bootstrap pulls, unlike e.g. a random uuid per pull which
// would create a new row every time instead of updating the same one.
function upsertPaymentMethods(paymentMethods, restaurantId, syncedAt) {
  paymentMethods.forEach((pm, index) => {
    paymentMethodsRepository.upsert({
      id: `${restaurantId}:${pm.code}`,
      restaurant_id: restaurantId,
      code: pm.code,
      label: pm.label,
      is_active: 1,
      sort_order: index,
      synced_at: syncedAt,
      dirty: 0
    })
  })
  return paymentMethods.length
}

export async function pullBootstrap() {
  const headers = getAuthHeaders()
  if (!headers) {
    throw new Error('No active session — log in and select a restaurant before syncing.')
  }

  let response
  try {
    response = await authedFetch(`${API_V1_PATH}/pos/bootstrap`, { headers })
  } catch {
    throw new Error('Could not reach the SnapS POS server. Check your network connection.')
  }

  if (!response.ok) {
    let message = `Bootstrap pull failed (HTTP ${response.status}).`
    try {
      const body = await response.json()
      if (body?.message) message = body.message
    } catch {
      // Unparsable/empty error body — keep the generic message.
    }
    throw new Error(message)
  }

  const data = await response.json()
  const syncedAt = nowIso()
  const restaurantId = getCurrentSession()?.selectedRestaurantId

  // A full replace-what-changed upsert keyed by the server's own UUID id is
  // safe here (INSERT ... ON CONFLICT via each repository's upsert()) since
  // this is a bootstrap resync, not incremental sync — every row the server
  // sends back is authoritative and simply overwrites the local copy.
  const categoriesCount = upsertCategories(data.categories ?? [], syncedAt)
  const productsCount = upsertProducts(data.products ?? [], syncedAt)
  upsertProductPrices(data.priceOverrides ?? [], syncedAt)
  upsertPriceLevels(data.priceLevels ?? [], syncedAt)
  const customersCount = upsertCustomers(data.customers ?? [], syncedAt)
  const tablesCount = upsertTables(data.tables ?? [], syncedAt)
  upsertPaymentMethods(data.paymentMethods ?? [], restaurantId, syncedAt)

  return {
    productsCount,
    categoriesCount,
    customersCount,
    tablesCount,
    syncedAt
  }
}
