import { useState } from 'react'
import { Plus, Trash2, ToggleLeft, ToggleRight } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useServices, useCreateService, usePatchService, useArchiveService } from '../hooks/useServices'
import { apiFetch } from '../api'

const CATEGORIES = [
  { value: 'cloud',    label: 'Cloud' },
  { value: 'ai_model', label: 'AI Model' },
  { value: 'ai_api',   label: 'AI API' },
  { value: 'tool',     label: 'Dev Tool' },
  { value: 'custom',   label: 'Custom' },
]

const COST_MODELS = [
  { value: 'flat',   label: 'Flat rate' },
  { value: 'usage',  label: 'Usage-based' },
  { value: 'hybrid', label: 'Hybrid' },
]

const VALUE_TYPES = [
  { value: 'currency', label: 'Currency ($)' },
  { value: 'number',   label: 'Number' },
  { value: 'percent',  label: 'Percent (%)' },
  { value: 'text',     label: 'Text' },
  { value: 'date',     label: 'Date' },
]

const INPUT_CLS = 'w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-sm text-white focus:outline-none focus:border-indigo-500 placeholder:text-slate-600'
const INPUT_SM  = 'w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-indigo-500 placeholder:text-slate-600'

function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/, '')
}

function emptyMetric() {
  return { id: Date.now() + Math.random(), label: '', key: '', value_type: 'currency', value: '', unit: '' }
}

function AddServiceForm({ onDone }) {
  const [name, setName]             = useState('')
  const [provider, setProvider]     = useState('')
  const [category, setCategory]     = useState('custom')
  const [costModel, setCostModel]   = useState('flat')
  const [monthlyCost, setMonthlyCost] = useState('')
  const [budgetCap, setBudgetCap]   = useState('')
  const [metrics, setMetrics]       = useState([emptyMetric()])
  const [error, setError]           = useState('')
  const [saving, setSaving]         = useState(false)

  const createService = useCreateService()
  const qc = useQueryClient()

  function addMetric() {
    setMetrics(m => [...m, emptyMetric()])
  }

  function removeMetric(id) {
    setMetrics(m => m.filter(x => x.id !== id))
  }

  function updateMetric(id, field, val) {
    setMetrics(m => m.map(x => {
      if (x.id !== id) return x
      const next = { ...x, [field]: val }
      // Auto-slug the key when the user edits the label (as long as key hasn't been manually touched)
      if (field === 'label' && x.key === slugify(x.label)) {
        next.key = slugify(val)
      }
      return next
    }))
  }

  async function submit(e) {
    e.preventDefault()
    if (!name.trim() || !provider.trim()) {
      setError('Name and provider are required.')
      return
    }
    setSaving(true)
    setError('')
    try {
      const { id } = await createService.mutateAsync({
        name:         name.trim(),
        provider:     provider.trim(),
        category,
        cost_model:   costModel,
        monthly_cost: monthlyCost ? parseFloat(monthlyCost) : null,
        budget_cap:   budgetCap   ? parseFloat(budgetCap)   : null,
      })

      const validMetrics = metrics.filter(m => m.label.trim() && m.key.trim())
      await Promise.all(validMetrics.map(m => {
        const isNumeric = ['number', 'percent', 'currency'].includes(m.value_type)
        return apiFetch(`/api/metrics/${id}/${m.key.trim()}`, {
          method: 'PUT',
          body: JSON.stringify({
            label:      m.label.trim(),
            value_type: m.value_type,
            value_num:  isNumeric && m.value !== '' ? parseFloat(m.value) : null,
            value_text: !isNumeric && m.value !== '' ? m.value.trim() : null,
            unit:       m.unit.trim() || null,
          }),
        })
      }))

      qc.invalidateQueries({ queryKey: ['metrics', id] })
      onDone()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="bg-slate-800 rounded-xl p-5 border border-slate-700 space-y-4">
      <h3 className="text-sm font-semibold text-white">Add Custom Service</h3>

      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-1">
          <span className="block text-xs text-slate-400">Name *</span>
          <input value={name} onChange={e => setName(e.target.value)}
            className={INPUT_CLS} placeholder="My Service" />
        </label>
        <label className="space-y-1">
          <span className="block text-xs text-slate-400">Provider *</span>
          <input value={provider} onChange={e => setProvider(e.target.value)}
            className={INPUT_CLS} placeholder="Acme Inc." />
        </label>
        <label className="space-y-1">
          <span className="block text-xs text-slate-400">Category</span>
          <select value={category} onChange={e => setCategory(e.target.value)} className={INPUT_CLS}>
            {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </label>
        <label className="space-y-1">
          <span className="block text-xs text-slate-400">Cost Model</span>
          <select value={costModel} onChange={e => setCostModel(e.target.value)} className={INPUT_CLS}>
            {COST_MODELS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </label>
        <label className="space-y-1">
          <span className="block text-xs text-slate-400">Monthly Cost ($)</span>
          <input type="number" step="0.01" min="0" value={monthlyCost}
            onChange={e => setMonthlyCost(e.target.value)}
            className={INPUT_CLS} placeholder="0.00" />
        </label>
        <label className="space-y-1">
          <span className="block text-xs text-slate-400">Budget Cap ($)</span>
          <input type="number" step="0.01" min="0" value={budgetCap}
            onChange={e => setBudgetCap(e.target.value)}
            className={INPUT_CLS} placeholder="0.00" />
        </label>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-slate-300">Metrics</span>
          <button type="button" onClick={addMetric}
            className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 transition-colors">
            <Plus size={12} /> Add metric
          </button>
        </div>

        {metrics.map((m, i) => (
          <div key={m.id} className="bg-slate-900/60 rounded-lg p-3 grid grid-cols-2 gap-2">
            <label className="space-y-0.5">
              <span className="block text-xs text-slate-500">Label</span>
              <input value={m.label}
                onChange={e => updateMetric(m.id, 'label', e.target.value)}
                className={INPUT_SM} placeholder="Monthly bill" />
            </label>
            <label className="space-y-0.5">
              <span className="block text-xs text-slate-500">Key</span>
              <input value={m.key}
                onChange={e => updateMetric(m.id, 'key', slugify(e.target.value))}
                className={INPUT_SM} placeholder="monthly_bill" />
            </label>
            <label className="space-y-0.5">
              <span className="block text-xs text-slate-500">Type</span>
              <select value={m.value_type}
                onChange={e => updateMetric(m.id, 'value_type', e.target.value)}
                className={INPUT_SM}>
                {VALUE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </label>
            <label className="space-y-0.5">
              <span className="block text-xs text-slate-500">Initial value</span>
              <input
                type={['number', 'percent', 'currency'].includes(m.value_type) ? 'number' : 'text'}
                step="0.01" value={m.value}
                onChange={e => updateMetric(m.id, 'value', e.target.value)}
                className={INPUT_SM} placeholder="optional" />
            </label>
            <label className="space-y-0.5">
              <span className="block text-xs text-slate-500">Unit</span>
              <input value={m.unit}
                onChange={e => updateMetric(m.id, 'unit', e.target.value)}
                className={INPUT_SM} placeholder="e.g. tokens" />
            </label>
            <div className="flex items-end">
              <button type="button" onClick={() => removeMetric(m.id)}
                disabled={metrics.length === 1}
                className="text-slate-600 hover:text-red-400 disabled:opacity-30 transition-colors"
                title="Remove metric">
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onDone}
          className="px-3 py-1.5 text-xs text-slate-400 hover:text-white transition-colors">
          Cancel
        </button>
        <button type="submit" disabled={saving}
          className="px-4 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg transition-colors">
          {saving ? 'Saving…' : 'Add Service'}
        </button>
      </div>
    </form>
  )
}

function ServiceRow({ service }) {
  const patch   = usePatchService()
  const archive = useArchiveService()

  return (
    <div className="flex items-center justify-between gap-3 bg-slate-800/60 rounded-lg px-3 py-2 border border-slate-700/50">
      <div className="flex-1 min-w-0">
        <p className={`text-sm truncate ${service.active ? 'text-white' : 'text-slate-500'}`}>
          {service.name}
        </p>
        <p className="text-xs text-slate-500">{service.provider} · {service.category}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={() => patch.mutate({ id: service.id, active: service.active ? 0 : 1 })}
          className={`transition-colors ${service.active ? 'text-emerald-400 hover:text-emerald-300' : 'text-slate-600 hover:text-slate-400'}`}
          title={service.active ? 'Disable' : 'Enable'}>
          {service.active ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
        </button>
        {!service.is_seed && (
          <button
            onClick={() => archive.mutate(service.id)}
            className="text-slate-600 hover:text-red-400 transition-colors"
            title="Archive service">
            <Trash2 size={14} />
          </button>
        )}
      </div>
    </div>
  )
}

export default function Settings() {
  const [showForm, setShowForm] = useState(false)
  const { data: services = [], isLoading } = useServices({ all: true })

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-white">Settings</h2>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors">
            <Plus size={13} /> Add Service
          </button>
        )}
      </div>

      {showForm && (
        <AddServiceForm onDone={() => setShowForm(false)} />
      )}

      <section className="space-y-3">
        <h3 className="text-sm font-medium text-slate-300">Manage Services</h3>
        {isLoading ? (
          <p className="text-xs text-slate-500">Loading…</p>
        ) : (
          <div className="space-y-1.5">
            {services.map(s => <ServiceRow key={s.id} service={s} />)}
          </div>
        )}
      </section>
    </div>
  )
}
