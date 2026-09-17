import { useCallback, useEffect, useMemo, useState } from 'react'
import { Minus, Plus, Search, Trash2, X } from 'lucide-react'
import { localApiUrl } from '@shared/index.js'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

const ORDER_TYPES = [
  { key: 'dine_in', label: 'Dine-in' },
  { key: 'takeaway', label: 'Takeaway' },
  { key: 'delivery', label: 'Delivery' }
]

function formatCurrency(value) {
  return Number(value ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

async function fetchJson(url, options) {
  const response = await fetch(url, options)
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.message || 'Request failed.')
  return data
}

// The POS ticket. Visual layout/porting target is snaps_lvl_pos's pos.tsx
// (product grid + category tabs/search on the left, cart/ticket panel on
// the right) — the table-picker/shift-bar that pos.tsx bundles inline have
// been split out into their own pages (Tables, Shifts) in this app, so this
// screen only keeps a lightweight table dropdown for dine-in orders. All
// totals math is delegated to the server-side ordersService (which itself
// just wraps orderCalc.js) via /api/orders/preview — never recomputed here.
export default function PosPage() {
  const [session, setSession] = useState(null)
  const [restaurantId, setRestaurantId] = useState(null)
  const [openShift, setOpenShift] = useState(undefined) // undefined = loading, null = none open
  const [categories, setCategories] = useState([])
  const [products, setProducts] = useState([])
  const [customers, setCustomers] = useState([])
  const [tables, setTables] = useState([])
  const [paymentMethods, setPaymentMethods] = useState([])
  const [heldOrders, setHeldOrders] = useState([])

  const [search, setSearch] = useState('')
  const [categoryId, setCategoryId] = useState(null)
  const [lines, setLines] = useState([]) // {productId, name, price, taxRate, qty, isRefundable}
  const [orderType, setOrderType] = useState('dine_in')
  const [tableId, setTableId] = useState('')
  const [customerId, setCustomerId] = useState('')
  const [discount, setDiscount] = useState('0')
  const [note, setNote] = useState('')
  const [activeOrderId, setActiveOrderId] = useState(null)
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID())

  const [totals, setTotals] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const [tenderMethod, setTenderMethod] = useState('')
  const [tenderAmount, setTenderAmount] = useState('')

  const loadReferenceData = useCallback(async () => {
    try {
      const me = await fetchJson(localApiUrl('/api/auth/me'))
      if (!me?.selectedRestaurantId) throw new Error('No restaurant selected — sign in again.')
      setSession(me)
      setRestaurantId(me.selectedRestaurantId)

      const [menu, customersList, shift, held, methods] = await Promise.all([
        fetchJson(localApiUrl('/api/menu')),
        fetchJson(localApiUrl('/api/customers')).catch(() => []),
        fetch(localApiUrl(`/api/shifts/open?restaurant_id=${me.selectedRestaurantId}`)).then((r) => (r.ok ? r.json() : null)),
        fetchJson(localApiUrl(`/api/orders/held?restaurant_id=${me.selectedRestaurantId}`)).catch(() => []),
        fetchJson(localApiUrl(`/api/orders/payment-methods?restaurant_id=${me.selectedRestaurantId}`)).catch(() => [])
      ])
      setCategories(menu.categories ?? [])
      setProducts(menu.products ?? [])
      setCustomers(customersList ?? [])
      setOpenShift(shift ?? null)
      setHeldOrders(held ?? [])
      setPaymentMethods(methods ?? [])
      if (methods?.[0]) setTenderMethod(methods[0].code)

      // Prefer the real Tables page route; fall back to the local read-only
      // copy this task's own service exposes if that route isn't mounted
      // yet (parallel task not wired into main/api/index.js at the time
      // this runs).
      try {
        const tablesRes = await fetch(localApiUrl('/api/tables'))
        if (tablesRes.ok) {
          setTables(await tablesRes.json())
        } else {
          throw new Error('tables route unavailable')
        }
      } catch {
        const fallback = await fetchJson(
          localApiUrl(`/api/orders/tables-fallback?restaurant_id=${me.selectedRestaurantId}`)
        )
        setTables(fallback ?? [])
      }
    } catch (err) {
      setError(err.message)
    }
  }, [])

  useEffect(() => {
    loadReferenceData()
  }, [loadReferenceData])

  // Live totals — recomputed by the server's orderCalc-backed preview
  // endpoint on every cart-affecting change, never derived here.
  useEffect(() => {
    if (lines.length === 0) {
      setTotals(null)
      return
    }
    let cancelled = false
    fetchJson(localApiUrl('/api/orders/preview'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lines: lines.map((l) => ({ price: l.price, qty: l.qty, taxRate: l.taxRate })),
        discount: Number(discount) || 0,
        orderType
      })
    })
      .then((data) => {
        if (!cancelled) setTotals(data)
      })
      .catch((err) => {
        if (!cancelled) setError(err.message)
      })
    return () => {
      cancelled = true
    }
  }, [lines, discount, orderType])

  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      if (categoryId && p.category_id !== categoryId) return false
      if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false
      return true
    })
  }, [products, categoryId, search])

  function addProduct(product) {
    setLines((prev) => {
      const existing = prev.find((l) => l.productId === product.id)
      if (existing) {
        return prev.map((l) => (l.productId === product.id ? { ...l, qty: l.qty + 1 } : l))
      }
      return [
        ...prev,
        {
          productId: product.id,
          name: product.name,
          price: Number(product.display_price ?? product.price),
          taxRate: Number(product.tax_rate),
          qty: 1,
          isRefundable: !!product.is_refundable
        }
      ]
    })
  }

  function changeQty(productId, delta) {
    setLines((prev) =>
      prev
        .map((l) => (l.productId === productId ? { ...l, qty: l.qty + delta } : l))
        .filter((l) => l.qty > 0)
    )
  }

  function removeLine(productId) {
    setLines((prev) => prev.filter((l) => l.productId !== productId))
  }

  function resetTicket() {
    setLines([])
    setDiscount('0')
    setNote('')
    setTableId('')
    setCustomerId('')
    setActiveOrderId(null)
    setIdempotencyKey(crypto.randomUUID())
  }

  function resumeHeldOrder(order) {
    setLines(
      order.items.map((item) => ({
        productId: item.product_id,
        name: item.name,
        price: Number(item.unit_price),
        taxRate: 0, // tax rate isn't stored per line item — re-added items still get taxed via the product's current rate on the next preview if edited, held totals shown are the order's own stored total
        qty: item.qty,
        isRefundable: !!item.is_refundable
      }))
    )
    setOrderType(order.order_type)
    setTableId(order.table_id ?? '')
    setCustomerId(order.customer_id ?? '')
    setDiscount(String(order.discount ?? 0))
    setActiveOrderId(order.id)
    setIdempotencyKey(order.idempotency_key)
  }

  function buildPayload() {
    return {
      restaurantId,
      orderType,
      tableId: orderType === 'dine_in' ? tableId || null : null,
      customerId: customerId || null,
      lines: lines.map((l) => ({
        productId: l.productId,
        name: l.name,
        price: l.price,
        taxRate: l.taxRate,
        qty: l.qty,
        isRefundable: l.isRefundable
      })),
      discount: Number(discount) || 0,
      note: note || null,
      idempotencyKey,
      createdBy: session?.user?.id ?? null,
      shiftId: openShift?.id ?? null
    }
  }

  async function handleHold() {
    if (lines.length === 0) return
    setBusy(true)
    setError(null)
    try {
      await fetchJson(localApiUrl('/api/orders/hold'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload())
      })
      resetTicket()
      await loadReferenceData()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function handleCheckout() {
    setBusy(true)
    setError(null)
    try {
      const amount = Number(tenderAmount) || totals?.total || 0
      await fetchJson(localApiUrl('/api/orders/checkout'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...buildPayload(),
          orderId: activeOrderId,
          payments: [{ method: tenderMethod, amount, tenderedAmount: amount }]
        })
      })
      setCheckoutOpen(false)
      setTenderAmount('')
      resetTicket()
      await loadReferenceData()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  if (openShift === null) {
    return (
      <div className="p-1">
        <h1 className="font-display text-2xl font-bold">POS</h1>
        <p className="mt-2 text-sm text-destructive">
          No shift is open on this till. Open one from the Shifts page before ringing up orders.
        </p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col gap-4 p-1 lg:flex-row">
      {error && (
        <div className="fixed inset-x-0 top-2 z-50 mx-auto w-fit rounded-md border border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive shadow">
          {error}{' '}
          <button className="ml-2 underline" onClick={() => setError(null)}>
            dismiss
          </button>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search products…"
              className="pl-8"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <Tabs value={categoryId ?? 'all'} onValueChange={(v) => setCategoryId(v === 'all' ? null : v)}>
          <TabsList className="flex-wrap">
            <TabsTrigger value="all">All</TabsTrigger>
            {categories.map((c) => (
              <TabsTrigger key={c.id} value={c.id}>
                {c.name}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="grid flex-1 grid-cols-2 gap-3 overflow-y-auto pb-2 sm:grid-cols-3 xl:grid-cols-4">
          {filteredProducts.map((product) => (
            <button
              key={product.id}
              onClick={() => addProduct(product)}
              className="flex flex-col items-start gap-1 rounded-xl border border-border bg-card p-3 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
            >
              <span className="line-clamp-2 text-sm font-medium">{product.name}</span>
              <span className="text-sm font-semibold text-primary">
                {formatCurrency(product.display_price ?? product.price)}
              </span>
            </button>
          ))}
          {filteredProducts.length === 0 && (
            <p className="col-span-full py-10 text-center text-sm text-muted-foreground">No products match.</p>
          )}
        </div>

        {heldOrders.length > 0 && (
          <div className="border-t border-border pt-3">
            <p className="mb-2 text-xs font-semibold text-muted-foreground uppercase">Held orders</p>
            <div className="flex flex-wrap gap-2">
              {heldOrders.map((order) => (
                <Button key={order.id} variant="outline" size="sm" onClick={() => resumeHeldOrder(order)}>
                  #{order.order_no ?? order.id.slice(0, 8)} · {formatCurrency(order.total)}
                </Button>
              ))}
            </div>
          </div>
        )}
      </div>

      <Card className="flex w-full flex-col lg:w-96 lg:shrink-0">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Ticket</CardTitle>
          <Tabs value={orderType} onValueChange={setOrderType}>
            <TabsList className="grid w-full grid-cols-3">
              {ORDER_TYPES.map((t) => (
                <TabsTrigger key={t.key} value={t.key}>
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col gap-3 overflow-hidden">
          {orderType === 'dine_in' && (
            <div className="space-y-1.5">
              <Label>Table</Label>
              <Select value={tableId} onValueChange={setTableId}>
                <SelectTrigger>
                  <SelectValue placeholder="Pick a table" />
                </SelectTrigger>
                <SelectContent>
                  {tables.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Customer (optional)</Label>
            <Select value={customerId || '__none'} onValueChange={(v) => setCustomerId(v === '__none' ? '' : v)}>
              <SelectTrigger>
                <SelectValue placeholder="Walk-in" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">Walk-in</SelectItem>
                {customers.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex-1 space-y-2 overflow-y-auto">
            {lines.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">Tap products to add them here.</p>
            )}
            {lines.map((line) => (
              <div key={line.productId} className="flex items-center gap-2 rounded-lg border border-border p-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{line.name}</p>
                  <p className="text-xs text-muted-foreground">{formatCurrency(line.price)} each</p>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="icon" className="size-7" onClick={() => changeQty(line.productId, -1)}>
                    <Minus className="size-3" />
                  </Button>
                  <span className="w-6 text-center text-sm">{line.qty}</span>
                  <Button variant="outline" size="icon" className="size-7" onClick={() => changeQty(line.productId, 1)}>
                    <Plus className="size-3" />
                  </Button>
                </div>
                <Button variant="ghost" size="icon" className="size-7 text-destructive" onClick={() => removeLine(line.productId)}>
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            ))}
          </div>

          <div className="space-y-1.5 border-t border-border pt-3">
            <Label htmlFor="discount">Discount (flat amount)</Label>
            <Input id="discount" type="number" min="0" step="0.01" value={discount} onChange={(e) => setDiscount(e.target.value)} />
          </div>

          {totals && (
            <div className="space-y-1 rounded-lg border border-border bg-secondary/40 p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span>{formatCurrency(totals.subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Discount</span>
                <span>-{formatCurrency(totals.discountValue)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tax</span>
                <span>{formatCurrency(totals.tax)}</span>
              </div>
              {orderType === 'dine_in' && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Service charge</span>
                  <span>{formatCurrency(totals.serviceCharge)}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-border pt-1 text-base font-bold">
                <span>Total</span>
                <span>{formatCurrency(totals.total)}</span>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" disabled={busy || lines.length === 0} onClick={handleHold}>
              Hold
            </Button>
            <Button
              disabled={busy || lines.length === 0 || paymentMethods.length === 0}
              onClick={() => {
                setTenderAmount(totals ? String(totals.total) : '')
                setCheckoutOpen(true)
              }}
            >
              Checkout
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={checkoutOpen} onOpenChange={setCheckoutOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Take payment</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Method</Label>
              <Select value={tenderMethod} onValueChange={setTenderMethod}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a method" />
                </SelectTrigger>
                <SelectContent>
                  {paymentMethods.map((pm) => (
                    <SelectItem key={pm.id} value={pm.code}>
                      {pm.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tenderAmount">Amount tendered</Label>
              <Input
                id="tenderAmount"
                type="number"
                step="0.01"
                min="0"
                value={tenderAmount}
                onChange={(e) => setTenderAmount(e.target.value)}
              />
            </div>
            {totals && <p className="text-sm text-muted-foreground">Total due: {formatCurrency(totals.total)}</p>}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCheckoutOpen(false)}>
              <X className="size-4" /> Cancel
            </Button>
            <Button disabled={busy || !tenderMethod} onClick={handleCheckout}>
              {busy ? 'Processing…' : 'Complete sale'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
