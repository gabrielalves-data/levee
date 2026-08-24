import { RefreshCw } from 'lucide-react'
import { useAllowOutbound, useSyncAllConnectors, useSyncAllCooldown } from '../hooks/useConnectors'

export default function SyncAllButton() {
  const { allowed } = useAllowOutbound()
  const sync = useSyncAllConnectors()
  const secondsLeft = useSyncAllCooldown()
  const cooling = secondsLeft > 0

  function label() {
    if (sync.isPending) return 'Syncing…'
    if (cooling) return `Wait ${secondsLeft}s`
    return 'Sync all'
  }

  function title() {
    if (!allowed) return 'Enable outbound connections in Settings to sync'
    if (cooling) return 'Synced recently — try again shortly'
    return 'Force-sync every connected service right now'
  }

  return (
    <div className="flex items-center gap-1.5">
      <button
        onClick={() => sync.mutate()}
        disabled={!allowed || sync.isPending || cooling}
        title={title()}
        className="flex items-center gap-1.5 px-2 py-1 text-xs bg-slate-700 hover:bg-slate-600 disabled:opacity-40 text-white rounded-lg transition-colors"
      >
        <RefreshCw size={11} className={sync.isPending ? 'animate-spin' : ''} />
        {label()}
      </button>
      {sync.isError && <span className="text-xs text-red-400">Sync failed</span>}
    </div>
  )
}
