import { useEffect } from 'react'
import { flushSync } from 'react-dom'
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
  { to: '/',         label: 'overview', Icon: LayoutDashboard },
  { to: '/services', label: 'services', Icon: Grid2X2 },
  { to: '/settings', label: 'settings', Icon: Settings },
]

// Declarative <BrowserRouter> ignores React Router's `viewTransition` nav option
// (it only works with data/framework routers), so we wrap the navigation in a
// view transition ourselves — `flushSync` commits the route change before the
// browser captures the "new" snapshot, exactly like the overlay morph.
let activeViewTransition = null
function useViewTransitionNavigate() {
  const navigate = useNavigate()
  return (to) => {
    if (!document.startViewTransition ||
        window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      navigate(to)
      return
    }
    // Cut a still-running transition short so a quick second click navigates
    // immediately instead of waiting for the first animation to finish.
    activeViewTransition?.skipTransition()
    activeViewTransition = document.startViewTransition(() => flushSync(() => navigate(to)))
    activeViewTransition.finished.finally(() => { activeViewTransition = null })
  }
}

function Sidebar() {
  const vtNavigate = useViewTransitionNavigate()
  return (
    <aside className="w-56 bg-slate-900 border-r border-slate-800 flex flex-col shrink-0">
      <div className="px-4 py-4 border-b border-slate-800 flex items-center gap-3">
        <img src="/levee-logo.png" alt="Levee" className="h-11 w-11 object-contain flex-shrink-0" />
        <span className="font-mono text-base text-slate-200 tracking-tight">
          <span className="text-emerald-400">&gt;</span> levee
          <span className="ml-0.5 inline-block w-2 h-4 align-middle bg-emerald-400 animate-pulse" />
        </span>
      </div>
      <nav className="flex-1 p-3 space-y-0.5">
        {NAV.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            onClick={(e) => { e.preventDefault(); vtNavigate(to) }}
            className={({ isActive }) =>
              `flex items-center gap-2.5 px-3 py-2 text-sm transition-colors border-l-2 ${
                isActive
                  ? 'bg-slate-800 text-emerald-400 border-emerald-400 font-medium'
                  : 'text-slate-400 hover:text-emerald-300 hover:bg-slate-800/60 border-transparent'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <span className={isActive ? 'text-emerald-400' : 'text-slate-600'}>
                  {isActive ? '>' : '·'}
                </span>
                <Icon size={15} />
                {label}
              </>
            )}
          </NavLink>
        ))}
      </nav>
      <div className="px-4 py-3 border-t border-slate-800 text-[10px] text-slate-600 leading-relaxed">
        <p>uptime: local-only</p>
        <p className="text-emerald-500/70">● 127.0.0.1 connected</p>
      </div>
    </aside>
  )
}

// Listens for IPC-driven navigation events (e.g. clicking a slot in the overlay).
function NavigationListener() {
  const vtNavigate = useViewTransitionNavigate()
  useEffect(() => {
    if (!window.levee?.onNavigate) return
    return window.levee.onNavigate((route) => vtNavigate(route))
  }, [vtNavigate])
  return null
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <NavigationListener />
        <div className="app-shell flex h-screen bg-slate-950 text-slate-200 overflow-hidden crt-scanlines">
          <Sidebar />
          <main className="flex-1 overflow-y-auto" style={{ viewTransitionName: 'page' }}>
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
