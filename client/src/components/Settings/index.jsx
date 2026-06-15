import { Globe, ToggleLeft, ToggleRight } from 'lucide-react'
import { useAllowOutbound } from '../../hooks/useConnectors'

export default function AllowOutboundToggle() {
  const { allowed, setAllowed, isPending } = useAllowOutbound()

  return (
    <div className="flex items-center justify-between bg-slate-800/60 rounded-lg px-3 py-2.5 border border-slate-700/50">
      <div className="flex items-start gap-2.5">
        <Globe size={15} className={`mt-0.5 shrink-0 ${allowed ? 'text-emerald-400' : 'text-slate-500'}`} />
        <div>
          <p className="text-sm text-white">Allow Outbound Connections</p>
          <p className="text-xs text-slate-500 mt-0.5 max-w-xs">
            Allow outbound connections to provider APIs. Off by default. Levee only contacts the official host of each connector you enable.
          </p>
        </div>
      </div>
      <button
        onClick={() => setAllowed(!allowed)}
        disabled={isPending}
        className={`ml-4 shrink-0 transition-colors disabled:opacity-50 ${
          allowed ? 'text-emerald-400 hover:text-emerald-300' : 'text-slate-600 hover:text-slate-400'
        }`}
        title={allowed ? 'Disable outbound connections' : 'Enable outbound connections'}
      >
        {allowed ? <ToggleRight size={22} /> : <ToggleLeft size={22} />}
      </button>
    </div>
  )
}
