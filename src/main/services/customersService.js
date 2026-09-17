import crypto from 'crypto'
import { getDb } from '../db/index.js'
import { customersRepository } from '../db/repositories/customersRepository.js'
import { getCurrentSession } from '../auth/authService.js'

function requireRestaurantId() {
  const restaurantId = getCurrentSession()?.selectedRestaurantId
  if (!restaurantId) {
    throw new Error('No active session — log in and select a restaurant first.')
  }
  return restaurantId
}

// Ports CustomerController::generateCustomerCode() from the Laravel app
// verbatim (base-36 timestamp tail + base-36 random tail, prefixed 'C') so
// locally-created customers get codes in the exact same shape as
// server-created ones. Laravel's `(int) (microtime(true) * 1000)` is just
// milliseconds since epoch, i.e. Date.now(); `random_int(0, 2**31)` becomes
// Math.floor(Math.random() * 2**31) since global uniqueness isn't required
// (sync-time id collisions are a later sync-engine phase, not this one) —
// local uniqueness only needs "very unlikely", which this comfortably gives.
function generateCustomerCode() {
  const time = Date.now().toString(36).toUpperCase()
  const rand = Math.floor(Math.random() * 2 ** 31)
    .toString(36)
    .toUpperCase()
  return `C${time.slice(-4)}${rand.slice(0, 6)}`
}

// order_count/lifetime_spend are a simple local aggregate (not a synced
// column) — fine at this data volume, and correctly reads 0 until the POS
// screen actually starts creating local orders.
function getStats(customerId) {
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) AS order_count, COALESCE(SUM(total), 0) AS lifetime_spend
       FROM orders WHERE customer_id = ?`
    )
    .get(customerId)
  return { order_count: row.order_count, lifetime_spend: row.lifetime_spend }
}

function withStats(customer) {
  return { ...customer, ...getStats(customer.id) }
}

export function listCustomers({ search } = {}) {
  const restaurantId = requireRestaurantId()
  const rows = search
    ? customersRepository.search(search).filter((c) => c.restaurant_id === restaurantId)
    : customersRepository.findByRestaurant(restaurantId)
  return rows.map(withStats)
}

export function getCustomer(id) {
  const customer = customersRepository.findById(id)
  if (!customer) throw new Error('Customer not found.')
  return withStats(customer)
}

export function createCustomer({ name, phone, address, default_price_level_id: defaultPriceLevelId }) {
  if (!name || !name.trim()) throw new Error('Name is required.')
  const restaurantId = requireRestaurantId()

  const customer = customersRepository.upsert({
    id: crypto.randomUUID(),
    restaurant_id: restaurantId,
    name: name.trim(),
    phone: phone?.trim() || null,
    address: address?.trim() || null,
    default_price_level_id: defaultPriceLevelId || null,
    customer_code: generateCustomerCode(),
    synced_at: null,
    dirty: 1
  })
  return withStats(customer)
}

export function updateCustomer(id, { name, phone, address, default_price_level_id: defaultPriceLevelId }) {
  const existing = customersRepository.findById(id)
  if (!existing) throw new Error('Customer not found.')
  if (!name || !name.trim()) throw new Error('Name is required.')

  const customer = customersRepository.upsert({
    ...existing,
    name: name.trim(),
    phone: phone?.trim() || null,
    address: address?.trim() || null,
    default_price_level_id: defaultPriceLevelId || null,
    dirty: 1
  })
  return withStats(customer)
}

export function deleteCustomer(id) {
  const existing = customersRepository.findById(id)
  if (!existing) throw new Error('Customer not found.')
  customersRepository.remove(id)
}
