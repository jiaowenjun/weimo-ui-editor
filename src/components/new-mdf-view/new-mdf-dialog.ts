/** Restore exactly the styles owned by this lock, including on unmount. */
export function lockMdfPage() {
  const body = document.body
  const scrollX = window.scrollX
  const scrollY = window.scrollY
  const previous = {
    overflow: body.style.overflow, paddingRight: body.style.paddingRight,
  }
  // Keep the document in its original coordinate space during Safari keyboard panning.
  const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth
  const paddingRight = window.getComputedStyle(body).paddingRight
  body.style.overflow = 'hidden'
  if (scrollbarWidth > 0) body.style.paddingRight = `calc(${paddingRight} + ${scrollbarWidth}px)`
  let locked = true
  return () => {
    if (!locked) return
    locked = false
    Object.assign(body.style, previous)
    if (window.scrollX !== scrollX || window.scrollY !== scrollY) {
      window.scrollTo({ left: scrollX, top: scrollY, behavior: 'instant' })
    }
  }
}

/** Give native showModal an explicit non-editable focus target before it opens. */
export function showMdfDialog(dialog: HTMLDialogElement, heading: HTMLElement) {
  const autofocus = heading.autofocus
  heading.autofocus = true
  try { dialog.showModal() } finally { heading.autofocus = autofocus }
}

export function watchMdfViewport(dialog: HTMLElement, beforeChange: () => void) {
  const viewport = window.visualViewport
  const properties = ['height', 'top', 'width', 'left'] as const
  let previous: number[] = []
  let frame: number | null = null
  const update = () => {
    frame = null
    const values = [
      viewport?.height ?? window.innerHeight, viewport?.offsetTop ?? 0,
      viewport?.width ?? window.innerWidth, viewport?.offsetLeft ?? 0,
    ]
    if (values.every((value, index) => value === previous[index])) return
    // A running morph has a captured endpoint. Release it before applying live geometry.
    if (previous.length) beforeChange()
    properties.forEach((property, index) => {
      dialog.style.setProperty(`--new-mdf-viewport-${property}`, `${values[index]}px`)
    })
    previous = values
  }
  const schedule = () => {
    if (frame === null) frame = window.requestAnimationFrame(update)
  }
  update()
  // Like WdfView, resize owns keyboard geometry; scroll must not recenter the focused editor.
  viewport?.addEventListener('resize', schedule)
  window.addEventListener('resize', schedule)
  return () => {
    viewport?.removeEventListener('resize', schedule)
    window.removeEventListener('resize', schedule)
    if (frame !== null) window.cancelAnimationFrame(frame)
    properties.forEach((property) => dialog.style.removeProperty(`--new-mdf-viewport-${property}`))
  }
}

/** Keyboard recovery is bounded; rotation must not leave a closing panel stuck. */
export async function waitMdfKeyboard(originalHeight: number, alive: () => boolean) {
  const viewport = window.visualViewport
  if (!viewport || viewport.height >= originalHeight - 40) return
  const start = performance.now()
  let lastHeight = viewport.height
  let stableSince = start
  while (alive() && performance.now() - start < 800) {
    await new Promise<void>((resolve) => window.setTimeout(resolve, 32))
    if (viewport.height >= originalHeight - 40) return
    if (Math.abs(viewport.height - lastHeight) > 1) stableSince = performance.now()
    lastHeight = viewport.height
    if (performance.now() - stableSince > 160 && performance.now() - start > 200) return
  }
}
