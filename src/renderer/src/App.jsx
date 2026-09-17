import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from '@/components/app-shell'
import LoginPage from '@/pages/login'
import DashboardPage from '@/pages/dashboard'
import ShiftsPage from '@/pages/shifts'
import PosPage from '@/pages/pos'
import OrdersPage from '@/pages/orders'
import TablesPage from '@/pages/tables'
import CustomersPage from '@/pages/customers'
import KdsPage from '@/pages/kds'
import MenuPage from '@/pages/menu'
import SettingsPage from '@/pages/settings'
import { useAuth } from '@/lib/auth-context'

// Title per route, shown in the shell header — kept here rather than in
// each page so the shell doesn't need a per-page prop threaded down.
const SHELL_PAGES = [
  { path: '/dashboard', title: 'Dashboard', element: <DashboardPage /> },
  { path: '/shifts', title: 'Shifts', element: <ShiftsPage /> },
  { path: '/pos', title: 'POS', element: <PosPage /> },
  { path: '/orders', title: 'Orders', element: <OrdersPage /> },
  { path: '/tables', title: 'Tables', element: <TablesPage /> },
  { path: '/customers', title: 'Customers', element: <CustomersPage /> },
  { path: '/kds', title: 'KDS', element: <KdsPage /> },
  { path: '/menu', title: 'Menu', element: <MenuPage /> },
  { path: '/settings', title: 'Settings', element: <SettingsPage /> }
]

export default function App() {
  // Shared with login.jsx/app-shell.jsx via AuthProvider (see lib/auth-
  // context.jsx) — login/logout update this directly instead of this route
  // guard only ever finding out via its own one-time mount check, which was
  // the actual bug (stale guard until a full page reload).
  const { status: authStatus } = useAuth()

  if (authStatus === 'checking') return null

  return (
    <Routes>
      <Route
        path="/login"
        element={authStatus === 'authed' ? <Navigate to="/dashboard" replace /> : <LoginPage />}
      />
      {SHELL_PAGES.map(({ path, title, element }) => (
        <Route
          key={path}
          path={path}
          element={
            authStatus === 'authed' ? (
              <AppShell title={title}>{element}</AppShell>
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
      ))}
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}
