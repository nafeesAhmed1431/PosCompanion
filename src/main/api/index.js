import { createLocalApiServer } from '../lib/local-api-server.js'
import { authRouter } from './authRoutes.js'
import { syncRouter } from './syncRoutes.js'
import { statsRouter } from './statsRoutes.js'
import { printersRouter } from './printersRoutes.js'
import { settingsRouter } from './settingsRoutes.js'
import { ordersRouter } from './ordersRoutes.js'
import { shiftsRouter } from './shiftsRoutes.js'
import { tablesRouter } from './tablesRoutes.js'
import { customersRouter } from './customersRoutes.js'
import { menuRouter } from './menuRoutes.js'

// Thin POS-specific consumer of the generic local API server factory (see
// main/lib/local-api-server.js) — this file's only job is declaring which
// routers mount at which paths. The loopback binding, CORS reasoning, and
// start/stop lifecycle all live in the generic module.
export function createApiApp(port) {
  return createLocalApiServer({
    port,
    mounts: [
      { path: '/api/auth', router: authRouter },
      { path: '/api/sync', router: syncRouter },
      { path: '/api/stats', router: statsRouter },
      { path: '/api/printers', router: printersRouter },
      { path: '/api/settings', router: settingsRouter },
      { path: '/api/orders', router: ordersRouter },
      { path: '/api/shifts', router: shiftsRouter },
      { path: '/api/tables', router: tablesRouter },
      { path: '/api/customers', router: customersRouter },
      { path: '/api/menu', router: menuRouter }
    ]
  })
}
