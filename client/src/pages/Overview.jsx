import { RefreshCw } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { useServices } from '../hooks/useServices'
import { useSnapshots } from '../hooks/useSnapshots'
import { useUpcomingResets } from '../hooks/useMetrics'
import { computePace } from '../utils/pace'
import { amortizedMonthly } from '../utils/billing'
import { groupTotalsByCurrency, formatCurrency } from '../utils/currency'
import SyncAllButton from '../components/SyncAllButton'

const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

const PACE_CONFIG = {
  on_track: { label: 'On track',    cls: 'text-emerald-400 bg-emerald-400/10 ring-1 ring-emerald-400/30' },
  warning:  { label: 'Warning',     cls: 'text-amber-400  bg-amber-400/10  ring-1 ring-amber-400/30'   },
  over:     { label: 'Over budget', cls: 'text-red-400    bg-red-400/10    ring-1 ring-red-400/30'     },
}

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

function PaceCard({ pace, totalSpend, totalBudget, currency }) {
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
        {formatCurrency(totalSpend, currency)} / {formatCurrency(totalBudget, currency)} budget
      </p>
    </div>
  )
}

export default function Overview() {
  const { data: services = [], isLoading, isError } = useServices()
  const { data: snapshots = [] }                    = useSnapshots(6)
  const { data: resets = [] }                       = useUpcomingResets()

  if (isLoading) return <div className="p-6 text-slate-400 text-sm">Loading…</div>
  if (isError)   return <div className="p-6 text-red-400 text-sm">Failed to load services.</div>

  // Never sum mixed currencies into one number — group per currency; a single
  // grand total (and the pace card, which needs one number to compare against
  // a budget) is only meaningful when every active service shares a currency.
  const currencyTotals = groupTotalsByCurrency(services)
  const isSingleCurrency = currencyTotals.length <= 1
  const primary = currencyTotals[0] ?? { currency: 'USD', total: 0 }
  const budgetTotal = services
    .filter(s => (s.currency || 'USD') === primary.currency)
    .reduce((sum, s) => sum + (s.budget_cap ?? 0), 0)
  const pace = isSingleCurrency ? computePace(primary.total, budgetTotal) : null

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
      </div>

      <div className="grid grid-cols-3 gap-4">
        {isSingleCurrency ? (
          <StatCard label="Total this month" value={formatCurrency(primary.total, primary.currency)} />
        ) : (
          <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
            <p className="text-xs text-slate-400 mb-1.5">Total this month</p>
            <div className="space-y-0.5">
              {currencyTotals.map(({ currency, total: t }) => (
                <p key={currency} className="text-lg font-bold text-white">{formatCurrency(t, currency)}</p>
              ))}
            </div>
          </div>
        )}
        <StatCard label="Active services"  value={services.length} />
        <PaceCard pace={pace} totalSpend={primary.total} totalBudget={budgetTotal} currency={primary.currency} />
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
        <div className="px-5 py-3 border-b border-slate-700 flex items-center justify-between">
          <h3 className="text-sm font-medium text-slate-300">Active Services</h3>
          <SyncAllButton />
        </div>
        <div className="divide-y divide-slate-700/50">
          {services.length === 0 ? (
            <p className="px-5 py-4 text-sm text-slate-500">
              No active services. Enable services from Settings to get started.
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
                    ? `${formatCurrency(s.monthly_cost, s.currency)}/mo`
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
