type MotionElements = {
  card: HTMLElement
  toolbar: HTMLElement
}

function reducedMdfMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** Animate actual dimensions; all following document flow follows naturally. */
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
