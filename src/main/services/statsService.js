import { getDb } from '../db/index.js'
import { getCurrentSession } from '../auth/authService.js'
import { productsRepository } from '../db/repositories/productsRepository.js'
import { customersRepository } from '../db/repositories/customersRepository.js'

// Order statuses that never became a real, chargeable sale — excluded from
// sales totals/top-items so a held ticket or a void doesn't inflate "today's
// sales". Every other status (the Laravel Order model's kitchen-workflow
// values: pending/preparing/ready/served/completed, or the local table's
// 'open' default before the other agent's POS/Shifts work settles on final
// values) is counted as a sale for a simple local till report like this —
// judgment call, revisit if a dedicated "paid"/"completed" status emerges.
const EXCLUDED_ORDER_STATUSES = ['held', 'void', 'voided', 'cancelled']

function excludedPlaceholders() {
  return EXCLUDED_ORDER_STATUSES.map(() => '?').join(', ')
}

function currentRestaurantId() {
  return getCurrentSession()?.selectedRestaurantId ?? null
}

// Today is computed in UTC (SQLite date() on the stored ISO created_at,
// no 'localtime' modifier) — simplest correct behaviour for a single-till
// app where "today" drifting by the server's UTC offset is an acceptable
// judgment call for now; revisit if multi-timezone deployments ever matter.
function getTodaySales() {
  const restaurantId = currentRestaurantId()
  if (!restaurantId) return { total: 0, count: 0, avgTicket: 0 }

  const row = getDb()
    .prepare(
      `SELECT COALESCE(SUM(total), 0) as total, COUNT(*) as count
       FROM orders
       WHERE restaurant_id = ?
         AND date(created_at) = date('now')
         AND status NOT IN (${excludedPlaceholders()})`
    )
    .get(restaurantId, ...EXCLUDED_ORDER_STATUSES)

  const total = Number(row.total) || 0
  const count = Number(row.count) || 0
  return { total, count, avgTicket: count > 0 ? total / count : 0 }
}

function getTopItems(limit = 5) {
  const restaurantId = currentRestaurantId()
  if (!restaurantId) return []

  return getDb()
    .prepare(
      `SELECT oi.name as name, SUM(oi.qty) as qty, SUM(oi.line_total) as revenue
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       WHERE o.restaurant_id = ?
         AND date(o.created_at) = date('now')
         AND o.status NOT IN (${excludedPlaceholders()})
       GROUP BY oi.name
       ORDER BY qty DESC
       LIMIT ?`
    )
    .all(restaurantId, ...EXCLUDED_ORDER_STATUSES, limit)
    .map((r) => ({ name: r.name, qty: Number(r.qty) || 0, revenue: Number(r.revenue) || 0 }))
}

// Read-only lookup against the local shifts table — deliberately not routed
// through a shared shiftsService since the Shifts page/service (owned by a
// different agent working in parallel) may still be in flux; this query is
// simple enough to duplicate rather than risk coupling to their in-progress
// module.
function getCurrentShift() {
  const restaurantId = currentRestaurantId()
  if (!restaurantId) return null

  return (
    getDb()
      .prepare(
        `SELECT * FROM shifts WHERE restaurant_id = ? AND status = 'open' ORDER BY opened_at DESC LIMIT 1`
      )
      .get(restaurantId) ?? null
  )
}

// Shared by both the Dashboard's sync summary and the Settings > Sync tab
// (per the plan's "don't duplicate query logic" instruction) — the most
// recent synced_at across every bootstrap-synced table, plus a plain count
// of what's cached locally right now.
export function getSyncSummary() {
  const { synced_at: syncedAt } =
    getDb()
      .prepare(
        `SELECT MAX(synced_at) as synced_at FROM (
           SELECT synced_at FROM products
           UNION ALL SELECT synced_at FROM categories
           UNION ALL SELECT synced_at FROM customers
           UNION ALL SELECT synced_at FROM restaurant_tables
           UNION ALL SELECT synced_at FROM payment_methods
         )`
      )
      .get() ?? {}

  return {
    syncedAt: syncedAt ?? null,
    productsCount: productsRepository.findAll().length,
    customersCount: customersRepository.findAll().length
  }
}

export function getDashboardStats() {
  return {
    todaySales: getTodaySales(),
    topItems: getTopItems(5),
    currentShift: getCurrentShift(),
    sync: getSyncSummary()
  }
}
