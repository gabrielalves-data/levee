import { useQuery } from '@tanstack/react-query'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { apiFetch } from './api'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
})

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
  const isEmpty = !slot.service_id

  function handleClick() {
    if (!isEmpty) window.devcost?.openDashboard(slot.service_id)
  }

  if (isEmpty) {
    return (
      <div
        style={{ WebkitAppRegion: 'no-drag' }}
        className="rounded-lg border border-dashed border-white/10 flex items-center justify-center"
      >
        <span className="text-white/20 text-xl select-none">+</span>
      </div>
    )
  }

  return (
    <div
      onClick={handleClick}
      style={{ WebkitAppRegion: 'no-drag' }}
      className="rounded-lg bg-black/60 border border-white/10 p-2.5 flex flex-col justify-between cursor-pointer hover:bg-black/70 active:bg-black/80 transition-colors select-none"
    >
      <p className="text-white/50 text-[10px] leading-none truncate">{slot.service_name}</p>
      <p className="text-white font-semibold text-base leading-snug truncate">{formatValue(slot)}</p>
      <p className="text-white/40 text-[10px] leading-none truncate">
        {slot.label_override || slot.metric_label || slot.metric_key}
      </p>
    </div>
  )
}

function OverlayInner() {
  const { data: slots = [] } = useQuery({
    queryKey: ['widget'],
    queryFn:  () => apiFetch('/api/widget'),
    refetchInterval: 30_000,
  })

  const normalized = [0, 1, 2, 3].map(i =>
    slots.find(s => s.slot_index === i) ?? { slot_index: i, service_id: null }
  )

  return (
    <div
      className="w-[260px] h-[320px] rounded-xl p-2 overflow-hidden"
      style={{ WebkitAppRegion: 'drag', background: 'rgba(2, 6, 23, 0.88)' }}
    >
      {/* Drag handle */}
      <div
        className="h-5 flex items-center justify-center mb-1.5"
        style={{ WebkitAppRegion: 'drag' }}
      >
        <div className="w-8 h-1 rounded-full bg-white/10 pointer-events-none" />
      </div>

      {/* 2×2 slot grid */}
      <div className="grid grid-cols-2 gap-2" style={{ height: 'calc(100% - 28px)' }}>
        {normalized.map(slot => <Slot key={slot.slot_index} slot={slot} />)}
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
