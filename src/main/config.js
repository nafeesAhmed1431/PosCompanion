import { LOCAL_API_PORT as SHARED_LOCAL_API_PORT } from '../shared/index.js'

// Single source of truth for the Laravel server's base URL. There's no
// Settings-page override yet (that lands with the Sync/Device tab in a
// later phase) — an env var override keeps this trivial to point at a
// different environment per machine without editing code.
//
// Verified live 2026-09-17 against the Laragon dev install at
// c:\laragon\www\snaps_lvl_pos: the vhost is snaps_lvl_pos.test (plain
// http works fine locally despite APP_URL using https in .env).
export const LARAVEL_API_URL = process.env.LARAVEL_API_URL || 'http://snaps_lvl_pos.test'

// routes/api.php is mounted under Laravel's default `api` prefix (see
// bootstrap/app.php: api: __DIR__.'/../routes/api.php'), so the bearer-token
// endpoints are actually at /api/v1/*, NOT /v1/* as AuthController's own
// doc comment implies. Confirmed with `php artisan route:list` and a live
// curl against /api/v1/login.
export const API_V1_PATH = '/api/v1'

// Port for the local Express server the renderer talks to (see
// src/main/api/index.js). Bound to 127.0.0.1 only — never exposed on the
// LAN — so a fixed port is fine; override via env for local port conflicts.
// Re-exported from src/shared so the renderer can build the same URL
// without duplicating the port number.
export const LOCAL_API_PORT = Number(process.env.LOCAL_API_PORT) || SHARED_LOCAL_API_PORT
