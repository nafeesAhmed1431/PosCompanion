import { useCallback, useEffect, useState } from 'react'
import { Clock, DoorClosed, DoorOpen, RefreshCw } from 'lucide-react'
import { localApiUrl } from '@shared/index.js'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

function formatCurrency(value) {
  return Number(value ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatDateTime(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

// Shift history + open/close for this till. Deliberately simple (a card,
// a form, a table) — this screen isn't the core POS flow, just the cash-
// drawer bookkeeping around it, so it doesn't need the same visual effort
// as pos.jsx.
export default function ShiftsPage() {
  const [session, setSession] = useState(null)
  const [openShift, setOpenShift] = useState(null)
  const [figures, setFigures] = useState(null)
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const [label, setLabel] = useState('')
  const [openingBalance, setOpeningBalance] = useState('0')
  const [closingBalance, setClosingBalance] = useState('0')

  const load = useCallback(async () => {
    setError(null)
    try {
      const meRes = await fetch(localApiUrl('/api/auth/me'))
      const me = await meRes.json()
      if (!meRes.ok || !me?.selectedRestaurantId) {
        throw new Error('No restaurant selected — sign in again.')
      }
      setSession(me)

      const restaurantId = me.selectedRestaurantId
      const openRes = await fetch(localApiUrl(`/api/shifts/open?restaurant_id=${restaurantId}`))
      const open = await openRes.json()
      setOpenShift(open)

      if (open) {
        const figRes = await fetch(localApiUrl(`/api/shifts/${open.id}/figures`))
        setFigures(figRes.ok ? await figRes.json() : null)
      } else {
        setFigures(null)
      }

      const historyRes = await fetch(localApiUrl(`/api/shifts?restaurant_id=${restaurantId}`))
      setHistory(historyRes.ok ? await historyRes.json() : [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function handleOpenShift(e) {
    e.preventDefault()
    if (!session) return
    setBusy(true)
    setError(null)
    try {
      const response = await fetch(localApiUrl('/api/shifts/open'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: label || null,
          openingBalance: Number(openingBalance) || 0,
          userId: session.user.id,
          restaurantId: session.selectedRestaurantId
        })
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.message || 'Could not open the shift.')
      setLabel('')
      setOpeningBalance('0')
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function handleCloseShift(e) {
    e.preventDefault()
    if (!openShift) return
    setBusy(true)
    setError(null)
    try {
      const response = await fetch(localApiUrl(`/api/shifts/${openShift.id}/close`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ closingBalance: Number(closingBalance) || 0 })
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.message || 'Could not close the shift.')
      setClosingBalance('0')
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="p-1">
        <h1 className="font-display text-2xl font-bold">Shifts</h1>
        <p className="mt-2 text-muted-foreground">Loading shift status…</p>
      </div>
    )
  }

  return (
    <div className="p-1">
      <h1 className="font-display text-2xl font-bold">Shifts</h1>
      <p className="text-muted-foreground">Open, review, and close this till's cash-drawer shifts.</p>

      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {openShift ? (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="flex items-center gap-2 text-base">
                <DoorOpen className="size-4 text-success" /> Shift open
              </CardTitle>
              <Button variant="ghost" size="icon" onClick={load} aria-label="Refresh">
                <RefreshCw className="size-4" />
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-sm text-muted-foreground">
                {openShift.label || 'Untitled shift'} · opened {formatDateTime(openShift.opened_at)}
              </div>

              {figures && (
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-muted-foreground">Opening balance</p>
                    <p className="font-semibold">{formatCurrency(figures.openingBalance)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Orders this shift</p>
                    <p className="font-semibold">{figures.ordersCount}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Cash sales</p>
                    <p className="font-semibold">{formatCurrency(figures.cashSales)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Card sales</p>
                    <p className="font-semibold">{formatCurrency(figures.cardSales)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Transfer sales</p>
                    <p className="font-semibold">{formatCurrency(figures.transferSales)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Refunds</p>
                    <p className="font-semibold">{formatCurrency(figures.refundsTotal)}</p>
                  </div>
                  <div className="col-span-2 rounded-lg border border-border bg-secondary/40 p-3">
                    <p className="text-muted-foreground">Expected cash in drawer</p>
                    <p className="text-lg font-bold">{formatCurrency(figures.expectedCash)}</p>
                  </div>
                </div>
              )}

              <form className="space-y-3 border-t border-border pt-4" onSubmit={handleCloseShift}>
                <div className="space-y-1.5">
                  <Label htmlFor="closingBalance">Closing balance (counted cash)</Label>
                  <Input
                    id="closingBalance"
                    type="number"
                    step="0.01"
                    min="0"
                    value={closingBalance}
                    onChange={(e) => setClosingBalance(e.target.value)}
                  />
                </div>
                <Button type="submit" variant="destructive" disabled={busy} className="w-full">
                  <DoorClosed className="size-4" /> {busy ? 'Closing…' : 'Close shift'}
                </Button>
              </form>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <DoorClosed className="size-4 text-muted-foreground" /> No shift open
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-4 text-sm text-muted-foreground">
                Open a shift before ringing up orders in POS.
              </p>
              <form className="space-y-3" onSubmit={handleOpenShift}>
                <div className="space-y-1.5">
                  <Label htmlFor="label">Label</Label>
                  <Input
                    id="label"
                    placeholder="e.g. Morning shift"
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="openingBalance">Opening balance</Label>
                  <Input
                    id="openingBalance"
                    type="number"
                    step="0.01"
                    min="0"
                    value={openingBalance}
                    onChange={(e) => setOpeningBalance(e.target.value)}
                  />
                </div>
                <Button type="submit" disabled={busy} className="w-full">
                  <DoorOpen className="size-4" /> {busy ? 'Opening…' : 'Open shift'}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Shift history</CardTitle>
          </CardHeader>
          <CardContent>
            {history.length ? (
              <ul className="divide-y divide-border text-sm">
                {history.map((shift) => (
                  <li key={shift.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{shift.label || 'Untitled shift'}</p>
                      <p className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="size-3" /> {formatDateTime(shift.opened_at)}
                        {shift.closed_at ? ` – ${formatDateTime(shift.closed_at)}` : ''}
                      </p>
                    </div>
                    <span
                      className={
                        shift.status === 'open'
                          ? 'shrink-0 rounded-md border border-success/30 bg-success/10 px-2 py-1 text-[11px] font-medium text-success'
                          : 'shrink-0 rounded-md border border-border bg-secondary px-2 py-1 text-[11px] font-medium text-muted-foreground'
                      }
                    >
                      {shift.status}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">No shifts recorded yet.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
