import express from 'express'
import cors from 'cors'

// Generic infra, no app-specific knowledge — safe to copy into another
// Electron project as-is. Builds a small Express server meant to be the
// renderer's communication channel with the main process (an alternative
// to raw IPC that lets renderer code call fetch()/ajax-style endpoints
// unchanged from a browser-based sibling app), and always binds it to
// 127.0.0.1 only.
//
// CORS is left permissive (reflect-any-origin, the `cors` package default)
// rather than locked to one origin, because the renderer's own origin
// legitimately differs by build: an electron-vite dev server serves it
// from e.g. http://localhost:5173, while a packaged app loads it from
// file:// (origin "null") — neither matches this server's own origin, so
// the browser's CORS check would block every request without this. This
// is safe only because the server never binds beyond 127.0.0.1 and is
// therefore unreachable from the LAN or a real website; do not reuse this
// permissive setting on a server bound to 0.0.0.0 or a real network
// interface.
export function createLocalApiServer({ port, mounts = [], setup } = {}) {
  const app = express()
  app.use(cors())
  app.use(express.json())

  for (const { path, router } of mounts) {
    app.use(path, router)
  }

  // Escape hatch for anything that doesn't fit the {path, router} shape
  // (custom middleware ordering, websocket upgrade wiring, etc.).
  if (typeof setup === 'function') setup(app)

  let server = null

  function start() {
    return new Promise((resolve) => {
      server = app.listen(port, '127.0.0.1', () => resolve(server))
    })
  }

  function stop() {
    return new Promise((resolve, reject) => {
      if (!server) return resolve()
      server.close((err) => {
        server = null
        if (err) reject(err)
        else resolve()
      })
    })
  }

  return { app, start, stop }
}
