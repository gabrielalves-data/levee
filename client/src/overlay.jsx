import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Minimize2, Activity } from 'lucide-react'
import { apiFetch } from './api'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
})

// Window width per filled-slot count (includes the 6px transparent shadow gutter
// on each side; interior matches the pre-gutter card sizes).
const WINDOW_W = [172, 204, 308, 396, 472]
const WINDOW_H = 84
// Collapsed (minimized) window — a small dock-dot the overlay tucks into.
const PILL = 28

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

// Frosted, shadowed chrome shared by the panel and the minimized pill so both
// read as the same floating object.
const CARD_SHADOW =
  '0 8px 24px rgba(0, 0, 0, 0.45), 0 0 0 0.5px rgba(0, 255, 156, 0.10), inset 0 1px 0 rgba(255, 255, 255, 0.04)'
const CARD_BG = 'rgba(5, 8, 5, 0.78)'

// Collapse/expand animation length. The window stays panel-sized for this whole
// window so the morph has room; only then does it snap to/from the pill bounds.
const MORPH_MS = 280
const MORPH_EASE = 'cubic-bezier(0.34, 1.4, 0.5, 1)'

// Pointer travel (px) below which a header press counts as a click, not a drag.
const DRAG_THRESHOLD = 4

// Manual window drag: the overlay window is non-focusable, so the native
// `-webkit-app-region: drag` region can't move it on Windows. We capture the
// pointer on the grip, fix the cursor's screen origin, then stream
// (windowStart + cursorDelta) to the main process for the duration of the drag.
// A press that never crosses DRAG_THRESHOLD is treated as a tap and fires
// `onTap` on release — so a single click on the header minimizes.
async function startOverlayDrag(e, size, onTap, anchor) {
  if (e.button !== 0) return
  e.preventDefault()
  const [w, h] = size
  const originX = e.screenX
  const originY = e.screenY
  const start = (await window.devcost?.overlayGetPosition?.()) || [0, 0]

  let raf = null
  let pending = null
  let moved = false
  const flush = () => {
    raf = null
    if (pending) window.devcost?.overlayMove?.(pending[0], pending[1], w, h, anchor)
  }
  const onMove = (ev) => {
    if (!moved &&
        Math.abs(ev.screenX - originX) + Math.abs(ev.screenY - originY) <= DRAG_THRESHOLD) return
    moved = true
    pending = [start[0] + (ev.screenX - originX), start[1] + (ev.screenY - originY)]
    if (raf === null) raf = requestAnimationFrame(flush)
  }
  const onUp = () => {
    if (raf !== null) cancelAnimationFrame(raf)
    if (moved && pending) window.devcost?.overlayMove?.(pending[0], pending[1], w, h, anchor)
    else if (!moved) onTap?.()
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
  }
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
}

function OverlayInner() {
  // phase: open → collapsing → minimized → expanding → open.
  // The window only shrinks to PILL once fully `minimized`, and grows back to
  // panel size the instant we start `expanding`, so the morph always has room.
  const [phase, setPhase] = useState('open')
  // Drives the enter side of the morph: set false for one frame after a phase
  // flip so CSS sees a transition into the new resting state.
  const [settled, setSettled] = useState(true)
  // Which corner the panel anchors to (decided by the main process from the
  // FAB's screen position) so it opens toward the interior and never overflows.
  // The ref mirrors it for use inside drag/collapse callbacks without staleness.
  const [anchor, setAnchor] = useState({ h: 'left', v: 'top' })
  const anchorRef = useRef(anchor)

  const { data: slots = [], refetch } = useQuery({
    queryKey: ['widget'],
    queryFn:  () => apiFetch('/api/widget'),
    refetchInterval: 30_000,
  })

  const filled = slots.filter(s => s.service_id)
  const panelW = WINDOW_W[Math.min(filled.length, 4)]

  useEffect(() => {
    const cleanup = window.devcost?.onWidgetUpdate?.(() => refetch())
    return () => cleanup?.()
  }, [refetch])

  // Size, position and anchor the panel. `animate` plays the open morph (FAB
  // tap); the silent variant just lays the panel out (initial mount).
  const expand = async (animate) => {
    const a = await window.devcost?.overlayExpand?.(panelW, WINDOW_H)
    if (a) { anchorRef.current = a; setAnchor(a) }
    if (animate) setPhase('expanding')
  }

  // Lay out the restored panel once on mount (the window opens in `open` phase).
  useEffect(() => { expand(false) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Slot count changed the panel width while it's open: re-fit, keeping the
  // anchored corner fixed. Skip the first render — the mount effect handles it.
  const didMount = useRef(false)
  useEffect(() => {
    if (!didMount.current) { didMount.current = true; return }
    if (phase === 'open') window.devcost?.overlayRefit?.(panelW, WINDOW_H, anchorRef.current)
  }, [panelW]) // eslint-disable-line react-hooks/exhaustive-deps

  // After a transient phase flip, flush a frame with `settled=false` (the
  // "from" state) then flip to true so the morph animates, and advance to the
  // resting phase when it finishes.
  useEffect(() => {
    if (phase !== 'collapsing' && phase !== 'expanding') return
    setSettled(false)
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => setSettled(true)))
    const done = setTimeout(() => {
      if (phase === 'collapsing') {
        // Morph is done; now shrink the window to the pill at the anchored
        // corner so the FAB lands exactly where it visually came to rest.
        window.devcost?.overlayCollapse?.(anchorRef.current)
        setPhase('minimized')
      } else {
        setPhase('open')
      }
    }, MORPH_MS)
    return () => { cancelAnimationFrame(raf); clearTimeout(done) }
  }, [phase])

  // Whether the panel (vs. the pill) is the visible/resting form for this frame.
  const panelOut =
    phase === 'open'       ? true
    : phase === 'collapsing' ? !settled   // start expanded, settle into pill
    : phase === 'expanding'  ? settled    // start as pill, settle into panel
    : false                               // minimized

  const morph = `transform ${MORPH_MS}ms ${MORPH_EASE}, opacity ${MORPH_MS}ms ease`

  // The FAB sits in the anchored corner and both forms morph from/into it, so the
  // panel grows away from the nearest screen edge.
  const morphOrigin = `${anchor.h === 'left' ? '0%' : '100%'} ${anchor.v === 'top' ? '0%' : '100%'}`
  const fabCorner = {
    top:    anchor.v === 'top'    ? 0 : undefined,
    bottom: anchor.v === 'bottom' ? 0 : undefined,
    left:   anchor.h === 'left'   ? 0 : undefined,
    right:  anchor.h === 'right'  ? 0 : undefined,
  }

  return (
    <div className="relative w-full h-full overflow-visible" style={{ WebkitAppRegion: 'no-drag' }}>
      {/* Dock-orb — pinned to the anchored corner the window collapses toward, so
          it lands exactly where the resized PILL window will sit. Emerald radial
          fill + breathing glow so it reads as a live status light, not a button. */}
      <button
        onPointerDown={(e) =>
          phase === 'minimized' &&
          startOverlayDrag(e, [PILL, PILL], () => expand(true), anchorRef.current)
        }
        title="Click to open · drag to move"
        className="absolute flex items-center justify-center rounded-full text-emerald-300 hover:scale-110 active:scale-95 select-none"
        style={{
          ...fabCorner,
          width: PILL, height: PILL,
          background:
            'radial-gradient(circle at 50% 36%, rgba(0, 255, 156, 0.22), rgba(5, 8, 5, 0.86) 72%)',
          backdropFilter: 'blur(12px)',
          border: '1px solid rgba(0, 255, 156, 0.22)',
          // Breathe only when the orb is the resting form; during the morph the
          // transform/opacity transition owns the look.
          animation: phase === 'minimized' ? 'devcost-fab-breathe 3.2s ease-in-out infinite' : undefined,
          boxShadow: CARD_SHADOW,
          transformOrigin: morphOrigin,
          transition: morph,
          transform: panelOut ? 'scale(0.35)' : 'scale(1)',
          opacity: panelOut ? 0 : 1,
          pointerEvents: panelOut ? 'none' : 'auto',
        }}
      >
        <Activity size={13} style={{ filter: 'drop-shadow(0 0 4px rgba(0, 255, 156, 0.6))' }} />
      </button>

      {/* Panel — grows out of / shrinks into that same corner. */}
      <div
        className="group absolute inset-0 p-1.5"
        style={{
          transformOrigin: morphOrigin,
          transition: morph,
          transform: panelOut ? 'scale(1)' : 'scale(0.15)',
          opacity: panelOut ? 1 : 0,
          pointerEvents: panelOut && phase === 'open' ? 'auto' : 'none',
        }}
      >
        <div
          className="w-full h-full rounded-xl flex flex-col px-2 pt-1 pb-1.5"
          style={{
            background: CARD_BG,
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(0, 255, 156, 0.14)',
            boxShadow: CARD_SHADOW,
          }}
        >
          {/* Header bar: click anywhere to minimize, drag to move the window.
              A press that stays within DRAG_THRESHOLD taps → collapse; past it
              the same press drags. The grip + minimize glyph are hints only. */}
          <div
            onPointerDown={(e) =>
              startOverlayDrag(e, [panelW, WINDOW_H], () => phase === 'open' && setPhase('collapsing'), anchorRef.current)
            }
            title="Click to minimize · drag to move"
            className="relative flex justify-center items-center h-4 mb-0.5 cursor-pointer active:cursor-grabbing group/grip select-none"
          >
            <div className="w-7 h-0.5 rounded-full bg-emerald-400/25 group-hover/grip:bg-emerald-400/50 transition-colors pointer-events-none" />
            <Minimize2
              size={10}
              className="absolute right-0 top-1/2 -translate-y-1/2 text-emerald-400/35 group-hover/grip:text-emerald-300 transition-colors pointer-events-none"
            />
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
