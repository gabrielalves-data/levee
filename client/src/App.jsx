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
      <div className="px-4 py-5 border-b border-slate-800">
        <h1 className="text-sm font-bold tracking-tight text-slate-200">
          <span className="text-emerald-400 glow">PS</span>{' '}
          <span className="text-slate-200">C:\levee</span>
          <span className="text-emerald-400">&gt;</span>
          <span className="caret" />
        </h1>
        <p className="text-slate-500 text-xs mt-1">// local cost tracker</p>
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
