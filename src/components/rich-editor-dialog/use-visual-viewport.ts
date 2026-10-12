import { useEffect, useState } from 'react'

export type VisualViewportRect = Readonly<{
  height: number
  offsetTop: number
}>

/**
 * Tracks the visual viewport so the dialog can stay above the mobile soft
 * keyboard. Returns `null` when the API is unavailable; CSS variables fall
 * back to `100dvh`-based sizing in that case.
 */
export function useVisualViewportRect(active: boolean) {
  const [rect, setRect] = useState<VisualViewportRect | null>(null)

  useEffect(() => {
    if (!active) return

    const viewport = window.visualViewport

    if (!viewport) return

    let frame = 0

    const scheduleUpdate = () => {
      cancelAnimationFrame(frame)

      frame = requestAnimationFrame(() => {
        setRect({ height: viewport.height, offsetTop: viewport.offsetTop })
      })
    }

    scheduleUpdate()
    viewport.addEventListener('resize', scheduleUpdate)
    viewport.addEventListener('scroll', scheduleUpdate)

    return () => {
      cancelAnimationFrame(frame)
      viewport.removeEventListener('resize', scheduleUpdate)
      viewport.removeEventListener('scroll', scheduleUpdate)
    }
  }, [active])

  return rect
}
