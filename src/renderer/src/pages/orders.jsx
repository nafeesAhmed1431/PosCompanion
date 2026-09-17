import { useCallback, useEffect, useMemo, useState } from 'react'
import { localApiUrl } from '@shared/index.js'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'

// Visual layout ported from snaps_lvl_pos's orders.tsx (table list + detail
// side panel with status/table/type controls and per-item refund), minus
// its Echo/Reverb realtime wiring — that's a later phase (see project
// plan), so this screen just polls the local Express API on an interval
// and on window focus instead of subscribing to a websocket.
const POLL_MS = 5000

// Mirrors resources/js/lib/orderStatus.ts's ORDER_STATUS_META — same
// labels/colors, ported to plain Tailwind classes (no cva variant needed).
const STATUS_META = {
  pending: { label: 'Pending', className: 'bg-slate-400/15 text-slate-400' },
  preparing: { label: 'Preparing', className: 'bg-amber-400/15 text-amber-400' },
  ready: { label: 'Ready', className: 'bg-sky-400/15 text-sky-400' },
  served: { label: 'Served', className: 'bg-violet-400/15 text-violet-400' },
  completed: { label: 'Completed', className: 'bg-success/15 text-success' },
  cancelled: { label: 'Cancelled', className: 'bg-secondary text-muted-foreground' },
  refunded: { label: 'Refunded', className: 'bg-destructive/15 text-destructive' },
  partially_refunded: { label: 'Partially refunded', className: 'bg-amber-400/15 text-amber-400' }
}

const ORDER_STATUS_FLOW = ['pending', 'preparing', 'ready', 'served', 'completed']
const TERMINAL_STATUSES = ['completed', 'cancelled', 'refunded', 'partially_refunded']

function nextStatus(status) {
  const idx = ORDER_STATUS_FLOW.indexOf(status)
  if (idx === -1 || idx === ORDER_STATUS_FLOW.length - 1) return null
  return ORDER_STATUS_FLOW[idx + 1]
}

function StatusBadge({ status }) {
  const meta = STATUS_META[status] ?? { label: status, className: 'bg-secondary text-muted-foreground' }
  return <Badge className={meta.className} variant="outline">{meta.label}</Badge>
}

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

async function fetchJson(url, options) {
  const response = await fetch(url, options)
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.message || 'Request failed.')
  return data
}

export default function OrdersPage() {
  const [restaurantId, setRestaurantId] = useState(null)
  const [orders, setOrders] = useState([])
  const [customers, setCustomers] = useState([])
  const [tables, setTables] = useState([])
  const [statusFilter, setStatusFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)

  const [selectedId, setSelectedId] = useState(null)
  const [selectedDetail, setSelectedDetail] = useState(null)
  const [busy, setBusy] = useState(false)

  const [refundItemId, setRefundItemId] = useState('')
  const [refundQty, setRefundQty] = useState('1')

  const load = useCallback(async () => {
    try {
      const me = await fetchJson(localApiUrl('/api/auth/me'))
      if (!me?.selectedRestaurantId) throw new Error('No restaurant selected — sign in again.')
      setRestaurantId(me.selectedRestaurantId)

      const qs = statusFilter === 'all' ? '' : `&status=${encodeURIComponent(statusFilter)}`
      const [list, customersList, tablesList] = await Promise.all([
        fetchJson(localApiUrl(`/api/orders?restaurant_id=${me.selectedRestaurantId}${qs}`)),
        fetchJson(localApiUrl('/api/customers')).catch(() => []),
        fetch(localApiUrl('/api/tables'))
          .then((r) => (r.ok ? r.json() : []))
          .catch(() => [])
      ])
      setOrders(list ?? [])
      setCustomers(customersList ?? [])
      setTables(tablesList ?? [])
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter])

  useEffect(() => {
    load()
  }, [load])

  // Polling stand-in for the source app's Echo/Reverb live-update
  // subscription — real-time board updates are a later (KDS/multi-window)
  // phase, per the build plan. Refetch on an interval and whenever the
  // window regains focus (covers "left the app, another till changed
  // something, came back").
  useEffect(() => {
    const timer = setInterval(load, POLL_MS)
    window.addEventListener('focus', load)
    return () => {
      clearInterval(timer)
      window.removeEventListener('focus', load)
    }
  }, [load])

  const loadDetail = useCallback(async (id) => {
    try {
      const detail = await fetchJson(localApiUrl(`/api/orders/${id}`))
      setSelectedDetail(detail)
    } catch (err) {
      setError(err.message)
    }
  }, [])

  useEffect(() => {
    if (selectedId) loadDetail(selectedId)
    else setSelectedDetail(null)
  }, [selectedId, loadDetail])

  const customerName = useMemo(() => {
    const map = new Map(customers.map((c) => [c.id, c.name]))
    return (id) => (id ? map.get(id) ?? '—' : null)
  }, [customers])

  const tableName = useMemo(() => {
    const map = new Map(tables.map((t) => [t.id, t.name]))
    return (id) => (id ? map.get(id) ?? '—' : null)
  }, [tables])

  async function refreshAfterAction(id) {
    await Promise.all([load(), loadDetail(id)])
  }

  async function advance(order) {
    const target = nextStatus(order.status)
    if (!target) return
    setBusy(true)
    setNotice(null)
    try {
      await fetchJson(localApiUrl(`/api/orders/${order.id}/status`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: target })
      })
      setNotice(`Order marked as ${STATUS_META[target]?.label ?? target}.`)
      await refreshAfterAction(order.id)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function cancelOrder(order) {
    setBusy(true)
    setNotice(null)
    try {
      await fetchJson(localApiUrl(`/api/orders/${order.id}/status`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'cancelled' })
      })
      setNotice('Order cancelled.')
      await refreshAfterAction(order.id)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function reassign(order, { orderType, tableId }) {
    setBusy(true)
    setNotice(null)
    try {
      await fetchJson(localApiUrl(`/api/orders/${order.id}/reassign`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderType, tableId })
      })
      setNotice('Order updated.')
      await refreshAfterAction(order.id)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function submitRefund(order) {
    if (!refundItemId || !refundQty) return
    setBusy(true)
    setNotice(null)
    try {
      const result = await fetchJson(localApiUrl(`/api/orders/${order.id}/refund`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderItemId: refundItemId, qty: Number(refundQty) })
      })
      setNotice(`Refunded ${formatCurrency(result.refund?.total)} — order is now ${STATUS_META[result.order.status]?.label ?? result.order.status}.`)
      setRefundItemId('')
      setRefundQty('1')
      await refreshAfterAction(order.id)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  // Print bill is a Phase 6 (later) capability — see settings.jsx's
  // printer test-print stub for the same pattern.
  function handlePrint() {
    setNotice('Print not yet implemented.')
  }

  const detailOrder = selectedDetail?.order
  const detailItems = selectedDetail?.items ?? []
  const detailNext = detailOrder ? nextStatus(detailOrder.status) : null
  const detailTerminal = detailOrder ? TERMINAL_STATUSES.includes(detailOrder.status) : false
  const refundableItems = detailItems.filter((it) => it.is_refundable && it.refunded_qty < it.qty)

  return (
    <div className="p-1">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">Orders</h1>
          <p className="text-muted-foreground">All orders rung up on this till.</p>
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {Object.keys(STATUS_META).map((s) => (
              <SelectItem key={s} value={s}>
                {STATUS_META[s].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {error && <p className="mb-3 text-sm text-destructive">{error}</p>}
      {notice && <p className="mb-3 text-sm text-primary">{notice}</p>}

      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <div className="rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Table / Customer</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Time</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              ) : orders.length ? (
                orders.map((o) => (
                  <TableRow
                    key={o.id}
                    className={`cursor-pointer ${selectedId === o.id ? 'bg-secondary/60' : ''}`}
                    onClick={() => setSelectedId(o.id)}
                  >
                    <TableCell className="capitalize">{o.order_type.replace('_', ' ')}</TableCell>
                    <TableCell>{tableName(o.table_id) ?? customerName(o.customer_id) ?? 'Walk-in'}</TableCell>
                    <TableCell>
                      <StatusBadge status={o.status} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">{formatDateTime(o.created_at)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(o.total)}</TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                    No orders yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        <aside className="self-start rounded-lg border border-border p-4">
          {!detailOrder ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Select an order to see details.</p>
          ) : (
            <div className="space-y-4 text-sm">
              <div className="flex items-center justify-between">
                <p className="font-display text-lg font-semibold capitalize">
                  {detailOrder.order_type.replace('_', ' ')} order
                </p>
                <StatusBadge status={detailOrder.status} />
              </div>
              <p className="text-xs text-muted-foreground">{formatDateTime(detailOrder.created_at)}</p>

              {!detailTerminal && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="w-16 shrink-0 text-xs text-muted-foreground">Type</span>
                    <Select
                      value={detailOrder.order_type}
                      onValueChange={(orderType) =>
                        reassign(detailOrder, {
                          orderType,
                          tableId: orderType === 'dine_in' ? detailOrder.table_id : null
                        })
                      }
                    >
                      <SelectTrigger className="h-8 w-40 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="dine_in">Dine-in</SelectItem>
                        <SelectItem value="takeaway">Takeaway</SelectItem>
                        <SelectItem value="delivery">Delivery</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {detailOrder.order_type === 'dine_in' && (
                    <div className="flex items-center gap-2">
                      <span className="w-16 shrink-0 text-xs text-muted-foreground">Table</span>
                      <Select
                        value={detailOrder.table_id ?? ''}
                        onValueChange={(tableId) => reassign(detailOrder, { orderType: 'dine_in', tableId })}
                      >
                        <SelectTrigger className="h-8 w-40 text-xs">
                          <SelectValue placeholder="Pick a table…" />
                        </SelectTrigger>
                        <SelectContent>
                          {tables
                            .filter((t) => t.status === 'free' || t.id === detailOrder.table_id)
                            .map((t) => (
                              <SelectItem key={t.id} value={t.id}>
                                {t.name}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              )}

              <ul className="divide-y divide-border border-y border-border">
                {detailItems.map((it) => {
                  const fullyRefunded = it.refunded_qty >= it.qty
                  return (
                    <li key={it.id} className={`flex justify-between py-2 ${fullyRefunded ? 'text-muted-foreground line-through' : ''}`}>
                      <span>
                        {it.qty} × {it.name}
                        {it.refunded_qty > 0 && (
                          <span className="ml-1.5 rounded-full bg-destructive/15 px-1.5 py-0.5 text-[10px] font-medium text-destructive no-underline">
                            {fullyRefunded ? 'Refunded' : `Refunded ${it.refunded_qty}`}
                          </span>
                        )}
                        {!it.is_refundable && (
                          <span className="ml-1.5 rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground no-underline">
                            No refund
                          </span>
                        )}
                        {it.note && <p className="mt-0.5 text-xs text-amber-500">{it.note}</p>}
                      </span>
                      <span>{formatCurrency(it.line_total)}</span>
                    </li>
                  )
                })}
              </ul>

              <dl className="space-y-1">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Subtotal</dt>
                  <dd>{formatCurrency(detailOrder.subtotal)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Discount</dt>
                  <dd>-{formatCurrency(detailOrder.discount)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Tax</dt>
                  <dd>{formatCurrency(detailOrder.tax)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Service</dt>
                  <dd>{formatCurrency(detailOrder.service_charge)}</dd>
                </div>
                <div className="flex justify-between border-t border-border pt-1 font-semibold">
                  <dt>Total</dt>
                  <dd className="text-primary">{formatCurrency(detailOrder.total)}</dd>
                </div>
              </dl>

              {refundableItems.length > 0 && (
                <div className="space-y-2 rounded-md border border-border p-3">
                  <p className="text-xs font-medium text-muted-foreground">Refund an item</p>
                  <div className="flex items-center gap-2">
                    <Select value={refundItemId} onValueChange={setRefundItemId}>
                      <SelectTrigger className="h-8 flex-1 text-xs">
                        <SelectValue placeholder="Pick an item…" />
                      </SelectTrigger>
                      <SelectContent>
                        {refundableItems.map((it) => (
                          <SelectItem key={it.id} value={it.id}>
                            {it.name} ({it.qty - it.refunded_qty} left)
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      min="0"
                      step="any"
                      className="h-8 w-20 text-xs"
                      value={refundQty}
                      onChange={(e) => setRefundQty(e.target.value)}
                    />
                  </div>
                  <Button
                    size="sm"
                    variant="destructive"
                    className="w-full"
                    disabled={busy || !refundItemId}
                    onClick={() => submitRefund(detailOrder)}
                  >
                    Refund item
                  </Button>
                </div>
              )}

              <div className="space-y-2">
                {detailNext && (
                  <Button className="w-full" disabled={busy} onClick={() => advance(detailOrder)}>
                    Mark as {STATUS_META[detailNext]?.label}
                  </Button>
                )}
                <div className="flex gap-2">
                  <Button variant="secondary" className="flex-1" onClick={handlePrint}>
                    Print bill
                  </Button>
                  {!detailTerminal && (
                    <Button variant="secondary" className="flex-1" disabled={busy} onClick={() => cancelOrder(detailOrder)}>
                      Cancel
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}
