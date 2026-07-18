import * as Icons from 'lucide-react'
import { useState, useEffect, useRef } from 'react'
import { useMetrics, useUpsertMetric } from '../../hooks/useMetrics'
import { useSnapshots } from '../../hooks/useSnapshots'
import { useCatalog, useApplyCatalogPlan } from '../../hooks/useCatalog'
import { useAllowOutbound, useUpsertConnector, useSyncConnector, useTestConnector, useAuditConnector, useDeleteConnector } from '../../hooks/useConnectors'
import { useProviders } from '../../hooks/useProviders'

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

// Date metrics are all "next reset" timestamps — show the time remaining
// ("in 5h", "in 3d") rather than a raw date. Falls back to the date once elapsed.
function formatReset(date) {
  const ms = date.getTime() - Date.now()
  if (ms <= 0) return date.toLocaleDateString()
  const mins = Math.round(ms / 60000)
  if (mins < 60) return `in ${mins}m`
  const hours = Math.round(mins / 60)
  if (hours < 48) return `in ${hours}h`
  return `in ${Math.round(hours / 24)}d`
}

function parseDateValue({ value_text, value_num }) {
  const d = value_text ? new Date(value_text) : (value_num != null ? new Date(value_num * 1000) : null)
  return d && !isNaN(d.getTime()) ? d : null
}

function formatValue(metric) {
  const { value_type, value_num, value_text, unit } = metric
  if (value_num == null && !value_text) return '—'
  switch (value_type) {
    case 'currency': return `$${value_num.toFixed(2)}`
    case 'percent':  return `${value_num.toFixed(1)}%`
    case 'number':   return `${value_num.toLocaleString()}${unit ? ' ' + unit : ''}`
    case 'date': {
      const d = parseDateValue(metric)
      return d ? formatReset(d) : (value_text ?? '—')
    }
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

function MetricRow({ metric, service, prevBill, readOnly }) {
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
            <span
              className={`text-xs font-medium ${isEmpty ? 'text-slate-600' : 'text-slate-200'}`}
              title={metric.value_type === 'date' ? (parseDateValue(metric)?.toLocaleString() ?? undefined) : undefined}
            >
              {formatValue(metric)}
            </span>
          )}
          {!readOnly && (
            <button
              onClick={editing ? () => setEditing(false) : startEdit}
              className="ml-0.5 text-slate-600 hover:text-slate-400 transition-colors"
              title={editing ? 'Cancel' : 'Update value'}
            >
              {editing ? <Icons.X size={11} /> : <Icons.Pencil size={11} />}
            </button>
          )}
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

// ─── Connect panels ───────────────────────────────────────────────────────────

const SELECT_CLS = 'w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500'
const BTN_PRIMARY = 'w-full px-2 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-lg transition-colors'

// `catalogKey` is the provider's catalog index, fixed by the service's bound
// provider — the user only picks a plan here, never the provider.
function CatalogPanel({ service, catalogKey, onClose }) {
  const { data: catalog = {}, isLoading } = useCatalog()
  const apply = useApplyCatalogPlan()
  const [planKey, setPlanKey] = useState('')

  const plans = catalog[catalogKey]?.plans
    ? Object.entries(catalog[catalogKey].plans)
    : []

  async function handleApply() {
    if (!planKey) return
    await apply.mutateAsync({ serviceId: service.id, providerKey: catalogKey, planKey })
    onClose()
  }

  return (
    <div className="space-y-1.5">
      {isLoading ? (
        <p className="text-xs text-slate-500">Loading catalog…</p>
      ) : (
        <>
          <select value={planKey} onChange={e => setPlanKey(e.target.value)} className={SELECT_CLS}>
            <option value="">Select plan…</option>
            {plans.map(([k, v]) => (
              <option key={k} value={k}>{v.label} — ${v.price}/{v.billing_cycle}</option>
            ))}
          </select>

          {apply.isError && <p className="text-xs text-red-400">Failed to apply plan</p>}

          <button
            onClick={handleApply}
            disabled={!planKey || apply.isPending}
            className={BTN_PRIMARY}
          >
            {apply.isPending ? 'Applying…' : 'Apply Plan'}
          </button>
        </>
      )}
    </div>
  )
}

// Renders one connector input from its `fields` schema entry.
const FIELD_INPUT_CLS = 'w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500 placeholder:text-slate-600'

function FormField({ field, value, onChange }) {
  const { label, kind, type, options, required, placeholder, help } = field
  const inputType = type ?? (kind === 'secret' ? 'password' : 'text')
  return (
    <div className="space-y-0.5">
      <label className="text-xs text-slate-400">
        {label}{required && <span className="text-red-400"> *</span>}
      </label>
      {inputType === 'select' ? (
        <select value={value} onChange={e => onChange(e.target.value)} className={FIELD_INPUT_CLS}>
          <option value="">Default</option>
          {(options ?? []).map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : (
        <input
          type={inputType}
          placeholder={placeholder ?? ''}
          value={value}
          onChange={e => onChange(e.target.value)}
          className={FIELD_INPUT_CLS}
        />
      )}
      {help && <p className="text-xs text-slate-500 leading-snug">{help}</p>}
    </div>
  )
}

// `apiKey`/`authType`/`fields` come from the service's bound provider — the connector is
// fixed, so the user only supplies its declared credentials (or localOAuth consent),
// never a provider. Connectors without a `fields` schema get a single API-token field.
function ApiPanel({ service, apiKey, authType, fields }) {
  const upsert = useUpsertConnector()
  const sync = useSyncConnector()
  const test = useTestConnector()
  const audit = useAuditConnector()
  const disconnect = useDeleteConnector()
  const { allowed } = useAllowOutbound()
  const [values, setValues] = useState({})
  const [consent, setConsent] = useState(false)
  const [error, setError] = useState('')
  const [testResult, setTestResult] = useState('')

  const isApiConnected = service.connector_type === 'api'

  const providerKey = apiKey
  const isLocalOAuth = authType === 'localOAuth'

  const formFields = fields ?? [{ name: 'apiKey', label: 'API token', kind: 'secret', required: true }]
  const requiredFilled = formFields
    .filter(f => f.required)
    .every(f => (values[f.name] ?? '').trim() !== '')
  const canSave = !!providerKey && (isLocalOAuth ? consent : requiredFilled)

  async function handleSave() {
    if (!canSave) return
    setError('')
    try {
      if (isLocalOAuth) {
        await upsert.mutateAsync({ serviceId: service.id, providerKey, config: { consentLocalToken: true } })
      } else {
        const secrets = {}
        const config = {}
        for (const f of formFields) {
          const v = (values[f.name] ?? '').trim()
          if (v === '') continue
          if (f.kind === 'secret') secrets[f.name] = v
          else config[f.name] = v
        }
        await upsert.mutateAsync({ serviceId: service.id, providerKey, secrets, config })
        setValues({})
      }
    } catch {
      setError('Failed to save connector')
    }
  }

  async function handleSync() {
    setError('')
    try {
      await sync.mutateAsync(service.id)
    } catch {
      setError('Sync failed')
    }
  }

  async function handleTest() {
    setError('')
    setTestResult('')
    try {
      await test.mutateAsync(service.id)
      setTestResult('ok')
    } catch {
      setTestResult('failed')
    }
  }

  async function handleAudit() {
    setError('')
    try {
      await audit.mutateAsync(service.id)
    } catch {
      setError('Audit failed')
    }
  }

  async function handleDisconnect() {
    setError('')
    try {
      await disconnect.mutateAsync(service.id)
    } catch {
      setError('Failed to disconnect')
    }
  }

  if (!isApiConnected) {
    return (
      <div className="space-y-1.5">
        {isLocalOAuth ? (
              <>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Reads the OAuth token Claude Code stores on this machine to fetch your plan usage % (read-only, same data as claude.ai/settings/usage). The token is never copied or stored by Levee. Unofficial endpoint — may stop working.
                </p>
                <label className="flex items-start gap-2 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={e => setConsent(e.target.checked)}
                    className="mt-0.5 accent-indigo-500"
                  />
                  <span>I consent to Levee reading Claude Code's local token</span>
                </label>
              </>
            ) : (
              formFields.map(f => (
                <FormField
                  key={f.name}
                  field={f}
                  value={values[f.name] ?? ''}
                  onChange={v => setValues(prev => ({ ...prev, [f.name]: v }))}
                />
              ))
            )}
            {error && <p className="text-xs text-red-400">{error}</p>}
            <button
              onClick={handleSave}
              disabled={!canSave || upsert.isPending}
              className={BTN_PRIMARY}
            >
              {upsert.isPending ? 'Saving…' : 'Save & Connect'}
            </button>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div>
        {service.last_sync_at ? (
          <p className="text-xs text-slate-500">
            Last sync: {new Date(service.last_sync_at).toLocaleString()}
          </p>
        ) : (
          <p className="text-xs text-slate-500">Never synced</p>
        )}
        {service.sync_status === 'error' && service.sync_error && (
          <p className="text-xs text-red-400 truncate" title={service.sync_error}>
            {service.sync_error}
          </p>
        )}
        {service.sync_status === 'ok' && (
          <p className="text-xs text-emerald-400">Synced OK</p>
        )}
      </div>

      <div className="space-y-1">
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleSync}
            disabled={!allowed || sync.isPending}
            title={!allowed ? 'Enable outbound connections in Settings to sync' : undefined}
            className="flex items-center gap-1.5 px-2 py-1 text-xs bg-slate-700 hover:bg-slate-600 disabled:opacity-40 text-white rounded-lg transition-colors"
          >
            <Icons.RefreshCw size={11} className={sync.isPending ? 'animate-spin' : ''} />
            {sync.isPending ? 'Syncing…' : 'Sync now'}
          </button>
          <button
            onClick={handleTest}
            disabled={!allowed || test.isPending}
            title={!allowed ? 'Enable outbound connections in Settings to test' : 'Confirm the stored credential works, without a full sync'}
            className="flex items-center gap-1.5 px-2 py-1 text-xs bg-slate-700 hover:bg-slate-600 disabled:opacity-40 text-white rounded-lg transition-colors"
          >
            <Icons.Zap size={11} className={test.isPending ? 'animate-pulse' : ''} />
            {test.isPending ? 'Testing…' : 'Test connection'}
          </button>
          {providerKey === 'aws_cost' && (
            <button
              onClick={handleAudit}
              disabled={!allowed || audit.isPending}
              title={!allowed ? 'Enable outbound connections in Settings to audit' : 'Probe IAM/S3/EC2 for over-privilege (opt-in, read-only)'}
              className="flex items-center gap-1.5 px-2 py-1 text-xs bg-slate-700 hover:bg-slate-600 disabled:opacity-40 text-white rounded-lg transition-colors"
            >
              <Icons.ShieldCheck size={11} className={audit.isPending ? 'animate-pulse' : ''} />
              {audit.isPending ? 'Auditing…' : 'Audit key permissions'}
            </button>
          )}
          <button
            onClick={handleDisconnect}
            disabled={disconnect.isPending}
            title="Disconnect and remove stored credentials"
            className="flex items-center gap-1.5 px-2 py-1 text-xs bg-slate-700 hover:bg-red-900/60 disabled:opacity-40 text-slate-300 hover:text-red-300 rounded-lg transition-colors"
          >
            <Icons.Unplug size={11} />
            {disconnect.isPending ? 'Disconnecting…' : 'Disconnect'}
          </button>
        </div>
        {!allowed && (
          <p className="text-xs text-amber-500">Enable outbound connections in Settings to sync</p>
        )}
        {testResult === 'ok' && <p className="text-xs text-emerald-400">Connection OK</p>}
        {testResult === 'failed' && <p className="text-xs text-red-400">Test connection failed</p>}
        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>
    </div>
  )
}

function ConnectSection({ service }) {
  const { data: providers = [] } = useProviders()
  const [open, setOpen] = useState(false)

  const provider = providers.find(p => p.key === service.provider_key)
  const hasCatalog = !!provider?.catalogKey
  const hasApi = !!provider?.apiKey
  const tabs = [hasCatalog && 'catalog', hasApi && 'api'].filter(Boolean)

  // Default to the first method the provider supports; flips to a valid tab once
  // the directory loads.
  const [tab, setTab] = useState('catalog')
  useEffect(() => {
    if (tabs.length > 0 && !tabs.includes(tab)) setTab(tabs[0])
  }, [tabs, tab])

  const isAutoConnected = service.connector_type !== 'manual'

  return (
    <div className="border-t border-slate-700/60 pt-2.5 space-y-2">
      {/* Status row or Connect button */}
      {isAutoConnected && !open && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
              service.sync_status === 'error' ? 'bg-red-400' : 'bg-emerald-400'
            }`} />
            <span className="text-xs text-slate-400">
              {service.connector_type === 'catalog'
                ? `Catalog: ${service.plan_key ?? ''}`
                : 'API connected'}
            </span>
            {service.consecutive_failures >= 3 && (
              <span
                className="text-xs text-amber-500"
                title={`${service.consecutive_failures} syncs failed in a row — backed off to a 24h retry floor`}
              >
                (backed off)
              </span>
            )}
          </div>
          <button
            onClick={() => setOpen(true)}
            className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
          >
            Change
          </button>
        </div>
      )}

      {!isAutoConnected && !open && (
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
        >
          <Icons.Plug size={11} /> Connect
        </button>
      )}

      {/* Expanded panel */}
      {open && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            {/* Only show the method switcher when the provider offers both. */}
            <div className="flex gap-1">
              {tabs.length > 1 && tabs.map(t => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`text-xs px-2 py-0.5 rounded transition-colors ${
                    tab === t
                      ? 'bg-slate-700 text-white'
                      : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  {t === 'catalog' ? 'Catalog' : 'API'}
                </button>
              ))}
            </div>
            <button
              onClick={() => setOpen(false)}
              className="text-slate-600 hover:text-slate-400 transition-colors"
            >
              <Icons.X size={11} />
            </button>
          </div>

          {tabs.length === 0 ? (
            <p className="text-xs text-slate-500">No connector available for this provider.</p>
          ) : tab === 'catalog' && hasCatalog ? (
            <CatalogPanel service={service} catalogKey={provider.catalogKey} onClose={() => setOpen(false)} />
          ) : (
            <ApiPanel service={service} apiKey={provider.apiKey} authType={provider.authType} fields={provider.fields} />
          )}
        </div>
      )}
    </div>
  )
}

// ─── ServiceCard ──────────────────────────────────────────────────────────────

export default function ServiceCard({ service, focused = false }) {
  const { data: metrics = [], isLoading } = useMetrics(service.id)
  const { data: snapshots = [] } = useSnapshots(2)
  const cardRef = useRef(null)

  // Deep-link target from an overlay slot click (see App.jsx's NavigationListener) —
  // scroll it into view once on arrival so the user doesn't have to hunt for it.
  useEffect(() => {
    if (focused) cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [focused])

  const lastSnapshot = snapshots[snapshots.length - 1]
  const prevBill = lastSnapshot?.breakdown?.find(r => r.id === service.id)?.monthly_bill ?? null

  // Services with auto retrieval can offer a Connect section, but that doesn't mean
  // every metric on the card is automation-owned — a seeded metric the connector
  // never writes (e.g. a catalog-only service's usage metric) stays user-editable.
  // Each metric locks individually based on which write path last touched it.
  const autoAvailable = !!service.auto_available

  const IconComponent = (service.icon && Icons[service.icon]) || Icons.Package
  const categoryStyle = CATEGORY_STYLES[service.category] ?? CATEGORY_STYLES.custom
  const categoryLabel = CATEGORY_LABELS[service.category] ?? service.category

  // Flags the card when the opt-in AWS key-privilege audit (ServiceCard's
  // ApiPanel → "Audit key permissions") found the connected credential can
  // reach more than Levee asked for.
  const auditFlagged = !!metrics.find(m => m.metric_key === 'key_privilege_audit')?.value_text?.startsWith('⚠')

  return (
    <div
      ref={cardRef}
      className={`bg-slate-800 rounded-xl p-4 border flex flex-col gap-3 transition-colors ${
        auditFlagged ? 'border-red-500/70 ring-2 ring-red-500/30'
          : focused ? 'border-indigo-500 ring-2 ring-indigo-500/50' : 'border-slate-700'
      }`}
    >
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
              readOnly={m.source !== 'manual'}
            />
          ))}
        </div>
      ) : (
        <p className="text-xs text-slate-600 border-t border-slate-700/60 pt-3">No metrics configured</p>
      )}

      {autoAvailable ? (
        <ConnectSection service={service} />
      ) : (
        <p className="border-t border-slate-700/60 pt-2.5 text-xs text-slate-600">
          No auto-sync available — values are entered manually.
        </p>
      )}
    </div>
  )
}
