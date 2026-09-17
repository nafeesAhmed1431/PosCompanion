import { categoriesRepository } from '../db/repositories/categoriesRepository.js'
import { productsRepository } from '../db/repositories/productsRepository.js'
import { productPricesRepository } from '../db/repositories/productPricesRepository.js'
import { restaurantsRepository } from '../db/repositories/restaurantsRepository.js'
import { getCurrentSession } from '../auth/authService.js'

function requireRestaurantId() {
  const restaurantId = getCurrentSession()?.selectedRestaurantId
  if (!restaurantId) {
    throw new Error('No active session — log in and select a restaurant first.')
  }
  return restaurantId
}

// Read-only browse view for reference during ordering (NOT the admin menu
// editor) — resolves each product's display price against the restaurant's
// own default_price_level_id override in product_prices, falling back to
// the product's own base price, same rule described in project memory for
// price resolution elsewhere in the app.
export function getMenu() {
  const restaurantId = requireRestaurantId()
  const restaurant = restaurantsRepository.findById(restaurantId)
  const defaultPriceLevelId = restaurant?.default_price_level_id ?? null

  const categories = categoriesRepository
    .findByRestaurant(restaurantId)
    .sort((a, b) => a.sort_order - b.sort_order)

  const products = productsRepository
    .findActiveByRestaurant(restaurantId)
    .map((product) => {
      let price = product.price
      if (defaultPriceLevelId) {
        const override = productPricesRepository.findOne(product.id, defaultPriceLevelId)
        if (override) price = override.price
      }
      return { ...product, display_price: price }
    })

  return { categories, products }
}
