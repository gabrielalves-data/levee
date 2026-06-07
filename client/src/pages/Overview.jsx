import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { useServices } from '../hooks/useServices'

const CATEGORY_LABELS = {
  cloud:    'Cloud',
  ai_model: 'AI Models',
  ai_api:   'AI APIs',
  tool:     'Dev Tools',
  custom:   'Custom',
}

const CATEGORY_COLORS = {
  cloud:    '#3b82f6',
  ai_model: '#a855f7',
  ai_api:   '#8b5cf6',
  tool:     '#10b981',
  custom:   '#64748b',
}

function StatCard({ label, value }) {
  return (
    <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
      <p className="text-xs text-slate-400 mb-1.5">{label}</p>
      <p className="text-2xl font-bold text-white">{value}</p>
    </div>
  )
}

export default function Overview() {
  const { data: services = [], isLoading, isError } = useServices()

  if (isLoading) return <div className="p-6 text-slate-400 text-sm">Loading...</div>
  if (isError)   return <div className="p-6 text-red-400 text-sm">Failed to load services.</div>

  const total = services.reduce((sum, s) => sum + (s.monthly_cost ?? 0), 0)
  const activeCount = services.filter(s => s.active).length
  const categories = new Set(services.map(s => s.category)).size

  const byCategory = Object.entries(
    services.reduce((acc, s) => {
      acc[s.category] = (acc[s.category] ?? 0) + (s.monthly_cost ?? 0)
      return acc
    }, {})
  ).map(([cat, spend]) => ({
    cat,
    name: CATEGORY_LABELS[cat] ?? cat,
    spend: Number(spend.toFixed(2)),
    color: CATEGORY_COLORS[cat] ?? '#64748b',
  }))

  const hasSpend = byCategory.some(c => c.spend > 0)

  return (
    <div className="p-6 space-y-6">
      <h2 className="text-xl font-semibold text-white">Overview</h2>

      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Est. Monthly Total" value={`$${total.toFixed(2)}`} />
        <StatCard label="Active Services"    value={activeCount} />
        <StatCard label="Categories"         value={categories} />
      </div>

      {hasSpend ? (
        <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
          <h3 className="text-sm font-medium text-slate-300 mb-4">Spend by Category</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={byCategory} barCategoryGap="30%">
              <XAxis
                dataKey="name"
                tick={{ fill: '#94a3b8', fontSize: 12 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: '#94a3b8', fontSize: 12 }}
                tickFormatter={v => `$${v}`}
                axisLine={false}
                tickLine={false}
                width={48}
              />
              <Tooltip
                cursor={{ fill: '#1e293b' }}
                contentStyle={{
                  background: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: 8,
                  fontSize: 12,
                }}
                formatter={v => [`$${v.toFixed(2)}`, 'Spend']}
              />
              <Bar dataKey="spend" radius={[4, 4, 0, 0]}>
                {byCategory.map(entry => (
                  <Cell key={entry.cat} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="bg-slate-800 rounded-xl p-5 border border-slate-700 text-slate-500 text-sm">
          No monthly costs entered yet. Add costs to services to see the chart.
        </div>
      )}

      <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-700">
          <h3 className="text-sm font-medium text-slate-300">Active Services</h3>
        </div>
        <div className="divide-y divide-slate-700/50">
          {services.map(s => (
            <div key={s.id} className="flex items-center justify-between px-5 py-2.5">
              <div>
                <span className="text-sm text-slate-200">{s.name}</span>
                <span className="text-xs text-slate-500 ml-2">{s.provider}</span>
              </div>
              <span className="text-sm text-slate-300">
                {s.monthly_cost != null ? `$${s.monthly_cost.toFixed(2)}/mo` : <span className="text-slate-600">—</span>}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
