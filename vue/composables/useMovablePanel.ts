import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue'

/**
 * Drag-to-move for an overlay panel (TERC-65) — no library, ~60 lines.
 *
 * Pointer drag on a handle, arrow keys when the handle has focus (10px,
 * 50px with Shift), Home puts it back in its default corner. The position
 * is remembered in the browser under `storageKey` and clamped into the
 * viewport on load and resize so a panel can never be parked off-screen.
 * Position is null while the panel sits in its CSS default corner.
 */
export interface PanelPosition {
  left: number
  top: number
}

const STEP = 10
const BIG_STEP = 50

export function useMovablePanel(panel: Ref<HTMLElement | null>, storageKey: string) {
  const position = ref<PanelPosition | null>(null)

  function read(): PanelPosition | null {
    try {
      const raw = localStorage.getItem(storageKey)
      if (!raw) return null
      const p = JSON.parse(raw) as Partial<PanelPosition>
      return typeof p.left === 'number' && typeof p.top === 'number' ? { left: p.left, top: p.top } : null
    } catch {
      return null
    }
  }
  function write(p: PanelPosition | null): void {
    try {
      p ? localStorage.setItem(storageKey, JSON.stringify(p)) : localStorage.removeItem(storageKey)
    } catch {
      /* private mode etc. — position just won't persist */
    }
  }

  /** Keep at least a grab-able strip of the panel inside the viewport. */
  function clamp(p: PanelPosition): PanelPosition {
    const el = panel.value
    const w = el?.offsetWidth ?? 0
    const h = el?.offsetHeight ?? 0
    const maxLeft = Math.max(0, window.innerWidth - Math.min(w, 120))
    const maxTop = Math.max(0, window.innerHeight - Math.min(h, 40))
    return { left: Math.min(Math.max(0, p.left), maxLeft), top: Math.min(Math.max(0, p.top), maxTop) }
  }

  function moveTo(p: PanelPosition): void {
    position.value = clamp(p)
    write(position.value)
  }

  /** Where the panel is now, even while still in its CSS default corner. */
  function current(): PanelPosition {
    if (position.value) return position.value
    const r = panel.value?.getBoundingClientRect()
    return { left: r?.left ?? 0, top: r?.top ?? 0 }
  }

  function reset(): void {
    position.value = null
    write(null)
  }

  // --- pointer drag -------------------------------------------------------
  let drag: { startX: number; startY: number; origin: PanelPosition } | null = null
  function onPointerDown(e: PointerEvent): void {
    if (e.button !== 0) return
    drag = { startX: e.clientX, startY: e.clientY, origin: current() }
    ;(e.currentTarget as HTMLElement | null)?.setPointerCapture?.(e.pointerId)
    e.preventDefault()
  }
  function onPointerMove(e: PointerEvent): void {
    if (!drag) return
    moveTo({ left: drag.origin.left + (e.clientX - drag.startX), top: drag.origin.top + (e.clientY - drag.startY) })
  }
  function onPointerUp(): void {
    drag = null
  }

  // --- keyboard -----------------------------------------------------------
  function onKeyDown(e: KeyboardEvent): void {
    const step = e.shiftKey ? BIG_STEP : STEP
    const p = current()
    const moves: Record<string, PanelPosition> = {
      ArrowLeft: { left: p.left - step, top: p.top },
      ArrowRight: { left: p.left + step, top: p.top },
      ArrowUp: { left: p.left, top: p.top - step },
      ArrowDown: { left: p.left, top: p.top + step },
    }
    if (e.key === 'Home') {
      reset()
      e.preventDefault()
    } else if (moves[e.key]) {
      moveTo(moves[e.key])
      e.preventDefault()
    }
  }

  function onResize(): void {
    if (position.value) position.value = clamp(position.value)
  }

  onMounted(() => {
    const saved = read()
    if (saved) position.value = clamp(saved)
    window.addEventListener('resize', onResize)
  })
  onBeforeUnmount(() => window.removeEventListener('resize', onResize))

  return { position, reset, handle: { onPointerDown, onPointerMove, onPointerUp, onKeyDown } }
}
