import { useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { useQuery } from '@tanstack/react-query'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Minimize2 } from 'lucide-react'
import { apiFetch } from './api'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
})

// Window width per filled-slot count (includes the 6px transparent shadow gutter
// on each side; interior matches the pre-gutter card sizes).
const WINDOW_W = [172, 204, 308, 396, 472]
const WINDOW_H = 84
// Collapsed (minimized) window — a small dock-dot the overlay tucks into.
// The window (PILL) is larger than the visible orb (ORB) so the GUTTER of
// transparent pixels around it gives the full circle + an OUTER glow room to
// render without being clipped to the square window rectangle.
const ORB = 36
const GUTTER = 6
const PILL = ORB + GUTTER * 2 // 48

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
      onClick={() => window.levee?.openDashboard(slot.service_id)}
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

// Pointer travel (px) below which a header press counts as a click, not a drag.
const DRAG_THRESHOLD = 4

// Drive a phase flip through a same-document View Transition so the browser
// morphs the panel into the dock-orb (they share `view-transition-name: dock`),
// making the panel look like it folds inside the FAB. `flushSync` forces React to
// commit the new DOM before the browser captures the "new" snapshot. Degrades to
// an instant swap when the API is unavailable or the user prefers reduced motion.
// Easing/duration of the morph live in index.css (::view-transition-group(dock)).
function morphPhase(update) {
  if (!document.startViewTransition ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    update()
    return Promise.resolve()
  }
  return document.startViewTransition(() => flushSync(update)).finished
}

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
  const start = (await window.levee?.overlayGetPosition?.()) || [0, 0]

  let raf = null
  let pending = null
  let moved = false
  const flush = () => {
    raf = null
    if (pending) window.levee?.overlayMove?.(pending[0], pending[1], w, h, anchor)
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
    if (moved && pending) window.levee?.overlayMove?.(pending[0], pending[1], w, h, anchor)
    else if (!moved) onTap?.()
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
  }
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
}

function OverlayInner() {
  // phase: 'open' (panel) ⇄ 'minimized' (dock-orb). The browser's View Transition
  // owns the morph between them; the window only shrinks to PILL once minimized,
  // and grows back to panel size before expanding, so the morph always has room.
  const [phase, setPhase] = useState('open')
  // Which corner the panel anchors to (decided by the main process from the
  // FAB's screen position) so it opens toward the interior and never overflows.
  // The ref mirrors it for use inside drag/collapse callbacks without staleness.
  const [anchor, setAnchor] = useState({ h: 'left', v: 'top' })
  const anchorRef = useRef(anchor)
  // Whether the FAB is shown. Settings' enable/disable toggles drive an
  // `overlay-visibility` IPC event; we scale+fade the whole overlay from/into the
  // anchored corner so it materialises rather than popping. The main process delays
  // hiding the window until the exit animation has had time to play.
  const [visible, setVisible] = useState(true)

  const { data: slots = [], refetch } = useQuery({
    queryKey: ['widget'],
    queryFn:  () => apiFetch('/api/widget'),
    refetchInterval: 30_000,
  })

  const filled = slots.filter(s => s.service_id)
  const panelW = WINDOW_W[Math.min(filled.length, 4)]

  useEffect(() => {
    const cleanup = window.levee?.onWidgetUpdate?.(() => refetch())
    return () => cleanup?.()
  }, [refetch])

  // Enable → scale/fade in from the corner; disable → scale/fade out. The window is
  // already shown before an `enter` arrives, so RAF runs and the in-animation plays.
  useEffect(() => {
    const cleanup = window.levee?.onOverlayVisibility?.((show) => {
      if (show) {
        setVisible(false)
        requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)))
      } else {
        setVisible(false)
      }
    })
    return () => cleanup?.()
  }, [])

  // Size, position and anchor the panel. `animate` plays the open morph (FAB
  // tap); the silent variant just lays the panel out (initial mount).
  // Point the panel's scale-into-corner morph at the anchored corner (where the
  // FAB sits), so it folds toward the orb rather than the window centre.
  const setVtOrigin = (a) => {
    document.documentElement.style.setProperty(
      '--vt-origin',
      `${a.h === 'left' ? '0%' : '100%'} ${a.v === 'top' ? '0%' : '100%'}`,
    )
  }

  const expand = async (animate) => {
    const a = await window.levee?.overlayExpand?.(panelW, WINDOW_H)
    if (a) { anchorRef.current = a; setAnchor(a) }
    if (animate) { setVtOrigin(anchorRef.current); morphPhase(() => setPhase('open')) }
  }

  // Fold the panel into the dock-orb, then shrink the window to the PILL at the
  // anchored corner so the FAB lands exactly where it visually came to rest.
  const collapse = async () => {
    if (phase !== 'open') return
    setVtOrigin(anchorRef.current)
    await morphPhase(() => setPhase('minimized'))
    window.levee?.overlayCollapse?.(anchorRef.current)
  }

  // Lay out the restored panel once on mount (the window opens in `open` phase).
  useEffect(() => { expand(false) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Slot count changed the panel width while it's open: re-fit, keeping the
  // anchored corner fixed. Skip the first render — the mount effect handles it.
  const didMount = useRef(false)
  useEffect(() => {
    if (!didMount.current) { didMount.current = true; return }
    if (phase === 'open') window.levee?.overlayRefit?.(panelW, WINDOW_H, anchorRef.current)
  }, [panelW]) // eslint-disable-line react-hooks/exhaustive-deps

  // Inset the orb by GUTTER from the anchored corner so it sits centred in the
  // collapsed PILL window (PILL = ORB + 2·GUTTER), leaving the transparent gutter
  // around it for the glow. During the morph the window is panel-sized, so this
  // still reads as the orb emerging from / collapsing into the corner.
  const fabCorner = {
    top:    anchor.v === 'top'    ? GUTTER : undefined,
    bottom: anchor.v === 'bottom' ? GUTTER : undefined,
    left:   anchor.h === 'left'   ? GUTTER : undefined,
    right:  anchor.h === 'right'  ? GUTTER : undefined,
  }

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const showOrigin = `${anchor.h === 'left' ? '0%' : '100%'} ${anchor.v === 'top' ? '0%' : '100%'}`

  return (
    <div
      className="relative w-full h-full overflow-visible"
      style={{
        WebkitAppRegion: 'no-drag',
        transformOrigin: showOrigin,
        transition: reduceMotion ? 'none' : 'transform 300ms cubic-bezier(0.34, 1.4, 0.5, 1), opacity 220ms ease',
        transform: visible ? 'scale(1)' : 'scale(0.4)',
        opacity: visible ? 1 : 0,
      }}
    >
      {/* Dock-orb — pinned to the anchored corner the window collapses toward, so
          it lands exactly where the resized PILL window will sit. Emerald radial
          fill + breathing glow so it reads as a live status light, not a button. */}
      <button
        onPointerDown={(e) =>
          phase === 'minimized' &&
          startOverlayDrag(e, [PILL, PILL], () => expand(true), anchorRef.current)
        }
        title="Click to open · drag to move"
        className="absolute flex items-center justify-center select-none"
        style={{
          ...fabCorner,
          width: ORB, height: ORB,
          viewTransitionName: phase === 'minimized' ? 'ov-fab' : 'none',
          display: phase === 'minimized' ? 'flex' : 'none',
        }}
      >
        <img src="/levee-overlay.png" alt="" className="object-contain transition-transform hover:scale-110 active:scale-95" style={{ width: ORB - 6, height: ORB - 6 }} />
      </button>

      {/* Panel — scales uniformly into / out of the anchored corner (where the FAB
          sits) via its own `ov-panel` morph, so it reads as folding inside the FAB. */}
      <div
        className="group absolute inset-0 p-1.5"
        style={{
          viewTransitionName: phase === 'open' ? 'ov-panel' : 'none',
          display: phase === 'open' ? undefined : 'none',
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
              startOverlayDrag(e, [panelW, WINDOW_H], collapse, anchorRef.current)
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
