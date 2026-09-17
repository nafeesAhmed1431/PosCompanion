import { app, shell, BrowserWindow } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { getDb } from './db/index.js'
import { createApiApp } from './api/index.js'
import { LOCAL_API_PORT } from './config.js'

// Starts the local Express server the renderer talks to instead of raw IPC
// (see build plan) — bound to 127.0.0.1 only, never the LAN, since it's
// purely an in-process communication channel for this one till. The
// loopback binding and CORS setup themselves live in the generic
// main/lib/local-api-server.js factory; this file only wires up the
// POS-specific routers via createApiApp (main/api/index.js).
async function startApiServer() {
  const server = createApiApp(LOCAL_API_PORT)
  await server.start()
  console.log(`[api] local server listening on http://127.0.0.1:${LOCAL_API_PORT}`)
  return server
}

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  // Till hardware runs one kiosk window against our own bundled renderer —
  // any window.open() attempt (e.g. a stray target="_blank") should go to
  // the OS browser instead of spawning an uncontrolled second Electron window.
  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('tech.codecapital.poscompanion')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // DB must be ready (migrations applied) before the API server starts
  // accepting requests, and the API server must be listening before the
  // renderer window loads and its auth guard calls GET /api/auth/me.
  getDb()
  await startApiServer()

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
