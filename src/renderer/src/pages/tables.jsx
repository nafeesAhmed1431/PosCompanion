import { useEffect, useState } from 'react'
import { Plus, Table2 } from 'lucide-react'
import { localApiUrl } from '@shared/index.js'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from '@/components/ui/dialog'

// Same status palette/meaning as snaps_lvl_pos's lib/tableStatus.ts +
// components/TableTile.tsx, ported to plain Tailwind classes (no cva needed
// for three fixed states).
const STATUS_META = {
  free: { label: 'Free', badge: 'text-emerald-400 bg-emerald-400/15', tile: 'border-emerald-400/40 bg-emerald-400/10 hover:border-emerald-400' },
  occupied: { label: 'Occupied', badge: 'text-destructive bg-destructive/15', tile: 'border-destructive/40 bg-destructive/10 hover:border-destructive' },
  reserved: { label: 'Reserved', badge: 'text-amber-400 bg-amber-400/15', tile: 'border-amber-400/40 bg-amber-400/10 hover:border-amber-400' }
}
const STATUS_CYCLE = ['free', 'occupied', 'reserved']

// Standalone floor view, pulled out of pos.tsx's inline table picker per the
// build plan — pure local CRUD against restaurant_tables, no Laravel calls.
export default function TablesPage() {
  const [tables, setTables] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState({ name: '', seats: 2 })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(localApiUrl('/api/tables'))
      const data = await response.json()
      if (!response.ok) throw new Error(data.message || 'Could not load tables.')
      setTables(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  // Clicking a tile cycles free -> occupied -> reserved -> free, which
  // covers the everyday "mark free again after a walk-out" / "mark
  // reserved" actions with a single click instead of a status dropdown.
  async function cycleStatus(table) {
    const next = STATUS_CYCLE[(STATUS_CYCLE.indexOf(table.status) + 1) % STATUS_CYCLE.length]
    // Optimistic update so the tile flips instantly instead of waiting on
    // the round-trip — reverted via a fresh load() if the request fails.
    setTables((prev) => prev.map((t) => (t.id === table.id ? { ...t, status: next } : t)))
    try {
      const response = await fetch(localApiUrl(`/api/tables/${table.id}/status`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next })
      })
      if (!response.ok) throw new Error('Could not update table status.')
    } catch (err) {
      setError(err.message)
      load()
    }
  }

  async function handleCreate(e) {
    e.preventDefault()
    setSaving(true)
    setFormError(null)
    try {
      const response = await fetch(localApiUrl('/api/tables'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.message || 'Could not create table.')
      setDialogOpen(false)
      setForm({ name: '', seats: 2 })
      await load()
    } catch (err) {
      setFormError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-1">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">Tables</h1>
          <p className="text-muted-foreground">Tap a table to cycle its status.</p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="size-4" /> New table
        </Button>
      </div>

      {error && <p className="mb-3 text-sm text-destructive">{error}</p>}

      {loading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : tables.length ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {tables.map((table) => {
            const meta = STATUS_META[table.status] ?? STATUS_META.free
            return (
              <button
                key={table.id}
                type="button"
                onClick={() => cycleStatus(table)}
                className={cn(
                  'flex flex-col items-center gap-1 rounded-lg border p-3 text-center transition-colors',
                  meta.tile
                )}
              >
                <Table2 className="size-6" />
                <span className="text-sm font-medium">{table.name}</span>
                <span className="text-xs text-muted-foreground">{table.seats} seats</span>
                <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', meta.badge)}>
                  {meta.label}
                </span>
              </button>
            )
          })}
        </div>
      ) : (
        <p className="py-10 text-center text-muted-foreground">No tables yet.</p>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New table</DialogTitle>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleCreate}>
            <div className="space-y-1.5">
              <Label htmlFor="table-name">Name</Label>
              <Input
                id="table-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="table-seats">Seats</Label>
              <Input
                id="table-seats"
                type="number"
                min="0"
                value={form.seats}
                onChange={(e) => setForm((f) => ({ ...f, seats: e.target.value }))}
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
    </div>
  )
}
