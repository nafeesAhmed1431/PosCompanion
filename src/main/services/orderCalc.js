// Pure order-total calculation, ported line-for-line from the live Laravel
// app's resources/js/pages/pos.tsx (~line 503) — the Laravel server does NOT
// recompute or validate this on checkout (PosController::validateTicket only
// checks `numeric|min:0` on the totals the client sends), so any drift here
// is an invisible bug that only shows up later as a wrong receipt.
//
// Rounding rule: only the FINAL derived totals (subtotal, tax,
// serviceCharge, total, and each line's line_total) are rounded to 2dp, at
// the very end. Every intermediate value (discountRatio, per-line tax
// contributions, etc.) is kept at full float precision until then — this
// mirrors the server's own `OrderService::recalculateOrderTotals` and
// avoids compounding small rounding errors across lines/discount math into
// a total that's off by a cent from what Laravel itself would compute.
//
// No I/O, no DB, no Express — deliberately kept trivially unit-testable.

function round2(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

/**
 * @param {object} params
 * @param {Array<{price: number, qty: number, taxRate: number}>} params.lines
 * @param {number} [params.discount] - flat currency amount, NOT a percentage
 * @param {'dine_in'|'takeaway'|'delivery'} params.orderType
 * @param {number} [params.serviceChargeRate] - percentage (e.g. 10 for 10%), only applied for dine_in
 * @returns {{subtotal: number, discountValue: number, tax: number, serviceCharge: number, total: number, lines: Array}}
 */
export function calculateOrderTotals({ lines, discount = 0, orderType, serviceChargeRate = 0 }) {
  const subtotal = lines.reduce((sum, line) => sum + line.price * line.qty, 0)

  // Flat amount clamped to the subtotal — a discount larger than the order
  // can never push the total negative.
  const discountValue = Math.min(discount, subtotal)

  // Fraction of the subtotal that survives the discount — applied per line
  // below so tax is computed on each line's own post-discount, own tax-rate
  // share rather than one blended rate across the whole order.
  const discountRatio = subtotal > 0 ? (subtotal - discountValue) / subtotal : 0

  const tax = lines.reduce(
    (sum, line) => sum + line.price * line.qty * discountRatio * (line.taxRate / 100),
    0
  )

  const serviceCharge =
    orderType === 'dine_in' ? (subtotal - discountValue) * (serviceChargeRate / 100) : 0

  const total = subtotal - discountValue + tax + serviceCharge

  // line_total is the raw pre-discount line amount (price*qty) — matches
  // what pos.tsx actually sends per line to hold/checkout; discount and tax
  // are order-level concepts only, never written back onto individual lines.
  const computedLines = lines.map((line) => ({
    ...line,
    line_total: round2(line.price * line.qty)
  }))

  return {
    subtotal: round2(subtotal),
    discountValue: round2(discountValue),
    tax: round2(tax),
    serviceCharge: round2(serviceCharge),
    total: round2(total),
    lines: computedLines
  }
}

/**
 * Ports `OrderService::refund`'s proration: a partial refund gets the same
 * share of the original order's tax as it takes of the original subtotal,
 * rather than re-deriving tax from scratch (which could disagree with the
 * tax actually charged if rates changed between order and refund time).
 *
 * @param {object} params
 * @param {number} params.orderSubtotal
 * @param {number} params.orderTax
 * @param {number} params.refundSubtotal
 * @returns {{refundTax: number, refundTotal: number}}
 */
export function calculateRefundAmounts({ orderSubtotal, orderTax, refundSubtotal }) {
  const refundTax = orderSubtotal > 0 ? orderTax * (refundSubtotal / orderSubtotal) : 0
  const refundTotal = refundSubtotal + refundTax

  return {
    refundTax: round2(refundTax),
    refundTotal: round2(refundTotal)
  }
}
