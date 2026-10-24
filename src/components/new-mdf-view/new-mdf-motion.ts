export type NewMdfMotion = 'flow' | 'snapshot'

type TransitionHandle = {
  finished: Promise<unknown>
  skipTransition: () => void
}

type SnapshotDocument = Document & {
  startViewTransition?: (update: () => void) => TransitionHandle
}

type MotionElements = {
  card: HTMLElement
  toolbar: HTMLElement
}

export function reducedMdfMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** A: animate actual dimensions; all following document flow follows naturally. */
export function flowMdfTransition(
  { card, toolbar }: MotionElements,
  update: () => void,
  closing: boolean,
): { finished: Promise<unknown>; cancel: () => void } {
  const first = card.getBoundingClientRect().height
  const toolbarFirst = toolbar.getBoundingClientRect().height
  update()
  const last = card.getBoundingClientRect().height
  const toolbarLast = toolbar.getBoundingClientRect().height
  if (reducedMdfMotion() || typeof card.animate !== 'function') {
    return { finished: Promise.resolve(), cancel() {} }
  }
  const options = { duration: 200, delay: closing ? 60 : 0, easing: 'ease', fill: 'backwards' as const }
  const animations = [
    card.animate([{ height: `${first}px` }, { height: `${last}px` }], options),
    toolbar.animate([{ height: `${toolbarFirst}px` }, { height: `${toolbarLast}px` }], options),
  ]
  // The toolbar remains mounted throughout. Its final zero height clips its controls.
  if (closing) {
    animations.push(toolbar.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: 60, fill: 'forwards',
    }))
  }
  return {
    finished: Promise.all(animations.map((animation) => animation.finished.catch(() => undefined)))
      .finally(() => animations.forEach((animation) => animation.cancel())),
    cancel: () => animations.forEach((animation) => animation.cancel()),
  }
}

let currentSnapshot: TransitionHandle | undefined

/** B: one layout commit; the browser animates named pictures of the two endpoints. */
export function snapshotMdfTransition(
  elements: MotionElements,
  update: () => void,
  closing: boolean,
  useSnapshots: boolean,
): { finished: Promise<unknown>; cancel: () => void } {
  const document = elements.card.ownerDocument as SnapshotDocument
  if (!useSnapshots || !document.startViewTransition || reducedMdfMotion()) {
    return flowMdfTransition(elements, update, closing)
  }
  // The platform allows one transition per document. Finish a previous capture first.
  currentSnapshot?.skipTransition()
  let transition: TransitionHandle
  try {
    transition = document.startViewTransition(update)
  } catch {
    return flowMdfTransition(elements, update, closing)
  }
  currentSnapshot = transition
  return {
    finished: transition.finished.catch(() => undefined).finally(() => {
      if (currentSnapshot === transition) currentSnapshot = undefined
    }),
    cancel: () => transition.skipTransition(),
  }
}

/** Native dialog retains the same editor and selection while changing modality. */
export async function morphMdfDialog(
  dialog: HTMLDialogElement,
  origin: DOMRect,
  opening: boolean,
  register: (cancel: () => void) => void,
  exiting?: { from: DOMRect; toolbar: HTMLElement; toolbarHeight: number },
) {
  if (reducedMdfMotion() || typeof dialog.animate !== 'function') return
  const destination = exiting?.from ?? dialog.getBoundingClientRect()
  const geometry = (rect: DOMRect): Keyframe => ({
    top: `${rect.top}px`, left: `${rect.left}px`, width: `${rect.width}px`,
    height: `${rect.height}px`, maxHeight: 'none', translate: 'none',
  })
  try {
    const frames = [geometry(origin), geometry(destination)]
    const animation = dialog.animate(opening ? frames : frames.reverse(), {
      duration: 240, easing: 'ease', fill: 'none',
    })
    const animations = [animation]
    if (exiting) animations.push(exiting.toolbar.animate([
      { height: `${exiting.toolbarHeight}px`, opacity: 1, offset: 0 },
      { height: `${exiting.toolbarHeight}px`, opacity: 0, offset: 0.25 },
      { height: '0px', opacity: 0, offset: 1 },
    ], { duration: 240, easing: 'ease', fill: 'none' }))
    register(() => animations.forEach((item) => item.cancel()))
    await Promise.all(animations.map((item) => item.finished.catch(() => undefined)))
  } catch {
    // Unsupported animation must still leave a usable native dialog.
  }
}
