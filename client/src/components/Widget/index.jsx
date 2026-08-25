import { useState } from 'react'
import { X } from 'lucide-react'
import { useWidget, useSetWidgetSlot, useClearWidgetSlot } from '../../hooks/useWidget'
import { useServices } from '../../hooks/useServices'
import { useMetrics } from '../../hooks/useMetrics'
import { parseMetricDate, formatCountdown } from '../../utils/time'

const SEL = 'bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-sm text-white focus:outline-none focus:border-indigo-500 disabled:opacity-40'

function formatPreview(metric) {
  if (!metric) return null
  if (metric.value_type === 'date') {
    const d = parseMetricDate(metric)
    return d ? formatCountdown(d) : (metric.value_text || null)
  }
  const v = metric.value_num
  if (v === null || v === undefined) return metric.value_text || null
  if (metric.value_type === 'currency') return `$${v.toFixed(2)}`
  if (metric.value_type === 'percent')  return `${v}%`
  return metric.unit ? `${v} ${metric.unit}` : String(v)
}

function SlotEditor({ slot, onSave, onClear }) {
  const { data: services = [] } = useServices()
  const [svcId, setSvcId] = useState(slot.service_id  ? String(slot.service_id)  : '')
  const [mKey,  setMKey]  = useState(slot.metric_key  ?? '')
  const [label, setLabel] = useState(slot.label_override ?? '')

  const { data: metrics = [] } = useMetrics(svcId ? Number(svcId) : null)

  function handleSvcChange(val) {
    setSvcId(val)
    setMKey('')
  }

  function handleMKeyChange(val) {
    setMKey(val)
    if (svcId && val) {
      onSave({ service_id: Number(svcId), metric_key: val, label_override: label.trim() || null })
    }
  }

  function handleLabelBlur() {
    if (svcId && mKey) {
      onSave({ service_id: Number(svcId), metric_key: mKey, label_override: label.trim() || null })
    }
  }

  const preview = formatPreview(metrics.find(m => m.metric_key === mKey))

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <select value={svcId} onChange={e => handleSvcChange(e.target.value)} className={SEL + ' flex-1'}>
          <option value="">Service…</option>
          {services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select value={mKey} onChange={e => handleMKeyChange(e.target.value)} disabled={!svcId} className={SEL + ' flex-1'}>
          <option value="">Metric…</option>
          {metrics.map(m => <option key={m.metric_key} value={m.metric_key}>{m.label}</option>)}
        </select>
      </div>

      <div className="flex gap-2 items-center">
        <input
          value={label}
          onChange={e => setLabel(e.target.value)}
          onBlur={handleLabelBlur}
          placeholder="Label override (optional)"
          className={SEL + ' flex-1 text-xs'}
        />
        {preview !== null && (
          <span className="text-xs text-slate-400 shrink-0 tabular-nums">{preview}</span>
        )}
        {slot.service_id && (
          <button onClick={onClear} title="Clear slot" className="p-1.5 text-slate-500 hover:text-red-400 transition-colors shrink-0">
            <X size={14} />
          </button>
        )}
      </div>
    </div>
  )
}

function notifyOverlay() {
  window.levee?.notifyWidgetUpdate?.()
}

export default function WidgetConfig() {
  const { data: slots = [] } = useWidget()
  const setSlot              = useSetWidgetSlot()
  const clearSlot            = useClearWidgetSlot()

  const normalized = [0, 1, 2, 3].map(i =>
    slots.find(s => s.slot_index === i) ?? { slot_index: i, service_id: null, metric_key: null, label_override: null }
  )

  return (
    <div className="space-y-3">
      {normalized.map(slot => (
        <div key={slot.slot_index} className="bg-slate-800/60 rounded-lg p-3 border border-slate-700/50 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-300">Slot {slot.slot_index + 1}</span>
            {slot.service_name && (
              <span className="text-xs text-slate-500 truncate ml-2">
                {slot.service_name} · {slot.metric_label || slot.metric_key}
              </span>
            )}
          </div>
          <SlotEditor
            key={`${slot.slot_index}-${slot.service_id ?? 'empty'}-${slot.metric_key ?? 'empty'}`}
            slot={slot}
            onSave={cfg  => setSlot.mutate({ slotIndex: slot.slot_index, ...cfg }, { onSuccess: notifyOverlay })}
            onClear={() => clearSlot.mutate(slot.slot_index, { onSuccess: notifyOverlay })}
          />
        </div>
      ))}
    </div>
  )
}
