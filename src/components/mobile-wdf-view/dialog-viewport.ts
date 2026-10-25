import {
  applyRect,
  getDialogRect,
  getMorphDuration,
  MOBILE_VIEWPORT_QUERY,
  MORPH_PAD,
  type CardPhase,
} from './card-shell.js'

/** Shared by WdfView and NewMdfView. No input focus or page scrolling. */
export function watchDialogViewport(
  shell: HTMLElement,
  phase: () => CardPhase,
  isCurrent: () => boolean,
  animatingClass: string,
) {
  const viewport = window.visualViewport
  let resizeTimer: number | null = null
  let disposed = false
  const active = () => !disposed && isCurrent() && (phase() === 'opening' || phase() === 'edit')

  const resize = () => {
    if (!active()) return
    if (phase() === 'opening') {
      // Keep the established card-opening choreography and endpoint calculation.
      applyRect(shell, getDialogRect())
      return
    }

    shell.classList.add(animatingClass)
    applyRect(shell, getDialogRect())
    // Only the last resize may release the height transition, never an earlier keyboard frame.
    if (resizeTimer !== null) window.clearTimeout(resizeTimer)
    resizeTimer = window.setTimeout(() => {
      resizeTimer = null
      if (active() && phase() === 'edit') shell.classList.remove(animatingClass)
    }, getMorphDuration() + MORPH_PAD)
  }

  const scroll = () => {
    if (!active() || phase() !== 'edit' || !window.matchMedia(MOBILE_VIEWPORT_QUERY).matches) return
    const rect = getDialogRect()
    // Safari can pan the visual viewport without another resize (especially on a
    // scrolled, long page). top - offsetTop must remain DIALOG_MARGIN every frame.
    // CSS excludes top/left from edit-phase transitions: compensating this offset
    // must not trail the browser's own keyboard movement by another 320ms.
    shell.style.top = `${rect.top}px`
    shell.style.left = `${rect.left}px`
  }

  viewport?.addEventListener('resize', resize)
  viewport?.addEventListener('scroll', scroll)
  window.addEventListener('resize', resize)
  return () => {
    disposed = true
    viewport?.removeEventListener('resize', resize)
    viewport?.removeEventListener('scroll', scroll)
    window.removeEventListener('resize', resize)
    if (resizeTimer !== null) window.clearTimeout(resizeTimer)
    // Do not remove the animation class here: the closing morph may already own it.
  }
}
