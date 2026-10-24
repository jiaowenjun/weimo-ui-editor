/** Restore exactly the styles owned by this lock, including on unmount. */
export function lockMdfPage() {
  const body = document.body
  const scrollX = window.scrollX
  const scrollY = window.scrollY
  const previous = {
    position: body.style.position, top: body.style.top,
    left: body.style.left, width: body.style.width,
  }
  Object.assign(body.style, {
    position: 'fixed', top: `${-scrollY}px`, left: `${-scrollX}px`, width: '100%',
  })
  let locked = true
  return () => {
    if (!locked) return
    locked = false
    Object.assign(body.style, previous)
    window.scrollTo({ left: scrollX, top: scrollY, behavior: 'instant' })
  }
}

export function watchMdfViewport(dialog: HTMLElement) {
  const viewport = window.visualViewport
  const update = () => {
    dialog.style.setProperty('--new-mdf-viewport-height', `${viewport?.height ?? window.innerHeight}px`)
    dialog.style.setProperty('--new-mdf-viewport-top', `${viewport?.offsetTop ?? 0}px`)
  }
  update()
  viewport?.addEventListener('resize', update)
  viewport?.addEventListener('scroll', update)
  window.addEventListener('resize', update)
  return () => {
    viewport?.removeEventListener('resize', update)
    viewport?.removeEventListener('scroll', update)
    window.removeEventListener('resize', update)
    dialog.style.removeProperty('--new-mdf-viewport-height')
    dialog.style.removeProperty('--new-mdf-viewport-top')
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
