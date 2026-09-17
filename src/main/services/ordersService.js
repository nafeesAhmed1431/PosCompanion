import { randomUUID } from 'crypto'
import { getDb } from '../db/index.js'
import { calculateOrderTotals } from './orderCalc.js'
import { ordersRepository } from '../db/repositories/ordersRepository.js'
import { orderItemsRepository } from '../db/repositories/orderItemsRepository.js'
import { orderPaymentsRepository } from '../db/repositories/orderPaymentsRepository.js'
import { paymentMethodsRepository } from '../db/repositories/paymentMethodsRepository.js'
import { tablesRepository } from '../db/repositories/tablesRepository.js'

// The order-creation flow POS/KDS/Orders all build on top of. Every write
// here mirrors the real Laravel PosController::hold/checkout + OrderService
// (see project memory / snaps_lvl_pos) so that when the sync engine phase
// ships, replaying these local rows against the server produces the exact
// same order the till already showed the cashier.

// Dine-in orders default to a 10% service charge unless the caller overrides
// it — matches OrderService::recalculateOrderTotals' `setting(..., 10)`
// fallback. There is no local restaurant-settings sync yet (bootstrap only
// pulls products/categories/customers/tables/payment methods, per
// bootstrapSyncService.js), so this is a fixed default rather than a
// per-restaurant value until a later Settings-sync phase adds one.
const DEFAULT_SERVICE_CHARGE_RATE = 10

// Statuses OrderService::CLOSED_STATUSES treats as "this order is done" —
// used by listHeldOrders to mirror Order::scopeOpenDineIn exactly.
const OPEN_DINE_IN_STATUSES = ['pending', 'preparing', 'ready', 'served', 'completed']

function nowIso() {
  return new Date().toISOString()
}

function toCalcLines(lines) {
  return lines.map((line) => ({
    price: Number(line.price),
    qty: Number(line.qty),
    taxRate: Number(line.taxRate ?? 0)
  }))
}

/**
 * Thin wrapper over orderCalc.js's pure calculateOrderTotals — no DB I/O, so
 * the POS cart can show live totals on every qty/discount change without
 * writing anything.
 */
export function previewTotals({ lines, discount = 0, orderType, serviceChargeRate }) {
  return calculateOrderTotals({
    lines: toCalcLines(lines),
    discount,
    orderType,
    serviceChargeRate: serviceChargeRate ?? (orderType === 'dine_in' ? DEFAULT_SERVICE_CHARGE_RATE : 0)
  })
}

function serializeOrder(orderId) {
  const order = ordersRepository.findById(orderId)
  const items = orderItemsRepository.findByOrder(orderId)
  const payments = orderPaymentsRepository.findByOrder(orderId)
  return { order, items, payments }
}

// Deletes and reinserts this order's line items — mirrors PosController's
// own replaceItems() helper (a held ticket's full line list is always sent
// fresh from the client, so "replace everything" is simpler and safer than
// diffing against what's already stored).
function replaceItems(db, { orderId, restaurantId, lines, computedLines }) {
  db.prepare('DELETE FROM order_items WHERE order_id = ?').run(orderId)

  const insert = db.prepare(`
    INSERT INTO order_items
      (id, restaurant_id, order_id, product_id, name, note, qty, unit_price, line_total, refunded_qty, is_refundable, synced_at, dirty)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, NULL, 1)
  `)

  lines.forEach((line, index) => {
    insert.run(
      randomUUID(),
      restaurantId,
      orderId,
      line.productId ?? null,
      line.name,
      line.note ?? null,
      line.qty,
      line.price,
      computedLines[index].line_total,
      line.isRefundable === false ? 0 : 1
    )
  })
}

function markTableOccupied(db, tableId) {
  if (!tableId) return
  db.prepare("UPDATE restaurant_tables SET status = 'occupied', dirty = 1 WHERE id = ?").run(tableId)
}

/**
 * Holding an order means: write the order + items, but write NO
 * order_payments rows — that absence is precisely what "held" means
 * elsewhere in this app (see Order::scopeOpenDineIn and listHeldOrders
 * below), so this function must never insert a payment row under any path.
 */
export function holdOrder({
  restaurantId,
  orderType = 'dine_in',
  tableId = null,
  customerId = null,
  lines,
  discount = 0,
  note = null,
  idempotencyKey,
  createdBy = null,
  shiftId = null,
  serviceChargeRate
}) {
  const db = getDb()

  // Idempotency-key-first-check: a retried hold (e.g. the renderer never saw
  // the response to a request that actually succeeded, and retries it) must
  // return the SAME order rather than creating a duplicate — this is the
  // exact replay contract the eventual sync engine's outbox will depend on,
  // so it has to be correct now even though nothing pushes to the server yet.
  const key = idempotencyKey || randomUUID()
  const existing = ordersRepository.findByIdempotencyKey(key)
  if (existing) {
    return serializeOrder(existing.id)
  }

  const rate = serviceChargeRate ?? (orderType === 'dine_in' ? DEFAULT_SERVICE_CHARGE_RATE : 0)
  const totals = calculateOrderTotals({ lines: toCalcLines(lines), discount, orderType, serviceChargeRate: rate })

  const orderId = randomUUID()
  const createdAt = nowIso()

  const run = db.transaction(() => {
    ordersRepository.upsert({
      id: orderId,
      restaurant_id: restaurantId,
      order_no: null,
      order_type: orderType,
      status: 'pending',
      parent_order_id: null,
      idempotency_key: key,
      table_id: orderType === 'dine_in' ? tableId : null,
      customer_id: customerId,
      subtotal: totals.subtotal,
      discount: totals.discountValue,
      tax: totals.tax,
      service_charge: totals.serviceCharge,
      total: totals.total,
      payment_method: null,
      note,
      created_at: createdAt,
      created_by: createdBy,
      shift_id: shiftId,
      synced_at: null,
      dirty: 1
    })

    replaceItems(db, { orderId, restaurantId, lines, computedLines: totals.lines })

    if (orderType === 'dine_in') {
      markTableOccupied(db, tableId)
    }
  })
  run()

  return { ...serializeOrder(orderId), totals }
}

/**
 * Checkout: computes the same totals, writes the order + items, and inserts
 * one order_payments row per tender. `payment_method` becomes 'split' when
 * more than one tender is given, otherwise the single tender's own method —
 * the exact rule PosController::checkout uses. Status stays 'pending'
 * (matching Laravel: a fresh checkout doesn't jump straight to 'completed',
 * it still needs to be prepared/served first) rather than a naive
 * "payment received = done" assumption.
 */
export function checkoutOrder({
  orderId = null,
  restaurantId,
  orderType = 'dine_in',
  tableId = null,
  customerId = null,
  lines,
  discount = 0,
  note = null,
  idempotencyKey,
  createdBy = null,
  shiftId = null,
  serviceChargeRate,
  payments
}) {
  if (!Array.isArray(payments) || payments.length === 0) {
    throw new Error('At least one payment tender is required to check out.')
  }

  const db = getDb()

  // Same replay guard as holdOrder — checkout has strictly more once-only
  // side effects (payment rows) than hold, so a duplicate here would be
  // worse (double-charging on the receipt), not just a cosmetic dupe row.
  let existingOrder = orderId ? ordersRepository.findById(orderId) : null
  if (!existingOrder && idempotencyKey) {
    existingOrder = ordersRepository.findByIdempotencyKey(idempotencyKey)
    if (existingOrder) {
      return serializeOrder(existingOrder.id)
    }
  }

  const rate = serviceChargeRate ?? (orderType === 'dine_in' ? DEFAULT_SERVICE_CHARGE_RATE : 0)
  const totals = calculateOrderTotals({ lines: toCalcLines(lines), discount, orderType, serviceChargeRate: rate })

  const paymentMethod = payments.length > 1 ? 'split' : payments[0].method

  const id = existingOrder?.id ?? randomUUID()
  const key = existingOrder?.idempotency_key ?? idempotencyKey ?? randomUUID()
  const createdAt = existingOrder?.created_at ?? nowIso()
  const finalTableId = orderType === 'dine_in' ? tableId : null

  const run = db.transaction(() => {
    ordersRepository.upsert({
      id,
      restaurant_id: restaurantId,
      order_no: existingOrder?.order_no ?? null,
      order_type: orderType,
      status: 'pending',
      parent_order_id: existingOrder?.parent_order_id ?? null,
      idempotency_key: key,
      table_id: finalTableId,
      customer_id: customerId,
      subtotal: totals.subtotal,
      discount: totals.discountValue,
      tax: totals.tax,
      service_charge: totals.serviceCharge,
      total: totals.total,
      payment_method: paymentMethod,
      note,
      created_at: createdAt,
      created_by: createdBy,
      shift_id: shiftId,
      synced_at: null,
      dirty: 1
    })

    replaceItems(db, { orderId: id, restaurantId, lines, computedLines: totals.lines })

    // A checkout replayed against an order that already has payments (e.g.
    // reopened just to add a note) must not double-insert tenders — only a
    // brand-new checkout, or one resuming a held order with zero payments
    // so far, writes payment rows.
    const alreadyPaid = orderPaymentsRepository.findByOrder(id).length > 0
    if (!alreadyPaid) {
      for (const payment of payments) {
        orderPaymentsRepository.upsert({
          id: randomUUID(),
          order_id: id,
          method: payment.method,
          amount: Number(payment.amount),
          tendered_amount: payment.tenderedAmount != null ? Number(payment.tenderedAmount) : null,
          change_amount:
            payment.tenderedAmount != null
              ? Math.max(0, round2(Number(payment.tenderedAmount) - Number(payment.amount)))
              : null,
          synced_at: null,
          dirty: 1
        })
      }
    }

    if (orderType === 'dine_in') {
      markTableOccupied(db, finalTableId)
    }
  })
  run()

  return { ...serializeOrder(id), totals }
}

function round2(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

// Checkout needs a tender picker (cash/card/transfer/etc). No dedicated
// /api/payment-methods route exists yet from any other in-flight task, and
// this data already lives in the local payment_methods table synced by
// bootstrapSyncService, so it's exposed here rather than inventing a new
// top-level route file outside this task's ownership.
export function listPaymentMethods(restaurantId) {
  return paymentMethodsRepository.findByRestaurant(restaurantId).filter((pm) => pm.is_active)
}

// Fallback table list for the POS table picker in case /api/tables (owned
// by the parallel Tables/Menu/Customers task) isn't mounted yet — reads the
// same local restaurant_tables table directly rather than blocking on that
// task's route being wired into main/api/index.js.
export function listTablesFallback(restaurantId) {
  return tablesRepository.findByRestaurant(restaurantId)
}

/**
 * Held orders a cashier can resume in POS: dine-in, not yet in a terminal
 * state, and with zero payment rows — the exact `Order::scopeOpenDineIn`
 * definition (no separate "held" boolean/status exists on the server, so
 * this absence-of-payments check IS the held concept, and this port must
 * keep using it rather than inventing a status value that doesn't exist
 * upstream).
 */
export function listHeldOrders(restaurantId) {
  const db = getDb()
  const placeholders = OPEN_DINE_IN_STATUSES.map(() => '?').join(', ')
  const orders = db
    .prepare(
      `SELECT o.* FROM orders o
       WHERE o.restaurant_id = ?
         AND o.order_type = 'dine_in'
         AND o.status IN (${placeholders})
         AND NOT EXISTS (SELECT 1 FROM order_payments p WHERE p.order_id = o.id)
       ORDER BY o.created_at DESC`
    )
    .all(restaurantId, ...OPEN_DINE_IN_STATUSES)

  return orders.map((order) => ({
    ...order,
    items: orderItemsRepository.findByOrder(order.id)
  }))
}
