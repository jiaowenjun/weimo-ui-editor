export type OptionGridColumnCount = 1 | 2 | 4

export type OptionGridColumnInput = {
  availableWidth: number
  columnGap: number
  maxColumns: 2 | 4
  optionWidths: number[]
}

export type OptionGridMeasurementOptions = {
  maxColumns?: 2 | 4
  measurementHost?: HTMLElement | null
}

const OPTION_GRID_BLOCK_CONTENT_SELECTOR =
  'br, ul, ol, pre, table, figure, img, .katex-display, [data-type="block-math"]'
const OPTION_GRID_INLINE_SAFETY_PX = 1

export function hasOptionGridBlockContent(
  item: Pick<HTMLLIElement, 'querySelectorAll'>,
) {
  return Array.from(
    item.querySelectorAll<HTMLElement>(OPTION_GRID_BLOCK_CONTENT_SELECTOR),
  ).some((element) => {
    if (
      element.tagName === 'BR' &&
      element.classList.contains('ProseMirror-trailingBreak')
    ) {
      return false
    }

    if (
      element.tagName === 'IMG' &&
      element.classList.contains('ProseMirror-separator')
    ) {
      return false
    }

    return true
  })
}

export function resolveOptionGridColumns({
  availableWidth,
  columnGap,
  maxColumns,
  optionWidths,
}: OptionGridColumnInput): OptionGridColumnCount {
  if (availableWidth <= 0 || optionWidths.length !== 4) return 1

  const candidates: readonly OptionGridColumnCount[] =
    maxColumns === 4 ? [4, 2, 1] : [2, 1]

  for (const columns of candidates) {
    const trackWidth = (availableWidth - columnGap * (columns - 1)) / columns
    const fits =
      trackWidth > 0 &&
      optionWidths.every(
        (width) =>
          Number.isFinite(width) &&
          width >= 0 &&
          width + OPTION_GRID_INLINE_SAFETY_PX <= trackWidth,
      )

    if (fits) return columns
  }

  return 1
}

function cssPixelValue(value: string): number {
  const parsed = Number.parseFloat(value)

  return Number.isFinite(parsed) ? parsed : 0
}

export function measureOptionGridColumns(
  list: HTMLOListElement,
  options: OptionGridMeasurementOptions = {},
): OptionGridColumnCount {
  const items = Array.from(list.children).filter(
    (child): child is HTMLLIElement => child.tagName === 'LI',
  )

  if (
    items.length !== 4 ||
    items.some((item) => hasOptionGridBlockContent(item))
  ) {
    return 1
  }

  const ownerDocument = list.ownerDocument
  const ownerWindow = ownerDocument.defaultView
  const markdownRoot = list.closest<HTMLElement>('.weimo-markdown-content')

  if (!ownerWindow || !markdownRoot) return 1

  const measurementHost = options.measurementHost ?? markdownRoot
  const measurementRoot = ownerDocument.createElement('div')
  measurementRoot.setAttribute('aria-hidden', 'true')
  measurementRoot.contentEditable = 'false'
  measurementRoot.style.position = 'fixed'
  measurementRoot.style.insetInlineStart = '-100000px'
  measurementRoot.style.top = '0'
  measurementRoot.style.width = 'max-content'
  measurementRoot.style.maxWidth = 'none'
  measurementRoot.style.visibility = 'hidden'
  measurementRoot.style.pointerEvents = 'none'

  if (measurementHost !== markdownRoot) {
    measurementRoot.className = markdownRoot.className
  }

  measurementHost.append(measurementRoot)

  let optionWidths: number[]

  try {
    optionWidths = items.map((item) => {
      const clone = item.cloneNode(true) as HTMLLIElement
      clone.style.display = 'block'
      clone.style.width = 'max-content'
      clone.style.maxWidth = 'none'
      clone.style.margin = '0'
      clone.style.padding = '0'
      clone.style.listStyle = 'none'
      clone.style.whiteSpace = 'nowrap'
      measurementRoot.append(clone)

      const width = clone.getBoundingClientRect().width
      clone.remove()
      return width
    })
  } finally {
    measurementRoot.remove()
  }

  const style = ownerWindow.getComputedStyle(list)
  const availableWidth =
    list.clientWidth -
    cssPixelValue(style.paddingLeft) -
    cssPixelValue(style.paddingRight)

  return resolveOptionGridColumns({
    availableWidth,
    columnGap: cssPixelValue(style.columnGap),
    maxColumns: options.maxColumns ?? 4,
    optionWidths,
  })
}
