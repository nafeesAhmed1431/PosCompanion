import { getDb } from '../db/index.js'
import { calculateRefundAmounts } from './orderCalc.js'
import { ordersRepository } from '../db/repositories/ordersRepository.js'
import { orderItemsRepository } from '../db/repositories/orderItemsRepository.js'
import { orderPaymentsRepository } from '../db/repositories/orderPaymentsRepository.js'

// Status-management/refund concerns for an order that already exists —
// deliberately a separate service from ordersService.js (which owns
// hold/checkout/idempotency and must not be touched). Ports
// OrderService::advanceStatus/refund/changeTable/changeType from
// snaps_lvl_pos (see project memory) onto the local SQLite copy.

// Mirrors OrderService::CLOSED_STATUSES — once an order is here, its
// items/table/type/status are frozen (refunds are the one exception, see
// refundOrderItem below, since a completed order can still be refunded).
const CLOSED_STATUSES = ['completed', 'cancelled', 'refunded', 'partially_refunded']

// Mirrors orderStatus.ts's ORDER_STATUS_FLOW — the only statuses reachable
// via forward progression. 'cancelled' is reachable from any open status
// (not part of the linear flow); 'refunded'/'partially_refunded' are never
// set directly, only ever derived by refundOrderItem.
export const ORDER_STATUS_FLOW = ['pending', 'preparing', 'ready', 'served', 'completed']

// Statuses that never got a payment (cancelled) or are already fully
// refunded — nothing left to refund against.
const NON_REFUNDABLE_ORDER_STATUSES = ['cancelled', 'refunded']

function round2(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function serialize(orderId) {
  const order = ordersRepository.findById(orderId)
  const items = orderItemsRepository.findByOrder(orderId)
  const payments = orderPaymentsRepository.findByOrder(orderId)
  return { order, items, payments }
}

/**
 * What advanceStatus would move `current` to next, or null if it's already
 * at the end of the flow (or not on the flow at all, e.g. a closed order).
 * Exposed for the UI (KDS's "advance" button) so it never has to duplicate
 * this ordering itself.
 */
export function nextStatus(current) {
  const idx = ORDER_STATUS_FLOW.indexOf(current)
  if (idx === -1 || idx === ORDER_STATUS_FLOW.length - 1) return null
  return ORDER_STATUS_FLOW[idx + 1]
}

function assertTransitionAllowed(current, next) {
  if (CLOSED_STATUSES.includes(current)) {
    throw new Error(`Order is already "${current}" and cannot change status.`)
  }
  if (next === 'cancelled') return // any still-open order can be cancelled directly

  const nextIdx = ORDER_STATUS_FLOW.indexOf(next)
  if (nextIdx === -1) {
    throw new Error(
      `"${next}" cannot be set directly — refunded/partially_refunded only happen via a refund.`
    )
  }
  const currentIdx = ORDER_STATUS_FLOW.indexOf(current)
  if (currentIdx === -1 || nextIdx <= currentIdx) {
    throw new Error(`Cannot move an order from "${current}" to "${next}" — statuses only move forward.`)
  }
}

function freeTable(db, tableId) {
  if (!tableId) return
  db.prepare("UPDATE restaurant_tables SET status = 'free', dirty = 1 WHERE id = ?").run(tableId)
}

/**
 * Validated status transition. Frees the order's table on the two "done
 * with this table" outcomes (completed/cancelled), mirroring
 * OrderService::advanceStatus's freeTable() call.
 */
export function advanceStatus(orderId, newStatus) {
  const order = ordersRepository.findById(orderId)
  if (!order) throw new Error('Order not found.')

  assertTransitionAllowed(order.status, newStatus)

  const db = getDb()
  const run = db.transaction(() => {
    db.prepare('UPDATE orders SET status = ?, dirty = 1 WHERE id = ?').run(newStatus, orderId)
    if (['completed', 'cancelled'].includes(newStatus) && order.table_id) {
      freeTable(db, order.table_id)
    }
  })
  run()

  return serialize(orderId)
}

/**
 * Refunds `qty` of one order item. Ports OrderService::refund's per-pick
 * validation and its order-level status rule: after ANY refund, the order
 * becomes 'refunded' if every refundable item on it is now fully refunded
 * by quantity, else 'partially_refunded' — checked across all of the
 * order's refundable items, not just the one just picked, exactly like the
 * Laravel version's $stillRemaining check.
 */
export function refundOrderItem({ orderId, orderItemId, qty }) {
  const order = ordersRepository.findById(orderId)
  if (!order) throw new Error('Order not found.')
  if (NON_REFUNDABLE_ORDER_STATUSES.includes(order.status)) {
    throw new Error(`Order is "${order.status}" and cannot be refunded.`)
  }

  const item = orderItemsRepository.findById(orderItemId)
  if (!item || item.order_id !== orderId) {
    throw new Error('That item does not belong to this order.')
  }
  if (!item.is_refundable) {
    throw new Error(`"${item.name}" is not refundable.`)
  }

  const refundQty = Number(qty)
  if (!(refundQty > 0)) {
    throw new Error('Refund quantity must be greater than zero.')
  }
  const remaining = item.qty - item.refunded_qty
  if (refundQty > remaining + 1e-9) {
    throw new Error(`Cannot refund ${refundQty} — only ${round2(remaining)} left unrefunded on "${item.name}".`)
  }

  const refundSubtotal = round2(item.unit_price * refundQty)
  const { refundTax, refundTotal } = calculateRefundAmounts({
    orderSubtotal: order.subtotal,
    orderTax: order.tax,
    refundSubtotal
  })

  const db = getDb()
  const run = db.transaction(() => {
    db.prepare('UPDATE order_items SET refunded_qty = ?, dirty = 1 WHERE id = ?').run(
      round2(item.refunded_qty + refundQty),
      orderItemId
    )

    // Re-read post-update so this item's own new refunded_qty is reflected
    // in the "is everything fully refunded" check below.
    const items = orderItemsRepository.findByOrder(orderId)
    const refundableItems = items.filter((it) => it.is_refundable)
    const stillRemaining = refundableItems.some((it) => it.refunded_qty < it.qty - 1e-9)
    const newStatus = stillRemaining ? 'partially_refunded' : 'refunded'

    db.prepare('UPDATE orders SET status = ?, dirty = 1 WHERE id = ?').run(newStatus, orderId)
  })
  run()

  return { ...serialize(orderId), refund: { subtotal: refundSubtotal, tax: refundTax, total: refundTotal } }
}

/**
 * Reassign a still-open order's table and/or order type — combines
 * OrderService::changeTable/changeType into one call since the companion
 * app's UI edits both together. Frees whichever table the order is leaving
 * (if any) and occupies the new one (if the order is/stays dine-in).
 */
export function reassignOrder({ orderId, orderType, tableId = null }) {
  const order = ordersRepository.findById(orderId)
  if (!order) throw new Error('Order not found.')
  if (CLOSED_STATUSES.includes(order.status)) {
    throw new Error('This order is closed and can no longer be changed.')
  }

  const nextType = orderType || order.order_type
  if (nextType === 'dine_in' && !tableId) {
    throw new Error('Pick a table for a dine-in order.')
  }
  const finalTableId = nextType === 'dine_in' ? tableId : null

  const db = getDb()
  const run = db.transaction(() => {
    if (order.table_id && order.table_id !== finalTableId) {
      freeTable(db, order.table_id)
    }
    if (finalTableId) {
      db.prepare("UPDATE restaurant_tables SET status = 'occupied', dirty = 1 WHERE id = ?").run(finalTableId)
    }
    db.prepare('UPDATE orders SET order_type = ?, table_id = ?, dirty = 1 WHERE id = ?').run(
      nextType,
      finalTableId,
      orderId
    )
  })
  run()

  return serialize(orderId)
}

/**
 * Orders list for the Orders/KDS pages — most-recent-first, each with its
 * items so both screens can render without a second round trip per order.
 * `statuses` (plural) lets KDS ask for its whole open-board slice
 * (pending/preparing/ready) in one call instead of three.
 */
export function listOrders({ restaurantId, status, statuses }) {
  if (!restaurantId) throw new Error('restaurantId is required.')
  const db = getDb()

  const wantedStatuses = statuses?.length ? statuses : status ? [status] : null

  let sql = 'SELECT * FROM orders WHERE restaurant_id = ?'
  const params = [restaurantId]
  if (wantedStatuses) {
    sql += ` AND status IN (${wantedStatuses.map(() => '?').join(', ')})`
    params.push(...wantedStatuses)
  }
  sql += ' ORDER BY created_at DESC LIMIT 200'

  const orders = db.prepare(sql).all(...params)
  return orders.map((order) => ({ ...order, items: orderItemsRepository.findByOrder(order.id) }))
}

export function getOrder(orderId) {
  const result = serialize(orderId)
  if (!result.order) throw new Error('Order not found.')
  return result
}
