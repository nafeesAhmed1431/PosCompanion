import { useEffect, useState } from 'react'

// Phase 0 stub: raw navigator.onLine + the online/offline window events,
// same as the OS network-interface signal the source app's useOnlineStatus
// backs with an actual server ping. Real reachability/sync-aware status
// (pinging the local Express API and the remote Laravel server) lands with
// the Phase 5 sync engine — this is just enough for the header badge to be
// wired up and visually correct now.
export function useOnlineStatus() {
  const [online, setOnline] = useState(navigator.onLine)

  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])

  return online
}
