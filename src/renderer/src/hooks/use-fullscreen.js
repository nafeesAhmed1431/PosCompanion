import { useCallback, useEffect, useState } from 'react'

// Ported from snaps_lvl_pos's use-fullscreen.ts, minus initFullscreenNavigationRecovery
// (that worked around Inertia SPA navigations dropping fullscreen on some
// Android WebViews — irrelevant here since this is a native Electron window,
// which never unloads/reloads its document on route changes).
export function useFullscreen() {
  const [isFullscreen, setIsFullscreen] = useState(() => !!document.fullscreenElement)

  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  const enter = useCallback(async () => {
    try {
      await document.documentElement.requestFullscreen()
    } catch {
      // Blocked or unsupported — nothing more to do.
    }
  }, [])

  const exit = useCallback(() => {
    if (document.fullscreenElement) {
      Promise.resolve(document.exitFullscreen()).catch(() => {})
    }
  }, [])

  const toggle = useCallback(() => {
    if (document.fullscreenElement) exit()
    else enter()
  }, [enter, exit])

  return { isFullscreen, enter, exit, toggle }
}
