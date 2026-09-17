import { useEffect, useState } from 'react'
import { CircleDollarSign, Clock, PackageCheck, ReceiptText, RefreshCw } from 'lucide-react'
import { localApiUrl } from '@shared/index.js'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

function formatCurrency(value) {
  return Number(value ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatDateTime(iso) {
  if (!iso) return null
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

// All stats come from statsService.js reading LOCAL SQLite only (no server
// round-trip) — see main/api/statsRoutes.js (GET /api/stats). Every number
// here can legitimately be zero right now (no orders have been rung up via
// POS yet), so every card gets a deliberate empty-state message instead of
// a bare "0" that could read as broken.
export default function DashboardPage() {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const response = await fetch(localApiUrl('/api/stats'))
        const data = await response.json()
        if (!response.ok) throw new Error(data.message || 'Could not load dashboard stats.')
        if (!cancelled) setStats(data)
      } catch (err) {
        if (!cancelled) setError(err.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  if (loading) {
    return (
      <div className="p-1">
        <h1 className="font-display text-2xl font-bold">Dashboard</h1>
        <p className="mt-2 text-muted-foreground">Loading today's numbers…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-1">
        <h1 className="font-display text-2xl font-bold">Dashboard</h1>
        <p className="mt-2 text-sm text-destructive">{error}</p>
      </div>
    )
  }

  const { todaySales, topItems, currentShift, sync } = stats
  const hasSales = todaySales.count > 0

  return (
    <div className="p-1">
      <h1 className="font-display text-2xl font-bold">Dashboard</h1>
      <p className="text-muted-foreground">Today's snapshot for this till, computed from local data.</p>

      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Today's sales</CardTitle>
            <CircleDollarSign className="size-4 text-icon-emerald" />
          </CardHeader>
          <CardContent>
            {hasSales ? (
              <>
                <p className="text-2xl font-bold">{formatCurrency(todaySales.total)}</p>
                <p className="text-xs text-muted-foreground">
                  {todaySales.count} order{todaySales.count === 1 ? '' : 's'} today
                </p>
              </>
            ) : (
              <>
                <p className="text-2xl font-bold text-muted-foreground">—</p>
                <p className="text-xs text-muted-foreground">No sales yet today.</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Average ticket</CardTitle>
            <ReceiptText className="size-4 text-icon-sky" />
          </CardHeader>
          <CardContent>
            {hasSales ? (
              <p className="text-2xl font-bold">{formatCurrency(todaySales.avgTicket)}</p>
            ) : (
              <>
                <p className="text-2xl font-bold text-muted-foreground">—</p>
                <p className="text-xs text-muted-foreground">Nothing to average yet.</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Shift status</CardTitle>
            <Clock className="size-4 text-icon-amber" />
          </CardHeader>
          <CardContent>
            {currentShift ? (
              <>
                <p className="text-2xl font-bold text-success">Open</p>
                <p className="text-xs text-muted-foreground">
                  Opening balance {formatCurrency(currentShift.opening_balance)}
                </p>
              </>
            ) : (
              <>
                <p className="text-2xl font-bold text-muted-foreground">Closed</p>
                <p className="text-xs text-muted-foreground">No shift currently open.</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Local data</CardTitle>
            <PackageCheck className="size-4 text-icon-violet" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {sync.productsCount} / {sync.customersCount}
            </p>
            <p className="text-xs text-muted-foreground">products cached / customers cached</p>
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Top-selling items today</CardTitle>
          </CardHeader>
          <CardContent>
            {topItems.length ? (
              <ul className="divide-y divide-border">
                {topItems.map((item) => (
                  <li key={item.name} className="flex items-center justify-between py-2 text-sm">
                    <span className="font-medium">{item.name}</span>
                    <span className="text-muted-foreground">
                      {item.qty} sold · {formatCurrency(item.revenue)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No items sold yet today — ring up an order on the POS screen to see it here.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Sync health</CardTitle>
            <RefreshCw className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              <span className="text-muted-foreground">Last full sync: </span>
              {sync.syncedAt ? formatDateTime(sync.syncedAt) : 'Never — run Sync Now in Settings.'}
            </p>
            <p className="text-muted-foreground">
              {sync.productsCount} products, {sync.customersCount} customers cached locally.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
