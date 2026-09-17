import { Fragment, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { LogOut, Pencil, Plus, Printer, RefreshCw, Trash2 } from 'lucide-react'
import { localApiUrl } from '@shared/index.js'
import { useAuth } from '@/lib/auth-context'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel
} from '@/components/ui/alert-dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'

function formatDateTime(iso) {
  if (!iso) return null
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

// connection_config default shape per printer type, matching what
// printersService.js expects (see its top-of-file comment). Kept as one
// object so switching the "type" select in the form can reset to sane
// defaults for the newly chosen type.
const CONNECTION_DEFAULTS = {
  usb: { vendorId: '', productId: '' },
  serial: { path: '', baudRate: '9600' },
  network: { ip: '', port: '9100' }
}

const EMPTY_PRINTER_FORM = {
  name: '',
  type: 'usb',
  ticket_type: 'receipt',
  is_default: false,
  connection_config: CONNECTION_DEFAULTS.usb
}

function ConnectionConfigFields({ type, config, onChange }) {
  if (type === 'usb') {
    return (
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="vendorId">Vendor ID</Label>
          <Input
            id="vendorId"
            placeholder="0x04b8"
            value={config.vendorId ?? ''}
            onChange={(e) => onChange({ ...config, vendorId: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="productId">Product ID</Label>
          <Input
            id="productId"
            placeholder="0x0202"
            value={config.productId ?? ''}
            onChange={(e) => onChange({ ...config, productId: e.target.value })}
          />
        </div>
      </div>
    )
  }

  if (type === 'serial') {
    return (
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="path">Port path</Label>
          <Input
            id="path"
            placeholder="COM3 or /dev/ttyUSB0"
            value={config.path ?? ''}
            onChange={(e) => onChange({ ...config, path: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="baudRate">Baud rate</Label>
          <Input
            id="baudRate"
            type="number"
            value={config.baudRate ?? ''}
            onChange={(e) => onChange({ ...config, baudRate: e.target.value })}
          />
        </div>
      </div>
    )
  }

  // network
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="space-y-1.5">
        <Label htmlFor="ip">IP address</Label>
        <Input
          id="ip"
          placeholder="192.168.1.50"
          value={config.ip ?? ''}
          onChange={(e) => onChange({ ...config, ip: e.target.value })}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="port">Port</Label>
        <Input
          id="port"
          type="number"
          value={config.port ?? ''}
          onChange={(e) => onChange({ ...config, port: e.target.value })}
        />
      </div>
    </div>
  )
}

function PrintersTab() {
  const [printers, setPrinters] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(EMPTY_PRINTER_FORM)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [testMessage, setTestMessage] = useState(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(localApiUrl('/api/printers'))
      const data = await response.json()
      if (!response.ok) throw new Error(data.message || 'Could not load printers.')
      setPrinters(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  function openCreate() {
    setEditingId(null)
    setForm(EMPTY_PRINTER_FORM)
    setFormError(null)
    setDialogOpen(true)
  }

  function openEdit(printer) {
    setEditingId(printer.id)
    setForm({
      name: printer.name,
      type: printer.type,
      ticket_type: printer.ticket_type,
      is_default: !!printer.is_default,
      connection_config: { ...CONNECTION_DEFAULTS[printer.type], ...printer.connection_config }
    })
    setFormError(null)
    setDialogOpen(true)
  }

  function handleTypeChange(type) {
    setForm((f) => ({ ...f, type, connection_config: CONNECTION_DEFAULTS[type] }))
  }

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    setFormError(null)
    try {
      const url = editingId ? `/api/printers/${editingId}` : '/api/printers'
      const response = await fetch(localApiUrl(url), {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.message || 'Could not save printer.')
      setDialogOpen(false)
      await load()
    } catch (err) {
      setFormError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    try {
      await fetch(localApiUrl(`/api/printers/${deleteTarget.id}`), { method: 'DELETE' })
      setDeleteTarget(null)
      await load()
    } catch (err) {
      setError(err.message)
      setDeleteTarget(null)
    }
  }

  // Stub only — see printersService.testPrint. Intentionally shows the
  // "not implemented" message rather than pretending to print.
  async function handleTestPrint(printer) {
    setTestMessage(null)
    try {
      const response = await fetch(localApiUrl(`/api/printers/${printer.id}/test-print`), {
        method: 'POST'
      })
      const data = await response.json()
      setTestMessage({ id: printer.id, text: data.message })
    } catch (err) {
      setTestMessage({ id: printer.id, text: err.message })
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Printer profiles attached to this till. One printer can be the default per ticket type.
        </p>
        <Button onClick={openCreate}>
          <Plus className="size-4" /> Add printer
        </Button>
      </div>

      {error && <p className="mb-3 text-sm text-destructive">{error}</p>}

      <div className="rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Ticket type</TableHead>
              <TableHead>Default</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  Loading…
                </TableCell>
              </TableRow>
            ) : printers.length ? (
              printers.map((p) => (
                <Fragment key={p.id}>
                  <TableRow>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell className="uppercase text-muted-foreground">{p.type}</TableCell>
                    <TableCell className="capitalize text-muted-foreground">{p.ticket_type}</TableCell>
                    <TableCell>{p.is_default ? 'Yes' : '—'}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => handleTestPrint(p)}>
                          <Printer className="size-4" /> Test print
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => openEdit(p)}>
                          <Pencil className="size-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(p)}>
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                  {testMessage?.id === p.id && (
                    <TableRow>
                      <TableCell colSpan={5} className="border-t-0 pt-0 text-xs text-muted-foreground">
                        {testMessage.text}
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  No printers configured yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit printer' : 'Add printer'}</DialogTitle>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleSave}>
            <div className="space-y-1.5">
              <Label htmlFor="printerName">Name</Label>
              <Input
                id="printerName"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Connection type</Label>
                <Select value={form.type} onValueChange={handleTypeChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="usb">USB</SelectItem>
                    <SelectItem value="serial">Serial</SelectItem>
                    <SelectItem value="network">Network</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Ticket type</Label>
                <Select
                  value={form.ticket_type}
                  onValueChange={(ticket_type) => setForm((f) => ({ ...f, ticket_type }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="receipt">Receipt</SelectItem>
                    <SelectItem value="kitchen">Kitchen</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <ConnectionConfigFields
              type={form.type}
              config={form.connection_config}
              onChange={(connection_config) => setForm((f) => ({ ...f, connection_config }))}
            />

            <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
              <div>
                <p className="text-sm font-medium">Default for {form.ticket_type} tickets</p>
                <p className="text-xs text-muted-foreground">
                  Replaces any other printer currently default for this ticket type.
                </p>
              </div>
              <Switch
                checked={form.is_default}
                onCheckedChange={(is_default) => setForm((f) => ({ ...f, is_default }))}
              />
            </div>

            {formError && <p className="text-sm text-destructive">{formError}</p>}
            <DialogFooter>
              <Button type="submit" disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This printer profile will be permanently removed from this till.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function SyncTab() {
  const [sync, setSync] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState(null)
  const [intervalInput, setIntervalInput] = useState('')
  const [savingInterval, setSavingInterval] = useState(false)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(localApiUrl('/api/settings/sync'))
      const data = await response.json()
      if (!response.ok) throw new Error(data.message || 'Could not load sync settings.')
      setSync(data)
      setIntervalInput(String(data.intervalMinutes))
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  // Calls the EXISTING bootstrap sync endpoint (main/api/syncRoutes.js,
  // built in an earlier phase) — this page doesn't own that logic, only
  // triggers it and refreshes the summary shown here afterwards.
  async function handleSyncNow() {
    setSyncing(true)
    setSyncResult(null)
    try {
      const response = await fetch(localApiUrl('/api/sync/bootstrap'), { method: 'POST' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.message || 'Sync failed.')
      setSyncResult({ ok: true, message: `Synced ${data.productsCount} products, ${data.customersCount} customers.` })
      await load()
    } catch (err) {
      setSyncResult({ ok: false, message: err.message })
    } finally {
      setSyncing(false)
    }
  }

  async function handleSaveInterval(e) {
    e.preventDefault()
    setSavingInterval(true)
    setError(null)
    try {
      const response = await fetch(localApiUrl('/api/settings/sync'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intervalMinutes: Number(intervalInput) })
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.message || 'Could not save sync interval.')
      setSync(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setSavingInterval(false)
    }
  }

  if (loading) return <p className="text-sm text-muted-foreground">Loading…</p>

  return (
    <div className="max-w-xl space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Bootstrap sync</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm">
            <span className="text-muted-foreground">Last full sync: </span>
            {sync.syncedAt ? formatDateTime(sync.syncedAt) : 'Never'}
          </p>
          <p className="text-sm text-muted-foreground">
            {sync.productsCount} products, {sync.customersCount} customers cached locally.
          </p>
          <Button onClick={handleSyncNow} disabled={syncing}>
            <RefreshCw className={syncing ? 'size-4 animate-spin' : 'size-4'} />
            {syncing ? 'Syncing…' : 'Sync now'}
          </Button>
          {syncResult && (
            <p className={syncResult.ok ? 'text-sm text-success' : 'text-sm text-destructive'}>
              {syncResult.message}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Automatic sync interval</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="flex items-end gap-3" onSubmit={handleSaveInterval}>
            <div className="space-y-1.5">
              <Label htmlFor="interval">Minutes between syncs</Label>
              <Input
                id="interval"
                type="number"
                min="1"
                className="w-32"
                value={intervalInput}
                onChange={(e) => setIntervalInput(e.target.value)}
              />
            </div>
            <Button type="submit" disabled={savingInterval}>
              {savingInterval ? 'Saving…' : 'Save'}
            </Button>
          </form>
          <p className="mt-2 text-xs text-muted-foreground">
            Saved for the automatic background sync engine to use once it's built — this only
            persists the value for now.
          </p>
          {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>
    </div>
  )
}

function DeviceTab() {
  const navigate = useNavigate()
  const { setGuest } = useAuth()
  const [me, setMe] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    fetch(localApiUrl('/api/auth/me'))
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setMe(data)
      })
      .catch((err) => {
        if (!cancelled) setError(err.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Exactly the same sign-out sequence as app-shell.jsx's handleSignOut —
  // call /api/auth/logout, then update the shared auth context, then
  // navigate — so both places behave identically instead of drifting.
  async function handleSignOut() {
    try {
      await fetch(localApiUrl('/api/auth/logout'), { method: 'POST' })
    } finally {
      setGuest()
      navigate('/login')
    }
  }

  if (loading) return <p className="text-sm text-muted-foreground">Loading…</p>
  if (error) return <p className="text-sm text-destructive">{error}</p>

  const restaurant = me?.restaurants?.find((r) => r.id === me?.selectedRestaurantId)

  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle className="text-base">This device</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-muted-foreground">Signed in as</p>
            <p className="font-medium">{me?.user?.full_name}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Email</p>
            <p className="font-medium">{me?.user?.email}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Role</p>
            <p className="font-medium">{me?.user?.role_name || '—'}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Restaurant</p>
            <p className="font-medium">{restaurant?.name || '—'}</p>
          </div>
        </div>
        <Button variant="destructive" onClick={handleSignOut}>
          <LogOut className="size-4" /> Sign out
        </Button>
      </CardContent>
    </Card>
  )
}

export default function SettingsPage() {
  return (
    <div className="p-1">
      <h1 className="font-display text-2xl font-bold">Settings</h1>
      <p className="mb-4 text-muted-foreground">Printers, sync, and this device.</p>

      <Tabs defaultValue="printers">
        <TabsList>
          <TabsTrigger value="printers">Printers</TabsTrigger>
          <TabsTrigger value="sync">Sync</TabsTrigger>
          <TabsTrigger value="device">Device</TabsTrigger>
        </TabsList>
        <TabsContent value="printers">
          <PrintersTab />
        </TabsContent>
        <TabsContent value="sync">
          <SyncTab />
        </TabsContent>
        <TabsContent value="device">
          <DeviceTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
