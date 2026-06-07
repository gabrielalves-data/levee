import * as Icons from 'lucide-react'
import { useState } from 'react'
import { useMetrics, useUpsertMetric } from '../../hooks/useMetrics'
import { useSnapshots } from '../../hooks/useSnapshots'

const CATEGORY_STYLES = {
  cloud:    'bg-blue-500/20 text-blue-300',
  ai_model: 'bg-purple-500/20 text-purple-300',
  ai_api:   'bg-violet-500/20 text-violet-300',
  tool:     'bg-emerald-500/20 text-emerald-300',
  custom:   'bg-slate-500/20 text-slate-300',
}

const CATEGORY_LABELS = {
  cloud:    'Cloud',
  ai_model: 'AI Model',
  ai_api:   'AI API',
  tool:     'Tool',
  custom:   'Custom',
}

function formatValue(metric) {
  const { value_type, value_num, value_text, unit } = metric
  if (value_num == null && !value_text) return '—'
  switch (value_type) {
    case 'currency': return `$${value_num.toFixed(2)}`
    case 'percent':  return `${value_num.toFixed(1)}%`
    case 'number':   return `${value_num.toLocaleString()}${unit ? ' ' + unit : ''}`
    case 'date':     return value_text ?? new Date(value_num * 1000).toLocaleDateString()
    default:         return value_text ?? String(value_num)
  }
}

function UsageBar({ ratio }) {
  const pct = Math.min(100, Math.max(0, ratio * 100))
  const color = pct > 80 ? 'bg-red-500' : pct > 60 ? 'bg-amber-500' : 'bg-emerald-500'
  return (
    <div className="h-1 bg-slate-700 rounded-full overflow-hidden mt-1">
      <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
    </div>
  )
}

function MetricRow({ metric, service, prevBill }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const upsert = useUpsertMetric(service.id)

  const isNumeric = ['number', 'percent', 'currency'].includes(metric.value_type)

  const hasBudgetBar = metric.metric_key === 'monthly_bill'
    && service.budget_cap != null
    && metric.value_num != null

  const hasUsageBar = metric.value_type === 'percent' && metric.value_num != null

  const ratio = hasBudgetBar ? metric.value_num / service.budget_cap
              : hasUsageBar  ? metric.value_num / 100
              : null

  const momDelta = prevBill != null && metric.value_num != null
    ? metric.value_num - prevBill
    : null

  function startEdit() {
    setDraft(isNumeric
      ? (metric.value_num != null ? String(metric.value_num) : '')
      : (metric.value_text ?? ''))
    setEditing(true)
  }

  async function save() {
    const trimmed = draft.trim()
    if (trimmed === '') { setEditing(false); return }
    await upsert.mutateAsync({
      metricKey: metric.metric_key,
      label: metric.label,
      value_type: metric.value_type,
      value_num: isNumeric ? parseFloat(trimmed) : null,
      value_text: !isNumeric ? trimmed : null,
      unit: metric.unit ?? null,
    })
    setEditing(false)
  }

  async function paste() {
    try {
      const text = await navigator.clipboard.readText()
      setDraft(text.trim())
    } catch {}
  }

  function onKeyDown(e) {
    if (e.key === 'Enter') save()
    if (e.key === 'Escape') setEditing(false)
  }

  const isEmpty = metric.value_num == null && !metric.value_text

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-slate-400 truncate flex-1">{metric.label}</span>
        <div className="flex items-center gap-1 shrink-0">
          {!editing && momDelta != null && (
            <span className={`text-xs ${momDelta > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
              {momDelta > 0 ? '↑' : '↓'}${Math.abs(momDelta).toFixed(2)}
            </span>
          )}
          {!editing && (
            <span className={`text-xs font-medium ${isEmpty ? 'text-slate-600' : 'text-slate-200'}`}>
              {formatValue(metric)}
            </span>
          )}
          <button
            onClick={editing ? () => setEditing(false) : startEdit}
            className="ml-0.5 text-slate-600 hover:text-slate-400 transition-colors"
            title={editing ? 'Cancel' : 'Update value'}
          >
            {editing ? <Icons.X size={11} /> : <Icons.Pencil size={11} />}
          </button>
        </div>
      </div>

      {editing && (
        <div className="flex items-center gap-1 mt-1">
          <input
            type={isNumeric ? 'number' : 'text'}
            step={metric.value_type === 'currency' ? '0.01' : '1'}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            autoFocus
            className="flex-1 min-w-0 bg-slate-900 border border-slate-600 rounded px-2 py-0.5 text-xs text-white focus:outline-none focus:border-indigo-500"
            placeholder={isNumeric ? '0' : 'value'}
          />
          <button
            onClick={paste}
            title="Paste from clipboard"
            className="text-slate-500 hover:text-slate-300 transition-colors"
          >
            <Icons.Clipboard size={11} />
          </button>
          <button
            onClick={save}
            disabled={upsert.isPending}
            className="text-emerald-500 hover:text-emerald-400 disabled:opacity-50 transition-colors"
            title="Save"
          >
            <Icons.Check size={11} />
          </button>
        </div>
      )}

      {!editing && ratio != null && (
        <div>
          <UsageBar ratio={ratio} />
          {hasBudgetBar && (
            <div className="flex justify-between text-xs text-slate-600 mt-0.5">
              <span>${metric.value_num.toFixed(0)}</span>
              <span>${Number(service.budget_cap).toFixed(0)} cap</span>
            </div>
          )}
          {hasUsageBar && ratio > 0.8 && (
            <span className="text-xs text-red-400">{(ratio * 100).toFixed(0)}%</span>
          )}
        </div>
      )}
    </div>
  )
}

export default function ServiceCard({ service }) {
  const { data: metrics = [], isLoading } = useMetrics(service.id)
  const { data: snapshots = [] } = useSnapshots(2)

  // Most-recent snapshot is last (oldest-first ordering from the route)
  const lastSnapshot = snapshots[snapshots.length - 1]
  const prevBill = lastSnapshot?.breakdown?.find(r => r.id === service.id)?.monthly_bill ?? null

  const IconComponent = (service.icon && Icons[service.icon]) || Icons.Package
  const categoryStyle = CATEGORY_STYLES[service.category] ?? CATEGORY_STYLES.custom
  const categoryLabel = CATEGORY_LABELS[service.category] ?? service.category

  return (
    <div className="bg-slate-800 rounded-xl p-4 border border-slate-700 flex flex-col gap-3">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 bg-slate-700 rounded-lg">
            <IconComponent size={18} className="text-slate-300" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white leading-tight">{service.name}</h3>
            <p className="text-xs text-slate-500">{service.provider}</p>
          </div>
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${categoryStyle}`}>
          {categoryLabel}
        </span>
      </div>

      {isLoading ? (
        <p className="text-xs text-slate-600">Loading metrics...</p>
      ) : metrics.length > 0 ? (
        <div className="space-y-2.5 border-t border-slate-700/60 pt-3">
          {metrics.map(m => (
            <MetricRow
              key={m.metric_key}
              metric={m}
              service={service}
              prevBill={m.metric_key === 'monthly_bill' ? prevBill : null}
            />
          ))}
        </div>
      ) : (
        <p className="text-xs text-slate-600 border-t border-slate-700/60 pt-3">No metrics configured</p>
      )}
    </div>
  )
}
