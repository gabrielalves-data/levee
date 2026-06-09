import { useState } from 'react'
import { Plus, RefreshCw } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { useServices, useCreateService } from '../hooks/useServices'
import { useSnapshots } from '../hooks/useSnapshots'
import { useUpcomingResets } from '../hooks/useMetrics'
import { computePace } from '../utils/pace'

const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

const CATEGORIES = ['cloud','ai_model','ai_api','tool','custom']
const CAT_LABELS = { cloud:'Cloud', ai_model:'AI Model', ai_api:'AI API', tool:'Dev Tool', custom:'Custom' }

const PACE_CONFIG = {
  on_track: { label: 'On track',    cls: 'text-emerald-400 bg-emerald-400/10 ring-1 ring-emerald-400/30' },
  warning:  { label: 'Warning',     cls: 'text-amber-400  bg-amber-400/10  ring-1 ring-amber-400/30'   },
  over:     { label: 'Over budget', cls: 'text-red-400    bg-red-400/10    ring-1 ring-red-400/30'     },
}

const INPUT_CLS = 'w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-sm text-white focus:outline-none focus:border-indigo-500 placeholder:text-slate-600'

function daysUntil(dateStr) {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const target = new Date(dateStr); target.setHours(0, 0, 0, 0)
  const d = Math.round((target - today) / 86_400_000)
  if (d === 0) return 'today'
  if (d === 1) return 'tomorrow'
  return `in ${d} days`
}

function StatCard({ label, value }) {
  return (
    <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
      <p className="text-xs text-slate-400 mb-1.5">{label}</p>
      <p className="text-2xl font-bold text-white">{value}</p>
    </div>
  )
}

function PaceCard({ pace, totalSpend, totalBudget }) {
  if (pace === null) {
    return (
      <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
        <p className="text-xs text-slate-400 mb-1.5">Pace</p>
        <p className="text-2xl font-bold text-slate-500">—</p>
        <p className="text-xs text-slate-600 mt-1">No budget cap set</p>
      </div>
    )
  }
  const cfg = PACE_CONFIG[pace]
  return (
    <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
      <p className="text-xs text-slate-400 mb-2">Pace</p>
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-sm font-semibold ${cfg.cls}`}>
        {cfg.label}
      </span>
      <p className="text-xs text-slate-500 mt-2">
        ${totalSpend.toFixed(2)} / ${totalBudget.toFixed(2)} budget
      </p>
    </div>
  )
}

function QuickAddForm({ onDone }) {
  const [name, setName]               = useState('')
  const [provider, setProvider]       = useState('')
  const [category, setCategory]       = useState('custom')
  const [monthlyCost, setMonthlyCost] = useState('')
  const [budgetCap, setBudgetCap]     = useState('')
  const [error, setError]             = useState('')
  const createService = useCreateService()

  async function submit(e) {
    e.preventDefault()
    if (!name.trim() || !provider.trim()) { setError('Name and provider are required.'); return }
    try {
      await createService.mutateAsync({
        name:         name.trim(),
        provider:     provider.trim(),
        category,
        cost_model:   'flat',
        monthly_cost: monthlyCost ? parseFloat(monthlyCost) : null,
        budget_cap:   budgetCap   ? parseFloat(budgetCap)   : null,
      })
      onDone()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <form onSubmit={submit} className="bg-slate-800 rounded-xl p-5 border border-slate-700">
      <h3 className="text-sm font-semibold text-white mb-4">Quick Add Service</h3>
      <div className="grid grid-cols-2 gap-3 mb-4">
        <label className="space-y-1">
          <span className="block text-xs text-slate-400">Name *</span>
          <input value={name} onChange={e => setName(e.target.value)}
            className={INPUT_CLS} placeholder="My Service" autoFocus />
        </label>
        <label className="space-y-1">
          <span className="block text-xs text-slate-400">Provider *</span>
          <input value={provider} onChange={e => setProvider(e.target.value)}
            className={INPUT_CLS} placeholder="Acme Inc." />
        </label>
        <label className="space-y-1">
          <span className="block text-xs text-slate-400">Category</span>
          <select value={category} onChange={e => setCategory(e.target.value)} className={INPUT_CLS}>
            {CATEGORIES.map(c => <option key={c} value={c}>{CAT_LABELS[c]}</option>)}
          </select>
        </label>
        <label className="space-y-1">
          <span className="block text-xs text-slate-400">Monthly Cost ($)</span>
          <input type="number" step="0.01" min="0" value={monthlyCost}
            onChange={e => setMonthlyCost(e.target.value)}
            className={INPUT_CLS} placeholder="0.00" />
        </label>
        <label className="space-y-1 col-span-2 sm:col-span-1">
          <span className="block text-xs text-slate-400">Budget Cap ($)</span>
          <input type="number" step="0.01" min="0" value={budgetCap}
            onChange={e => setBudgetCap(e.target.value)}
            className={INPUT_CLS} placeholder="0.00" />
        </label>
      </div>
      {error && <p className="text-xs text-red-400 mb-3">{error}</p>}
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onDone}
          className="px-3 py-1.5 text-xs text-slate-400 hover:text-white transition-colors">
          Cancel
        </button>
        <button type="submit" disabled={createService.isPending}
          className="px-4 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg transition-colors">
          {createService.isPending ? 'Adding…' : 'Add Service'}
        </button>
      </div>
    </form>
  )
}

export default function Overview() {
  const { data: services = [], isLoading, isError } = useServices()
  const { data: snapshots = [] }                    = useSnapshots(6)
  const { data: resets = [] }                       = useUpcomingResets()
  const [showAdd, setShowAdd]                       = useState(false)

  if (isLoading) return <div className="p-6 text-slate-400 text-sm">Loading…</div>
  if (isError)   return <div className="p-6 text-red-400 text-sm">Failed to load services.</div>

  const total       = services.reduce((sum, s) => sum + (s.monthly_cost ?? 0), 0)
  const budgetTotal = services.reduce((sum, s) => sum + (s.budget_cap ?? 0), 0)
  const pace        = computePace(total, budgetTotal)

  const trendData = snapshots.map(s => ({
    label: MONTH_ABBR[s.month - 1],
    spend: s.total_spend,
  }))

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-slate-100">
          <span className="text-emerald-400 glow">&gt;</span> overview
        </h2>
        {!showAdd && (
          <button onClick={() => setShowAdd(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors">
            <Plus size={13} /> Quick Add
          </button>
        )}
      </div>

      {showAdd && <QuickAddForm onDone={() => setShowAdd(false)} />}

      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Total this month" value={`$${total.toFixed(2)}`} />
        <StatCard label="Active services"  value={services.length} />
        <PaceCard pace={pace} totalSpend={total} totalBudget={budgetTotal} />
      </div>

      {resets.length > 0 && (
        <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
          <div className="flex items-center gap-2 mb-3">
            <RefreshCw size={13} className="text-slate-400" />
            <h3 className="text-sm font-medium text-slate-300">Resets This Week</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {resets.map((r, i) => (
              <span key={i}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs bg-slate-700 ring-1 ring-slate-600">
                <span className="font-medium text-slate-200">{r.service_name}</span>
                <span className="text-slate-400">{daysUntil(r.reset_date)}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {trendData.length > 0 ? (
        <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
          <h3 className="text-sm font-medium text-slate-300 mb-4">Monthly Trend</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={trendData} barCategoryGap="30%">
              <XAxis
                dataKey="label"
                tick={{ fill: '#6aa97f', fontSize: 12, fontFamily: 'monospace' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: '#6aa97f', fontSize: 12, fontFamily: 'monospace' }}
                tickFormatter={v => `$${v}`}
                axisLine={false}
                tickLine={false}
                width={48}
              />
              <Tooltip
                cursor={{ fill: 'rgba(0,255,156,0.08)' }}
                contentStyle={{
                  background: '#0a0f0a',
                  border: '1px solid #1d2a1d',
                  borderRadius: 2,
                  fontSize: 12,
                  fontFamily: 'monospace',
                  color: '#bff7cf',
                }}
                formatter={v => [`$${v.toFixed(2)}`, 'Total']}
              />
              <Bar dataKey="spend" fill="#00ff9c" radius={[0, 0, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="bg-slate-800 rounded-xl p-5 border border-slate-700 text-slate-500 text-sm">
          No monthly snapshots yet — the trend chart will populate automatically each month.
        </div>
      )}

      <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-700">
          <h3 className="text-sm font-medium text-slate-300">Active Services</h3>
        </div>
        <div className="divide-y divide-slate-700/50">
          {services.length === 0 ? (
            <p className="px-5 py-4 text-sm text-slate-500">
              No active services. Use Quick Add to get started.
            </p>
          ) : (
            services.map(s => (
              <div key={s.id} className="flex items-center justify-between px-5 py-2.5">
                <div>
                  <span className="text-sm text-slate-200">{s.name}</span>
                  <span className="text-xs text-slate-500 ml-2">{s.provider}</span>
                </div>
                <span className="text-sm text-slate-300">
                  {s.monthly_cost != null
                    ? `$${s.monthly_cost.toFixed(2)}/mo`
                    : <span className="text-slate-600">—</span>}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
