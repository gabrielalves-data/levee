import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { apiFetch } from './api'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
})

// Window width per filled-slot count
const WINDOW_W = [160, 192, 296, 384, 460]
const WINDOW_H = 72

function formatValue(slot) {
  if (!slot.service_id) return '—'
  const v = slot.value_num
  if (v === null || v === undefined) return slot.value_text || '—'
  switch (slot.value_type) {
    case 'currency': return `$${v.toFixed(2)}`
    case 'percent':  return `${v}%`
    default:         return slot.unit ? `${v} ${slot.unit}` : String(v)
  }
}

function Slot({ slot }) {
  return (
    <div
      onClick={() => window.devcost?.openDashboard(slot.service_id)}
      style={{ WebkitAppRegion: 'no-drag' }}
      className="flex-1 rounded-lg bg-black/50 border border-white/[0.08] px-2.5 py-1.5 flex flex-col justify-between cursor-pointer hover:bg-black/65 active:scale-[0.97] transition-all select-none"
    >
      <p className="text-emerald-400/50 text-[10px] leading-none truncate">{slot.service_name}</p>
      <p className="text-emerald-300 font-semibold text-sm leading-tight truncate">{formatValue(slot)}</p>
      <p className="text-white/35 text-[9px] leading-none truncate">
        {slot.label_override || slot.metric_label || slot.metric_key}
      </p>
    </div>
  )
}

function OverlayInner() {
  const { data: slots = [], refetch } = useQuery({
    queryKey: ['widget'],
    queryFn:  () => apiFetch('/api/widget'),
    refetchInterval: 30_000,
  })

  const filled = slots.filter(s => s.service_id)

  useEffect(() => {
    const cleanup = window.devcost?.onWidgetUpdate?.(() => refetch())
    return () => cleanup?.()
  }, [refetch])

  useEffect(() => {
    const w = WINDOW_W[Math.min(filled.length, 4)]
    window.devcost?.resizeOverlay?.(w, WINDOW_H)
  }, [filled.length])

  return (
    <div
      className="w-full h-full rounded-xl flex flex-col px-2 pt-1.5 pb-2"
      style={{
        WebkitAppRegion: 'drag',
        background: 'rgba(5, 8, 5, 0.92)',
        border: '1px solid rgba(0, 255, 156, 0.14)',
      }}
    >
      <div className="flex justify-center mb-1.5">
        <div className="w-5 h-0.5 rounded-full bg-emerald-400/20 pointer-events-none" />
      </div>

      <div className="flex gap-1.5 flex-1">
        {filled.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-white/15 text-[10px] select-none">no slots configured</p>
          </div>
        ) : (
          filled.map(slot => <Slot key={slot.slot_index} slot={slot} />)
        )}
      </div>
    </div>
  )
}

export default function Overlay() {
  return (
    <QueryClientProvider client={queryClient}>
      <OverlayInner />
    </QueryClientProvider>
  )
}
