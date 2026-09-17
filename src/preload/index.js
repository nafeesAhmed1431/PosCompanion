import { contextBridge } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// No custom bridge API yet — Phase 0 is shell-only. Later phases expose the
// local Express/DB/printing calls here rather than opening full Node access
// to the renderer (contextIsolation stays on).
const api = {}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  window.electron = electronAPI
  window.api = api
}
