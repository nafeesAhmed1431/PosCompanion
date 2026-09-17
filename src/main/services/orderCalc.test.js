import { describe, it, expect } from 'vitest'
import { calculateOrderTotals, calculateRefundAmounts } from './orderCalc.js'

describe('calculateOrderTotals', () => {
  it('handles a simple case with no discount and no service charge', () => {
    const result = calculateOrderTotals({
      lines: [{ price: 10, qty: 2, taxRate: 15 }],
      discount: 0,
      orderType: 'takeaway',
      serviceChargeRate: 0
    })

    expect(result.subtotal).toBe(20)
    expect(result.discountValue).toBe(0)
    expect(result.tax).toBe(3) // 20 * 1 * 0.15
    expect(result.serviceCharge).toBe(0)
    expect(result.total).toBe(23)
    expect(result.lines[0].line_total).toBe(20)
  })

  it('applies both discount and service charge for a dine_in order', () => {
    const result = calculateOrderTotals({
      lines: [{ price: 100, qty: 1, taxRate: 10 }],
      discount: 20,
      orderType: 'dine_in',
      serviceChargeRate: 10
    })

    // discountRatio = (100-20)/100 = 0.8
    // tax = 100 * 0.8 * 0.10 = 8
    // serviceCharge = (100-20) * 0.10 = 8
    // total = 100 - 20 + 8 + 8 = 96
    expect(result.subtotal).toBe(100)
    expect(result.discountValue).toBe(20)
    expect(result.tax).toBe(8)
    expect(result.serviceCharge).toBe(8)
    expect(result.total).toBe(96)
  })

  it('applies the discount ratio per line when lines have different tax rates', () => {
    const result = calculateOrderTotals({
      lines: [
        { price: 10, qty: 2, taxRate: 5 }, // line amount 20
        { price: 5, qty: 4, taxRate: 20 } // line amount 20
      ],
      discount: 10,
      orderType: 'takeaway',
      serviceChargeRate: 0
    })

    // subtotal = 40, discountValue = 10, discountRatio = 30/40 = 0.75
    // line1 tax = 20 * 0.75 * 0.05 = 0.75
    // line2 tax = 20 * 0.75 * 0.20 = 3
    // total tax = 3.75 (NOT the same as applying one blended rate to the
    // whole subtotal, which is exactly what this test guards against)
    expect(result.subtotal).toBe(40)
    expect(result.discountValue).toBe(10)
    expect(result.tax).toBe(3.75)
    expect(result.serviceCharge).toBe(0)
    expect(result.total).toBe(33.75)
  })

  it('always zeroes the service charge for a takeaway order regardless of rate', () => {
    const result = calculateOrderTotals({
      lines: [{ price: 50, qty: 1, taxRate: 0 }],
      discount: 0,
      orderType: 'takeaway',
      serviceChargeRate: 50 // deliberately large — must still be ignored
    })

    expect(result.serviceCharge).toBe(0)
    expect(result.total).toBe(50)
  })

  it('clamps a discount larger than the subtotal instead of going negative', () => {
    const result = calculateOrderTotals({
      lines: [{ price: 10, qty: 1, taxRate: 0 }],
      discount: 999,
      orderType: 'takeaway',
      serviceChargeRate: 0
    })

    expect(result.discountValue).toBe(10)
    expect(result.total).toBe(0)
  })
})

describe('calculateRefundAmounts', () => {
  it('prorates refund tax by the refund subtotal share of the original order', () => {
    const result = calculateRefundAmounts({
      orderSubtotal: 100,
      orderTax: 8,
      refundSubtotal: 25
    })

    // refundTax = 8 * (25/100) = 2, refundTotal = 25 + 2 = 27
    expect(result.refundTax).toBe(2)
    expect(result.refundTotal).toBe(27)
  })

  it('returns zero refund tax when the original order had a zero subtotal', () => {
    const result = calculateRefundAmounts({
      orderSubtotal: 0,
      orderTax: 0,
      refundSubtotal: 0
    })

    expect(result.refundTax).toBe(0)
    expect(result.refundTotal).toBe(0)
  })
})
