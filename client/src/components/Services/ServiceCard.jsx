import * as Icons from 'lucide-react'
import { useMetrics } from '../../hooks/useMetrics'

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

function MetricValue({ metric }) {
  const { value_type, value_num, value_text, unit } = metric

  if (value_num == null && !value_text) {
    return <span className="text-slate-600">—</span>
  }

  switch (value_type) {
    case 'currency':
      return <span>${value_num.toFixed(2)}</span>
    case 'percent':
      return <span>{value_num.toFixed(1)}%</span>
    case 'number':
      return (
        <span>
          {value_num.toLocaleString()}
          {unit ? <span className="text-slate-500 ml-0.5">{unit}</span> : null}
        </span>
      )
    case 'date':
      return <span>{value_text ?? new Date(value_num).toLocaleDateString()}</span>
    case 'text':
      return <span>{value_text}</span>
    default:
      return <span>{value_text ?? value_num}</span>
  }
}

export default function ServiceCard({ service }) {
  const { data: metrics = [], isLoading } = useMetrics(service.id)

  const IconComponent =
    (service.icon && Icons[service.icon]) || Icons.Package

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
        <div className="space-y-1.5 border-t border-slate-700/60 pt-3">
          {metrics.map(m => (
            <div key={m.metric_key} className="flex items-center justify-between gap-2">
              <span className="text-xs text-slate-400 truncate">{m.label}</span>
              <span className="text-xs font-medium text-slate-200 shrink-0">
                <MetricValue metric={m} />
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-slate-600 border-t border-slate-700/60 pt-3">No metrics configured</p>
      )}
    </div>
  )
}
