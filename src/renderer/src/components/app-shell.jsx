import {
  Clock,
  LayoutDashboard,
  LogOut,
  Maximize2,
  Minimize2,
  MonitorPlay,
  ReceiptText,
  Settings,
  ShoppingCart,
  Table2,
  UtensilsCrossed,
  Users,
  Wifi,
  WifiOff
} from 'lucide-react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useFullscreen } from '@/hooks/use-fullscreen'
import { useOnlineStatus } from '@/hooks/use-online-status'
import { useAuth } from '@/lib/auth-context'
import { cn } from '@/lib/utils'
import AppLogoIcon from '@/components/app-logo-icon'
import { localApiUrl } from '@shared/index.js'

// Single flat list, not grouped — the source app groups nav into sections
// (Sales/Items/Inventory/...) because it has ~20 pages across many domains;
// this app only ever has these 10, so a group header would just be visual
// noise around one item each.
const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, color: 'text-icon-sky' },
  { to: '/shifts', label: 'Shifts', icon: Clock, color: 'text-icon-amber' },
  { to: '/pos', label: 'POS', icon: ShoppingCart, color: 'text-primary' },
  { to: '/orders', label: 'Orders', icon: ReceiptText, color: 'text-icon-rose' },
  { to: '/tables', label: 'Tables', icon: Table2, color: 'text-icon-cyan' },
  { to: '/customers', label: 'Customers', icon: Users, color: 'text-icon-pink' },
  { to: '/kds', label: 'KDS', icon: MonitorPlay, color: 'text-icon-violet' },
  { to: '/menu', label: 'Menu', icon: UtensilsCrossed, color: 'text-icon-emerald' },
  { to: '/settings', label: 'Settings', icon: Settings, color: 'text-icon-slate' }
]

function SidebarNavLink({ item, active }) {
  return (
    <Link
      to={item.to}
      className={cn(
        'group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-all duration-150 ease-out',
        active
          ? 'bg-sidebar-accent font-semibold text-sidebar-accent-foreground shadow-sm'
          : 'text-sidebar-foreground/70 hover:translate-x-0.5 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground'
      )}
    >
      <span
        className={cn(
          'flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors duration-150',
          item.color,
          active ? 'bg-current/20' : 'bg-current/10 group-hover:bg-current/20'
        )}
      >
        <item.icon className="size-4" />
      </span>
      {item.label}
    </Link>
  )
}

export function AppShell({ children, title }) {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const fullscreen = useFullscreen()
  const online = useOnlineStatus()
  // Shared with App's route guard and login.jsx (see lib/auth-context.jsx)
  // instead of this component fetching /api/auth/me itself — that separate
  // fetch was harmless on its own, but it never updated on sign-out either,
  // which combined with the route guard's own stale state was why sign-out
  // looked stuck (see setGuest() call below).
  const { user, setGuest } = useAuth()

  async function handleSignOut() {
    try {
      await fetch(localApiUrl('/api/auth/logout'), { method: 'POST' })
    } finally {
      setGuest()
      navigate('/login')
    }
  }

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="sticky top-0 hidden h-screen w-55 shrink-0 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
        <div className="flex items-center gap-3 px-5 py-6">
          <span className="brand-gradient flex size-9 shrink-0 items-center justify-center rounded-xl text-base font-bold text-white shadow-lg">
            <AppLogoIcon className="size-5 fill-current" />
          </span>
          <div className="min-w-0">
            <p className="brand-gradient-text truncate font-display text-lg font-bold tracking-tight">
              POS Companion
            </p>
            <p className="truncate text-xs text-muted-foreground">Offline till</p>
          </div>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-4">
          {NAV_ITEMS.map((item) => (
            <SidebarNavLink key={item.to} item={item} active={pathname === item.to} />
          ))}
        </nav>
        <div className="border-t border-sidebar-border p-3">
          <div className="flex items-center justify-between gap-2 px-2 pb-2">
            <p className="truncate text-xs text-muted-foreground">{user?.email ?? 'cashier@till'}</p>
          </div>
          <button
            onClick={handleSignOut}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-sidebar-foreground/75 transition-all duration-150 ease-out hover:translate-x-0.5 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
          >
            <LogOut className="size-4" /> Sign out
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-border bg-header/85 px-5 py-3 backdrop-blur">
          <h1 className="font-display text-base font-semibold">{title}</h1>
          <div className="flex min-w-0 shrink-0 items-center gap-1.5">
            <span
              className={cn(
                'flex shrink-0 items-center gap-1 rounded-md border px-2 py-1.5 text-[10px] font-medium',
                online
                  ? 'border-success/30 bg-success/10 text-success'
                  : 'border-destructive/30 bg-destructive/10 text-destructive'
              )}
              title={online ? 'Network connected' : 'No network connection'}
            >
              {online ? <Wifi className="size-3.5" /> : <WifiOff className="size-3.5" />}
              <span className="hidden sm:inline">{online ? 'Online' : 'Offline'}</span>
            </span>
            <div className="flex min-w-0 items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1.5">
              <span className="hidden max-w-24 truncate text-xs font-medium sm:inline">Cashier</span>
            </div>
            <button
              type="button"
              onClick={fullscreen.toggle}
              className="flex shrink-0 items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs font-medium hover:bg-secondary"
              aria-label={fullscreen.isFullscreen ? 'Exit full screen' : 'Full screen'}
            >
              {fullscreen.isFullscreen ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
            </button>
          </div>
        </header>
        <main className="min-w-0 flex-1 p-5">{children}</main>
      </div>
    </div>
  )
}
