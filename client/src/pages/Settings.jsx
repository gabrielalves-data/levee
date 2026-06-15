import { useState, useEffect, useRef } from 'react'
import { Plus, Trash2, ToggleLeft, ToggleRight, Download, Upload, Lock, Unlock } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useServices, useCreateService, usePatchService, useArchiveService } from '../hooks/useServices'
import { useProviders } from '../hooks/useProviders'
import { apiFetch } from '../api'
import WidgetConfig from '../components/Widget'
import AllowOutboundToggle from '../components/Settings'

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

const CATEGORY_LABELS = {
  cloud: 'Cloud', ai_model: 'AI Model', ai_api: 'AI API', tool: 'Dev Tool', custom: 'Custom',
}

// Provider-first: pick a known provider once — that defines the service. The actual
// connection (plan or token/consent) happens on the service card, which no longer
// asks for the provider again.
function ProviderServiceForm({ onDone }) {
  const { data: providers = [], isLoading } = useProviders()
  const [providerKey, setProviderKey] = useState('')
  const [name, setName]               = useState('')
  const [nameTouched, setNameTouched] = useState(false)
  const [budgetCap, setBudgetCap]     = useState('')
  const [error, setError]             = useState('')
  const [saving, setSaving]           = useState(false)

  const createService = useCreateService()
  const selected = providers.find(p => p.key === providerKey)

  function pickProvider(key) {
    setProviderKey(key)
    const p = providers.find(x => x.key === key)
    if (p && !nameTouched) setName(p.label)
  }

  async function submit(e) {
    e.preventDefault()
    if (!selected) {
      setError('Pick a provider.')
      return
    }
    setSaving(true)
    setError('')
    try {
      await createService.mutateAsync({
        name:         name.trim() || selected.label,
        provider:     selected.label,
        provider_key: selected.key,
        category:     selected.category,
        budget_cap:   budgetCap ? parseFloat(budgetCap) : null,
      })
      onDone()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="text-xs text-slate-500">
        Pick the provider — that becomes the service. You'll connect its plan or API on the service card.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-1">
          <span className="block text-xs text-slate-400">Provider *</span>
          <select value={providerKey} onChange={e => pickProvider(e.target.value)}
            className={INPUT_CLS} disabled={isLoading}>
            <option value="">{isLoading ? 'Loading…' : 'Select provider…'}</option>
            {providers.map(p => (
              <option key={p.key} value={p.key}>{p.label}</option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="block text-xs text-slate-400">Name</span>
          <input value={name}
            onChange={e => { setName(e.target.value); setNameTouched(true) }}
            className={INPUT_CLS} placeholder="Service name" />
        </label>
        <label className="space-y-1">
          <span className="block text-xs text-slate-400">Category</span>
          <input value={selected ? (CATEGORY_LABELS[selected.category] ?? selected.category) : ''}
            className={INPUT_CLS} disabled readOnly placeholder="—" />
        </label>
        <label className="space-y-1">
          <span className="block text-xs text-slate-400">Budget Cap ($)</span>
          <input type="number" step="0.01" min="0" value={budgetCap}
            onChange={e => setBudgetCap(e.target.value)}
            className={INPUT_CLS} placeholder="0.00" />
        </label>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onDone}
          className="px-3 py-1.5 text-xs text-slate-400 hover:text-white transition-colors">
          Cancel
        </button>
        <button type="submit" disabled={saving || !providerKey}
          className="px-4 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg transition-colors">
          {saving ? 'Saving…' : 'Add Service'}
        </button>
      </div>
    </form>
  )
}

// Wraps the two creation modes: provider-first (default) and free-text custom.
function AddServiceForm({ onDone }) {
  const [mode, setMode] = useState('provider')

  return (
    <div className="vt-pop bg-slate-800 rounded-xl p-5 border border-slate-700 space-y-4">
      <div className="flex items-center gap-1">
        {[['provider', 'Connect a provider'], ['custom', 'Custom service']].map(([m, label]) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`text-xs px-2.5 py-1 rounded transition-colors ${
              mode === m ? 'bg-slate-700 text-white' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {mode === 'provider'
        ? <ProviderServiceForm onDone={onDone} />
        : <CustomServiceForm onDone={onDone} />
      }
    </div>
  )
}

function CustomServiceForm({ onDone }) {
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
    <form onSubmit={submit} className="space-y-4">
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

function DataManagement() {
  const [importStatus, setImportStatus] = useState(null)
  const fileRef = useRef(null)
  const qc = useQueryClient()

  async function handleExport() {
    const data = await apiFetch('/api/backup/export')
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url  = URL.createObjectURL(blob)
    const a    = Object.assign(document.createElement('a'), {
      href:     url,
      download: `levee-backup-${new Date().toISOString().slice(0, 10)}.json`,
    })
    a.click()
    URL.revokeObjectURL(url)
  }

  async function handleImport(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setImportStatus(null)
    try {
      const text    = await file.text()
      const payload = JSON.parse(text)
      const result  = await apiFetch('/api/backup/import', {
        method: 'POST',
        body:   JSON.stringify(payload),
      })
      setImportStatus({ ok: true, msg: `Imported: ${result.imported.services} services, ${result.imported.metrics} metrics` })
      qc.invalidateQueries()
    } catch (err) {
      setImportStatus({ ok: false, msg: err.message })
    } finally {
      e.target.value = ''
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <button
          onClick={handleExport}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors">
          <Download size={13} /> Export backup
        </button>
        <button
          onClick={() => fileRef.current?.click()}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors">
          <Upload size={13} /> Import backup
        </button>
        <input ref={fileRef} type="file" accept=".json" className="hidden" onChange={handleImport} />
      </div>
      {importStatus && (
        <p className={`text-xs ${importStatus.ok ? 'text-emerald-400' : 'text-red-400'}`}>
          {importStatus.msg}
        </p>
      )}
      <p className="text-xs text-slate-500">
        Export includes all services, metrics, widget slots, and snapshots. Secrets are never exported.
      </p>
    </div>
  )
}

function EncryptionToggle() {
  const [encrypted, setEncrypted] = useState(false)
  const [busy, setBusy]           = useState(false)
  const [error, setError]         = useState('')

  useEffect(() => {
    apiFetch('/api/encryption/status')
      .then(d => setEncrypted(d.encrypted))
      .catch(() => {})
  }, [])

  async function toggle() {
    setBusy(true)
    setError('')
    try {
      const result = await apiFetch('/api/encryption/toggle', {
        method: 'POST',
        body:   JSON.stringify({ enable: !encrypted }),
      })
      setEncrypted(result.encrypted)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between bg-slate-800/60 rounded-lg px-3 py-2.5 border border-slate-700/50">
        <div>
          <p className="text-sm text-white flex items-center gap-1.5">
            {encrypted ? <Lock size={14} className="text-amber-400" /> : <Unlock size={14} className="text-slate-500" />}
            Database Encryption
          </p>
          <p className="text-xs text-slate-500 mt-0.5">
            {encrypted ? 'At-rest encryption enabled — passphrase stored in OS keychain' : 'Database stored unencrypted'}
          </p>
        </div>
        <button
          onClick={toggle}
          disabled={busy}
          className={`transition-colors disabled:opacity-50 ${encrypted ? 'text-emerald-400 hover:text-emerald-300' : 'text-slate-600 hover:text-slate-400'}`}
          title={encrypted ? 'Disable encryption' : 'Enable encryption'}>
          {encrypted ? <ToggleRight size={22} /> : <ToggleLeft size={22} />}
        </button>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  )
}

function OverlaySection() {
  const [enabled, setEnabled] = useState(true)

  useEffect(() => {
    window.levee?.getOverlayEnabled?.().then(v => {
      if (v !== undefined) setEnabled(!!v)
    })
  }, [])

  function toggle() {
    const next = !enabled
    setEnabled(next)
    window.levee?.setOverlayEnabled?.(next)
  }

  return (
    <section className="space-y-3">
      <h3 className="text-sm font-medium text-slate-300">Overlay Widget</h3>
      <div className="flex items-center justify-between bg-slate-800/60 rounded-lg px-3 py-2.5 border border-slate-700/50">
        <div>
          <p className="text-sm text-white">Show Overlay</p>
          <p className="text-xs text-slate-500 mt-0.5">Always-on-top widget (Ctrl+Shift+G)</p>
        </div>
        <button
          onClick={toggle}
          className={`transition-colors ${enabled ? 'text-emerald-400 hover:text-emerald-300' : 'text-slate-600 hover:text-slate-400'}`}
          title={enabled ? 'Hide overlay' : 'Show overlay'}
        >
          {enabled ? <ToggleRight size={22} /> : <ToggleLeft size={22} />}
        </button>
      </div>
      {enabled && (
        <div className="space-y-2">
          <p className="text-xs text-slate-500">Configure the slots shown in the overlay.</p>
          <WidgetConfig />
        </div>
      )}
    </section>
  )
}

function LaunchAtLoginToggle() {
  const [enabled, setEnabled] = useState(false)

  useEffect(() => {
    window.levee?.getLoginItem?.().then(v => setEnabled(!!v))
  }, [])

  function toggle() {
    const next = !enabled
    setEnabled(next)
    window.levee?.setLoginItem?.(next)
  }

  return (
    <div className="flex items-center justify-between bg-slate-800/60 rounded-lg px-3 py-2.5 border border-slate-700/50">
      <div>
        <p className="text-sm text-white">Launch at Login</p>
        <p className="text-xs text-slate-500 mt-0.5">Start Levee when you log in</p>
      </div>
      <button
        onClick={toggle}
        className={`transition-colors ${enabled ? 'text-emerald-400 hover:text-emerald-300' : 'text-slate-600 hover:text-slate-400'}`}
        title={enabled ? 'Disable' : 'Enable'}
      >
        {enabled ? <ToggleRight size={22} /> : <ToggleLeft size={22} />}
      </button>
    </div>
  )
}

export default function Settings() {
  const [showForm, setShowForm] = useState(false)
  const { data: services = [], isLoading } = useServices({ all: true })

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-slate-100">
          <span className="text-emerald-400 glow">&gt;</span> settings
        </h2>
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

      <OverlaySection />

      <section className="space-y-3">
        <h3 className="text-sm font-medium text-slate-300">App</h3>
        <LaunchAtLoginToggle />
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-medium text-slate-300">Data Management</h3>
        <DataManagement />
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-medium text-slate-300">Connections</h3>
        <AllowOutboundToggle />
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-medium text-slate-300">Security</h3>
        <EncryptionToggle />
      </section>
    </div>
  )
}
