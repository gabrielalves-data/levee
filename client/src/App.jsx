import { useEffect } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Routes, Route, NavLink, useNavigate } from 'react-router-dom'
import { LayoutDashboard, Grid2X2, Settings } from 'lucide-react'
import Overview from './pages/Overview'
import Services from './pages/Services'
import SettingsPage from './pages/Settings'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
})

const NAV = [
  { to: '/',         label: 'Overview', Icon: LayoutDashboard },
  { to: '/services', label: 'Services', Icon: Grid2X2 },
  { to: '/settings', label: 'Settings', Icon: Settings },
]

function Sidebar() {
  return (
    <aside className="w-56 bg-slate-900 border-r border-slate-800 flex flex-col shrink-0">
      <div className="px-4 py-5 border-b border-slate-800">
        <h1 className="text-white font-bold text-base tracking-tight">DevCost</h1>
        <p className="text-slate-500 text-xs mt-0.5">Local cost tracker</p>
      </div>
      <nav className="flex-1 p-3 space-y-0.5">
        {NAV.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                isActive
                  ? 'bg-slate-800 text-white font-medium'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`
            }
          >
            <Icon size={16} />
            {label}
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}

// Listens for IPC-driven navigation events (e.g. clicking a slot in the overlay).
function NavigationListener() {
  const navigate = useNavigate()
  useEffect(() => {
    if (!window.devcost?.onNavigate) return
    return window.devcost.onNavigate((route) => navigate(route))
  }, [navigate])
  return null
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <NavigationListener />
        <div className="flex h-screen bg-slate-950 text-white overflow-hidden">
          <Sidebar />
          <main className="flex-1 overflow-y-auto">
            <Routes>
              <Route path="/"         element={<Overview />} />
              <Route path="/services" element={<Services />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Routes>
          </main>
        </div>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
