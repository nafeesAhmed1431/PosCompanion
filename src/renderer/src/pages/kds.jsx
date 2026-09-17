import { useCallback, useEffect, useState } from 'react'
import { localApiUrl } from '@shared/index.js'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

// Kitchen ticket board — no direct Laravel equivalent (per the build plan),
// meant to be glanced at from a few feet away so text stays large and the
// layout stays a simple kanban of open orders grouped by status. Reuses
// the exact same /api/orders/:id/status route Orders page uses to advance
// a ticket, so status-transition rules live in one place
// (orderStatusService.js) even though two screens call it.
const POLL_MS = 4000
const ELAPSED_TICK_MS = 15000

const COLUMNS = [
  { status: 'pending', title: 'New', next: 'preparing', action: 'Start preparing' },
  { status: 'preparing', title: 'Preparing', next: 'ready', action: 'Mark ready' },
  { status: 'ready', title: 'Ready', next: 'served', action: 'Mark served' }
]

async function fetchJson(url, options) {
  const response = await fetch(url, options)
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.message || 'Request failed.')
  return data
}

function formatElapsed(iso) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000))
  if (minutes < 1) return 'just now'
  if (minutes === 1) return '1 min ago'
  return `${minutes} min ago`
}

// Loud color once a ticket has been sitting a while — kitchen glances at
// the board, not the clock, so age needs to read visually.
function elapsedClass(iso) {
  const minutes = (Date.now() - new Date(iso).getTime()) / 60000
  if (minutes >= 15) return 'text-destructive'
  if (minutes >= 8) return 'text-amber-400'
  return 'text-muted-foreground'
}

function OrderTicket({ order, tableName, column, onAdvance, busy }) {
  return (
    <Card className="border-2">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-xl capitalize">{order.order_type.replace('_', ' ')}</CardTitle>
          <span className={`text-sm font-semibold ${elapsedClass(order.created_at)}`}>
            {formatElapsed(order.created_at)}
          </span>
        </div>
        {tableName && <p className="text-lg font-medium text-foreground">{tableName}</p>}
      </CardHeader>
      <CardContent className="space-y-3">
        <ul className="space-y-1.5">
          {order.items.map((item) => (
            <li key={item.id} className="text-lg leading-tight">
              <span className="font-semibold">{item.qty}×</span> {item.name}
              {item.note && <p className="pl-6 text-base text-amber-400">↳ {item.note}</p>}
            </li>
          ))}
        </ul>
        {column && (
          <Button className="w-full text-base" size="lg" disabled={busy} onClick={() => onAdvance(order, column.next)}>
            {column.action}
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

export default function KDSPage() {
  const [restaurantId, setRestaurantId] = useState(null)
  const [orders, setOrders] = useState([])
  const [tables, setTables] = useState([])
  const [error, setError] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const [, forceTick] = useState(0)

  const load = useCallback(async () => {
    try {
      const me = await fetchJson(localApiUrl('/api/auth/me'))
      if (!me?.selectedRestaurantId) throw new Error('No restaurant selected — sign in again.')
      setRestaurantId(me.selectedRestaurantId)

      const statuses = COLUMNS.map((c) => c.status).join(',')
      const [list, tablesList] = await Promise.all([
        fetchJson(localApiUrl(`/api/orders?restaurant_id=${me.selectedRestaurantId}&statuses=${statuses}`)),
        fetch(localApiUrl('/api/tables'))
          .then((r) => (r.ok ? r.json() : []))
          .catch(() => [])
      ])
      setOrders(list ?? [])
      setTables(tablesList ?? [])
      setError(null)
    } catch (err) {
      setError(err.message)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // Same interim polling approach as Orders page — real-time push is a
  // later (multi-window ws) phase.
  useEffect(() => {
    const timer = setInterval(load, POLL_MS)
    window.addEventListener('focus', load)
    return () => {
      clearInterval(timer)
      window.removeEventListener('focus', load)
    }
  }, [load])

  // Re-render on an interval purely to refresh the "X min ago" labels —
  // no data refetch involved.
  useEffect(() => {
    const timer = setInterval(() => forceTick((n) => n + 1), ELAPSED_TICK_MS)
    return () => clearInterval(timer)
  }, [])

  const tableName = (id) => tables.find((t) => t.id === id)?.name ?? null

  async function advance(order, nextStatus) {
    setBusyId(order.id)
    setError(null)
    try {
      await fetchJson(localApiUrl(`/api/orders/${order.id}/status`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus })
      })
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="p-1">
      <div className="mb-4">
        <h1 className="font-display text-2xl font-bold">Kitchen display</h1>
        <p className="text-muted-foreground">Open tickets for this restaurant, grouped by status.</p>
      </div>

      {error && <p className="mb-3 text-sm text-destructive">{error}</p>}
      {!restaurantId && !error && <p className="text-muted-foreground">Loading…</p>}

      <div className="grid gap-4 md:grid-cols-3">
        {COLUMNS.map((column) => {
          const columnOrders = orders.filter((o) => o.status === column.status)
          return (
            <div key={column.status} className="space-y-3">
              <h2 className="font-display text-lg font-semibold">
                {column.title} <span className="text-muted-foreground">({columnOrders.length})</span>
              </h2>
              <div className="space-y-3">
                {columnOrders.length ? (
                  columnOrders.map((order) => (
                    <OrderTicket
                      key={order.id}
                      order={order}
                      tableName={tableName(order.table_id)}
                      column={column}
                      onAdvance={advance}
                      busy={busyId === order.id}
                    />
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">Nothing here.</p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
