import { randomUUID } from 'crypto'
import { getDb } from '../db/index.js'
import { shiftsRepository } from '../db/repositories/shiftsRepository.js'

// Ported from snaps_lvl_pos's ShiftController — open/figures/close are all
// simple enough to reimplement directly against the local `orders` /
// `order_payments` tables rather than needing their own local service split.

function nowIso() {
  return new Date().toISOString()
}

function round2(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

export function openShift({ label, openingBalance, userId, restaurantId }) {
  const shift = {
    id: randomUUID(),
    restaurant_id: restaurantId,
    user_id: userId,
    label: label ?? null,
    opening_balance: Number(openingBalance) || 0,
    closing_balance: null,
    opened_at: nowIso(),
    closed_at: null,
    status: 'open',
    synced_at: null,
    dirty: 1
  }
  return shiftsRepository.upsert(shift)
}

export function getOpenShift(restaurantId) {
  return shiftsRepository.findOpenForRestaurant(restaurantId)
}

export function listShifts(restaurantId) {
  return shiftsRepository.findByRestaurant(restaurantId).sort((a, b) => (a.opened_at < b.opened_at ? 1 : -1))
}

/**
 * Ports ShiftController::computeFigures — cash/card/transfer totals from
 * order_payments for this shift's orders, plus a refunds total derived from
 * order_items.refunded_qty * unit_price (the same proration-free approach
 * the server uses here, distinct from orderCalc's refund proration which is
 * for a single order's partial refund receipt, not a whole-shift rollup).
 */
export function getShiftFigures(shiftId) {
  const db = getDb()

  const orderIds = db.prepare('SELECT id FROM orders WHERE shift_id = ?').all(shiftId).map((r) => r.id)
  const shift = shiftsRepository.findById(shiftId)
  const openingBalance = Number(shift?.opening_balance ?? 0)

  if (orderIds.length === 0) {
    return {
      ordersCount: 0,
      openingBalance,
      cashSales: 0,
      cardSales: 0,
      transferSales: 0,
      refundsTotal: 0,
      expectedCash: openingBalance
    }
  }

  const placeholders = orderIds.map(() => '?').join(', ')

  const sumByMethod = (method) =>
    db
      .prepare(`SELECT COALESCE(SUM(amount), 0) AS total FROM order_payments WHERE method = ? AND order_id IN (${placeholders})`)
      .get(method, ...orderIds).total

  const cashSales = round2(sumByMethod('cash'))
  const cardSales = round2(sumByMethod('card'))
  const transferSales = round2(sumByMethod('transfer'))

  const refundsTotal = round2(
    db
      .prepare(
        `SELECT COALESCE(SUM(refunded_qty * unit_price), 0) AS total FROM order_items WHERE order_id IN (${placeholders})`
      )
      .get(...orderIds).total
  )

  return {
    ordersCount: orderIds.length,
    openingBalance,
    cashSales,
    cardSales,
    transferSales,
    refundsTotal,
    expectedCash: round2(openingBalance + cashSales - refundsTotal)
  }
}

export function closeShift(shiftId, closingBalance) {
  const shift = shiftsRepository.findById(shiftId)
  if (!shift) throw new Error('Shift not found.')

  return shiftsRepository.upsert({
    ...shift,
    closing_balance: Number(closingBalance) || 0,
    closed_at: nowIso(),
    status: 'closed',
    dirty: 1
  })
}
