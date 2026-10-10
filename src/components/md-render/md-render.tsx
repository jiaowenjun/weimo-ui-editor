import {
  forwardRef,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type CSSProperties,
  type MouseEvent,
} from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import rehypeKatex from 'rehype-katex'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize from 'rehype-sanitize'
import remarkBreaks from 'remark-breaks'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import type { PluggableList } from 'unified'

import { cn } from 'weimo-ui-core/lib/utils'
import {
  normalizeCenteredQuoteSyntax,
  WEIMO_CENTERED_QUOTE_MARKER,
} from '../markdown/centered-quote'
import {
  getCachedMarkdownImageWidth,
  setMarkdownImageHalfIntrinsicWidth,
} from '../markdown/image-size'
import type {
  MarkdownImageRenderer,
  MarkdownImageRenderProps,
  MarkdownImageSrcResolver,
} from '../markdown/image-renderer'
import { measureOptionGridColumns } from '../markdown/option-grid'
import { markdownSanitizeSchema } from '../markdown/sanitize'
import {
  PAREN_DECIMAL_MARKER_STYLE,
  PAREN_UPPER_ROMAN_MARKER_STYLE,
  parseParenthesizedListMarker,
  type ParenthesizedListMarker,
  type ParenthesizedListMarkerStyle,
} from '../markdown/parenthesized-list'

import 'weimo-ui-markdown/styles/markdown-content.css'

const SAFE_MARKDOWN_HREF_RE = /^(https?:|mailto:)/i
const TYPED_ORDERED_LIST_MARKER_RE = /^([ivxlcdmIVXLCDM]+|[A-Za-z]{1,2})\.\s+/
const ORDERED_LIST_MARKER_TYPES = new Set(['1', 'a', 'A', 'i', 'I'])
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect
const markdownRemarkRehypeOptions = {
  handlers: {
    break(state, node) {
      const result = {
        type: 'element' as const,
        tagName: 'br',
        properties: {},
        children: [],
      }

      state.patch(node, result)
      return state.applyData(node, result)
    },
  },
} satisfies NonNullable<Parameters<typeof ReactMarkdown>[0]['remarkRehypeOptions']>
const ROMAN_NUMERALS = [
  [1000, 'M'],
  [900, 'CM'],
  [500, 'D'],
  [400, 'CD'],
  [100, 'C'],
  [90, 'XC'],
  [50, 'L'],
  [40, 'XL'],
  [10, 'X'],
  [9, 'IX'],
  [5, 'V'],
  [4, 'IV'],
  [1, 'I'],
] as const

type MarkdownAstNode = {
  children?: MarkdownAstNode[]
  data?: {
    hName?: string
    hProperties?: Record<string, unknown>
  }
  ordered?: boolean
  spread?: boolean
  start?: number
  type?: string
  value?: string
}

type TypedOrderedListMarkerType = 'A' | 'a' | 'I' | 'i'
type OrderedListMarkerType = NonNullable<ComponentPropsWithoutRef<'ol'>['type']>
type TableCellAlign = ComponentPropsWithoutRef<'td'>['align']
type MarkdownOrderedListProps = ComponentPropsWithoutRef<'ol'> & {
  node?: {
    properties?: Record<string, unknown>
  }
}

type TypedOrderedListLine = {
  children: MarkdownAstNode[]
  marker: string
}

type ParenthesizedOrderedListLine = {
  children: MarkdownAstNode[]
  marker: ParenthesizedListMarker
}

function sanitizeMarkdownHref(href?: string): string | undefined {
  if (!href) return undefined

  const trimmed = href.trim()

  return SAFE_MARKDOWN_HREF_RE.test(trimmed) ? trimmed : undefined
}

function tableCellStyle(align: TableCellAlign): CSSProperties | undefined {
  return align ? { textAlign: align as CSSProperties['textAlign'] } : undefined
}

function alphaMarkerStart(marker: string): number {
  return [...marker.toLowerCase()].reduce(
    (start, char) => start * 26 + char.charCodeAt(0) - 96,
    0,
  )
}

function alphaMarkerAt(start: number, uppercase: boolean): string {
  let remaining = start
  let marker = ''

  while (remaining > 0) {
    remaining -= 1
    marker = `${String.fromCharCode(97 + (remaining % 26))}${marker}`
    remaining = Math.floor(remaining / 26)
  }

  return uppercase ? marker.toUpperCase() : marker
}

function romanMarkerAt(start: number, uppercase: boolean): string {
  let remaining = start
  let marker = ''

  for (const [value, numeral] of ROMAN_NUMERALS) {
    while (remaining >= value) {
      marker += numeral
      remaining -= value
    }
  }

  return uppercase ? marker : marker.toLowerCase()
}

function romanMarkerStart(marker: string): number | null {
  const uppercaseMarker = marker.toUpperCase()
  let remaining = uppercaseMarker
  let start = 0

  for (const [value, numeral] of ROMAN_NUMERALS) {
    while (remaining.startsWith(numeral)) {
      start += value
      remaining = remaining.slice(numeral.length)
    }
  }

  if (
    remaining.length > 0 ||
    (marker !== uppercaseMarker && marker !== marker.toLowerCase()) ||
    romanMarkerAt(start, marker === uppercaseMarker) !== marker
  ) {
    return null
  }

  return start
}

function resolveTypedMarker(marker: string): {
  markerType: TypedOrderedListMarkerType
  start: number
} | null {
  const romanStart = romanMarkerStart(marker)

  if (romanStart !== null) {
    return {
      markerType: marker === marker.toUpperCase() ? 'I' : 'i',
      start: romanStart,
    }
  }

  if (/^[A-Z]{1,2}$/.test(marker)) {
    return { markerType: 'A', start: alphaMarkerStart(marker) }
  }

  if (/^[a-z]{1,2}$/.test(marker)) {
    return { markerType: 'a', start: alphaMarkerStart(marker) }
  }

  return null
}

function markerAt(markerType: TypedOrderedListMarkerType, start: number): string {
  if (markerType === 'I' || markerType === 'i') {
    return romanMarkerAt(start, markerType === 'I')
  }

  return alphaMarkerAt(start, markerType === 'A')
}

function hasRenderableMarkdownContent(children: MarkdownAstNode[]): boolean {
  return children.some((child) => {
    if (child.type !== 'text') return true

    return typeof child.value === 'string' && child.value.trim().length > 0
  })
}

function splitParagraphChildrenIntoLines(
  paragraph: MarkdownAstNode,
): MarkdownAstNode[][] {
  const lines: MarkdownAstNode[][] = [[]]

  for (const child of paragraph.children ?? []) {
    if (child.type === 'break') {
      lines.push([])
      continue
    }

    if (child.type === 'text' && typeof child.value === 'string') {
      const parts = child.value.split('\n')

      parts.forEach((part, index) => {
        if (index > 0) {
          lines.push([])
        }

        if (part.length > 0) {
          lines[lines.length - 1]?.push({ ...child, value: part })
        }
      })

      continue
    }

    lines[lines.length - 1]?.push(child)
  }

  return lines
}

function parseTypedOrderedListLine(
  line: MarkdownAstNode[],
): TypedOrderedListLine | null {
  const firstChild = line[0]

  if (firstChild?.type !== 'text' || typeof firstChild.value !== 'string') {
    return null
  }

  const markerMatch = firstChild.value.match(TYPED_ORDERED_LIST_MARKER_RE)

  if (!markerMatch) return null

  const marker = markerMatch[1]

  const firstValue = firstChild.value.slice(markerMatch[0].length)
  const children = firstValue
    ? [{ ...firstChild, value: firstValue }, ...line.slice(1)]
    : line.slice(1)

  if (!hasRenderableMarkdownContent(children)) return null

  return {
    children,
    marker,
  }
}

function parseParenthesizedOrderedListLine(
  line: MarkdownAstNode[],
): ParenthesizedOrderedListLine | null {
  const firstChild = line[0]

  if (firstChild?.type !== 'text' || typeof firstChild.value !== 'string') {
    return null
  }

  const marker = parseParenthesizedListMarker(firstChild.value)

  if (!marker) return null

  const firstValue = firstChild.value.slice(marker.consumed)
  const children = firstValue
    ? [{ ...firstChild, value: firstValue }, ...line.slice(1)]
    : line.slice(1)

  return hasRenderableMarkdownContent(children) ? { children, marker } : null
}

function parseParenthesizedOrderedListParagraph(
  paragraph: MarkdownAstNode,
): ParenthesizedOrderedListLine[] | null {
  if (paragraph.type !== 'paragraph') return null

  const parsedLines = splitParagraphChildrenIntoLines(paragraph).map(
    parseParenthesizedOrderedListLine,
  )

  return parsedLines.some((line) => line === null)
    ? null
    : parsedLines as ParenthesizedOrderedListLine[]
}

function createListItem(children: MarkdownAstNode[]): MarkdownAstNode {
  return {
    children: [{ children, type: 'paragraph' }],
    spread: false,
    type: 'listItem',
  }
}

function createParenthesizedList(
  lines: ParenthesizedOrderedListLine[],
): MarkdownAstNode | null {
  if (lines.length >= 2 && lines.every((line) => line.marker.level === 2)) {
    const firstStart = lines[0]?.marker.start ?? 1

    if (!lines.every((line, index) => line.marker.start === firstStart + index)) {
      return null
    }

    return {
      children: lines.map((line) => createListItem(line.children)),
      data: {
        hProperties: {
          'data-marker-style': PAREN_DECIMAL_MARKER_STYLE,
          type: '1',
        },
      },
      ordered: true,
      spread: false,
      start: firstStart,
      type: 'list',
    }
  }

  const primaryItems: Array<{
    item: MarkdownAstNode
    nested: ParenthesizedOrderedListLine[]
    start: number
  }> = []
  let currentPrimary: (typeof primaryItems)[number] | null = null

  for (const line of lines) {
    if (line.marker.level === 1) {
      const expected = primaryItems[0]
        ? primaryItems[0].start + primaryItems.length
        : line.marker.start

      if (line.marker.start !== expected) return null

      currentPrimary = {
        item: createListItem(line.children),
        nested: [],
        start: line.marker.start,
      }
      primaryItems.push(currentPrimary)
      continue
    }

    if (!currentPrimary) return null

    const expected = currentPrimary.nested[0]
      ? currentPrimary.nested[0].marker.start + currentPrimary.nested.length
      : line.marker.start

    if (line.marker.start !== expected) return null

    currentPrimary.nested.push(line)
  }

  if (primaryItems.length < 2) return null

  for (const primary of primaryItems) {
    if (primary.nested.length === 1) return null

    if (primary.nested.length > 1) {
      primary.item.children?.push({
        children: primary.nested.map((line) => createListItem(line.children)),
        data: {
          hProperties: {
            'data-marker-style': PAREN_DECIMAL_MARKER_STYLE,
            type: '1',
          },
        },
        ordered: true,
        spread: false,
        start: primary.nested[0]?.marker.start ?? 1,
        type: 'list',
      })
    }
  }

  return {
    children: primaryItems.map(({ item }) => item),
    data: {
      hProperties: {
        'data-marker-style': PAREN_UPPER_ROMAN_MARKER_STYLE,
        type: 'I',
      },
    },
    ordered: true,
    spread: false,
    start: primaryItems[0]?.start ?? 1,
    type: 'list',
  }
}

function collectParenthesizedOrderedList(
  children: MarkdownAstNode[],
  startIndex: number,
): { consumed: number; list: MarkdownAstNode } | null {
  const lines: ParenthesizedOrderedListLine[] = []
  let consumed = 0

  for (let index = startIndex; index < children.length; index += 1) {
    const paragraphLines = parseParenthesizedOrderedListParagraph(children[index])

    if (!paragraphLines) break

    lines.push(...paragraphLines)
    consumed += 1
  }

  const list = createParenthesizedList(lines)

  return list ? { consumed, list } : null
}

function parseTypedOrderedListParagraph(
  paragraph: MarkdownAstNode,
): TypedOrderedListLine[] | null {
  if (paragraph.type !== 'paragraph') return null

  const lines = splitParagraphChildrenIntoLines(paragraph)
  const parsedLines = lines.map(parseTypedOrderedListLine)

  if (parsedLines.some((line) => line === null)) return null

  return parsedLines as TypedOrderedListLine[]
}

function createTypedOrderedList(
  lines: TypedOrderedListLine[],
): MarkdownAstNode | null {
  if (lines.length < 2) return null

  const firstLine = lines[0]

  if (!firstLine) return null

  const resolvedMarker = resolveTypedMarker(firstLine.marker)

  if (!resolvedMarker) return null

  const { markerType, start } = resolvedMarker
  const optionGrid = markerType === 'A' && start === 1 && lines.length === 4

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]

    if (!line || line.marker !== markerAt(markerType, start + index)) {
      return null
    }
  }

  return {
    children: lines.map((line) => ({
      children: [
        {
          children: line?.children ?? [],
          type: 'paragraph',
        },
      ],
      spread: false,
      type: 'listItem',
    })),
    data: {
      hProperties: {
        ...(optionGrid ? { 'data-option-grid': 'true' } : {}),
        type: markerType,
      },
    },
    ordered: true,
    spread: false,
    start,
    type: 'list',
  }
}

function collectTypedOrderedList(
  children: MarkdownAstNode[],
  startIndex: number,
): { consumed: number; list: MarkdownAstNode } | null {
  const lines: TypedOrderedListLine[] = []
  let consumed = 0

  for (let index = startIndex; index < children.length; index += 1) {
    const paragraphLines = parseTypedOrderedListParagraph(children[index])

    if (!paragraphLines) break

    const candidate = [...lines, ...paragraphLines]

    if (!createTypedOrderedList(candidate) && candidate.length > 1) break

    lines.push(...paragraphLines)
    consumed += 1
  }

  const list = createTypedOrderedList(lines)

  return list ? { consumed, list } : null
}

function visitTypedOrderedLists(node: MarkdownAstNode): void {
  const children = node.children

  if (!children) return

  for (let index = 0; index < children.length;) {
    const child = children[index]
    const match =
      collectParenthesizedOrderedList(children, index) ??
      collectTypedOrderedList(children, index)

    if (match) {
      children.splice(index, match.consumed, match.list)
      index += 1
      continue
    }

    visitTypedOrderedLists(child)
    index += 1
  }
}

function alphabeticOrderedListRemarkPlugin() {
  return (tree: MarkdownAstNode) => {
    visitTypedOrderedLists(tree)
  }
}

function trailingOrderedListImageRemarkPlugin() {
  return (tree: MarkdownAstNode) => {
    const children = tree.children

    if (!children || children.length < 2) return

    const orderedList = children.at(-2)
    const imageParagraph = children.at(-1)
    const image = imageParagraph?.children?.[0]

    if (
      orderedList?.type !== 'list' ||
      orderedList.ordered !== true ||
      imageParagraph?.type !== 'paragraph' ||
      imageParagraph.children?.length !== 1 ||
      image?.type !== 'image'
    ) {
      return
    }

    children.splice(-2, 2, {
      type: 'listImagePair',
      children: [orderedList, imageParagraph],
      data: {
        hName: 'div',
        hProperties: {
          className: ['weimo-card-markdown__list-image-pair'],
        },
      },
    })
  }
}

function resolveOrderedListMarkerType(type?: unknown): OrderedListMarkerType | undefined {
  const markerType = Array.isArray(type) ? type[0] : type

  if (typeof markerType !== 'string' || !ORDERED_LIST_MARKER_TYPES.has(markerType)) {
    return undefined
  }

  return markerType as OrderedListMarkerType
}

function resolveParenthesizedMarkerStyle(
  markerStyle?: unknown,
): ParenthesizedListMarkerStyle | undefined {
  return markerStyle === PAREN_UPPER_ROMAN_MARKER_STYLE ||
    markerStyle === PAREN_DECIMAL_MARKER_STYLE
    ? markerStyle
    : undefined
}

function MarkdownOrderedList({
  children,
  node,
  start,
}: MarkdownOrderedListProps) {
  const listRef = useRef<HTMLOListElement>(null)
  const type = resolveOrderedListMarkerType(node?.properties?.type)
  const markerStyle = resolveParenthesizedMarkerStyle(
    node?.properties?.['data-marker-style'] ?? node?.properties?.dataMarkerStyle,
  )
  const optionGrid =
    node?.properties?.['data-option-grid'] ?? node?.properties?.dataOptionGrid

  useIsomorphicLayoutEffect(() => {
    const list = listRef.current

    if (!list || optionGrid !== 'true') return undefined

    const ownerDocument = list.ownerDocument
    const ownerWindow = ownerDocument.defaultView

    if (!ownerWindow) return undefined

    let animationFrame = 0
    let disposed = false

    const update = () => {
      animationFrame = 0
      if (disposed) return

      const columns = String(
        measureOptionGridColumns(list, {
          maxColumns: list.closest('.weimo-card-markdown__list-image-pair') ? 2 : 4,
        }),
      )
      if (list.dataset.optionColumns !== columns) {
        list.dataset.optionColumns = columns
      }
    }

    const scheduleUpdate = () => {
      if (!animationFrame) {
        animationFrame = ownerWindow.requestAnimationFrame(update)
      }
    }

    update()

    const resizeObserver =
      'ResizeObserver' in ownerWindow
        ? new ownerWindow.ResizeObserver(scheduleUpdate)
        : null
    resizeObserver?.observe(list)
    void ownerDocument.fonts.ready.then(scheduleUpdate)

    return () => {
      disposed = true
      resizeObserver?.disconnect()
      if (animationFrame) ownerWindow.cancelAnimationFrame(animationFrame)
    }
  }, [children, optionGrid])

  return (
    <ol
      ref={listRef}
      className="weimo-card-markdown__list weimo-card-markdown__list--ol"
      data-marker-style={markerStyle}
      data-marker-type={type}
      data-option-columns={optionGrid === 'true' ? '1' : undefined}
      data-option-grid={optionGrid === 'true' ? 'true' : undefined}
      start={start}
      type={type}
    >
      {children}
    </ol>
  )
}

function stripCenteredQuoteMarker(paragraph: MarkdownAstNode): boolean {
  const children = paragraph.children

  if (!children) return false

  let didStrip = false
  const nextChildren: MarkdownAstNode[] = []

  for (const child of children) {
    if (!didStrip && child.type === 'text' && typeof child.value === 'string') {
      const markerIndex = child.value.indexOf(WEIMO_CENTERED_QUOTE_MARKER)

      if (markerIndex >= 0) {
        const nextValue = `${child.value.slice(0, markerIndex)}${child.value.slice(
          markerIndex + WEIMO_CENTERED_QUOTE_MARKER.length,
        )}`.replace(/^\s+/, '')

        didStrip = true

        if (nextValue) {
          nextChildren.push({ ...child, value: nextValue })
        }

        continue
      }
    }

    nextChildren.push(child)
  }

  if (didStrip) {
    paragraph.children = nextChildren
  }

  return didStrip
}

function visitMarkdownAst(node: MarkdownAstNode): void {
  if (node.type === 'blockquote' && node.children) {
    const firstParagraph = node.children.find((child) => child.type === 'paragraph')

    if (firstParagraph && stripCenteredQuoteMarker(firstParagraph)) {
      node.data = {
        ...node.data,
        hProperties: {
          ...node.data?.hProperties,
          'data-weimo-centered': 'true',
        },
      }

      if (firstParagraph.children?.length === 0) {
        node.children = node.children.filter((child) => child !== firstParagraph)
      }
    }
  }

  for (const child of node.children ?? []) {
    visitMarkdownAst(child)
  }
}

function markCenteredBlockquotes() {
  return (tree: MarkdownAstNode) => {
    visitMarkdownAst(tree)
  }
}

function unwrapInlineCodeNodes(node: MarkdownAstNode): void {
  for (const child of node.children ?? []) {
    if (child.type === 'inlineCode') {
      child.type = 'text'
    } else {
      unwrapInlineCodeNodes(child)
    }
  }
}

function unwrapInlineCodeRemarkPlugin() {
  return (tree: MarkdownAstNode) => {
    unwrapInlineCodeNodes(tree)
  }
}

const fullRemarkPlugins: PluggableList = [
  remarkGfm,
  remarkMath,
  alphabeticOrderedListRemarkPlugin,
  trailingOrderedListImageRemarkPlugin,
  markCenteredBlockquotes,
  remarkBreaks,
]
const simpleRemarkPlugins: PluggableList = [
  unwrapInlineCodeRemarkPlugin,
  alphabeticOrderedListRemarkPlugin,
  trailingOrderedListImageRemarkPlugin,
  markCenteredBlockquotes,
  remarkBreaks,
]
const fullRehypePlugins: PluggableList = [rehypeRaw, [rehypeSanitize, markdownSanitizeSchema], rehypeKatex]
const simpleRehypePlugins: PluggableList = [rehypeRaw, [rehypeSanitize, markdownSanitizeSchema]]

const baseMarkdownComponents: Components = {
  a({ children, href, title }) {
    const safeHref = sanitizeMarkdownHref(href)

    if (!safeHref) {
      return <span className="weimo-card-markdown__link-text">{children}</span>
    }

    return (
      <a className="weimo-card-markdown__link" href={safeHref} title={title}>
        {children}
      </a>
    )
  },
  blockquote({ children, node }) {
    const centered =
      (node?.properties?.['data-weimo-centered'] ??
        node?.properties?.dataWeimoCentered) === 'true'

    return (
      <blockquote
        className={cn(
          'weimo-card-markdown__blockquote',
          centered && 'weimo-card-markdown__blockquote--centered',
        )}
      >
        {children}
      </blockquote>
    )
  },
  code({ children, className }) {
    return (
      <code className={cn('weimo-card-markdown__code', className)}>
        {children}
      </code>
    )
  },
  del({ children }) {
    return <del className="weimo-card-markdown__del">{children}</del>
  },
  em({ children }) {
    return <em className="weimo-card-markdown__em">{children}</em>
  },
  h1({ children }) {
    return (
      <h1 className="weimo-card-markdown__heading weimo-card-markdown__heading--h1">
        {children}
      </h1>
    )
  },
  h2({ children }) {
    return (
      <h2 className="weimo-card-markdown__heading weimo-card-markdown__heading--h2">
        {children}
      </h2>
    )
  },
  h3({ children }) {
    return (
      <h3 className="weimo-card-markdown__heading weimo-card-markdown__heading--h3">
        {children}
      </h3>
    )
  },
  h4({ children }) {
    return (
      <h4 className="weimo-card-markdown__heading weimo-card-markdown__heading--h4">
        {children}
      </h4>
    )
  },
  h5({ children }) {
    return (
      <h5 className="weimo-card-markdown__heading weimo-card-markdown__heading--h5">
        {children}
      </h5>
    )
  },
  h6({ children }) {
    return (
      <h6 className="weimo-card-markdown__heading weimo-card-markdown__heading--h6">
        {children}
      </h6>
    )
  },
  hr() {
    return <hr className="weimo-card-markdown__hr" />
  },
  img({ alt }) {
    const label = alt ? `[图片: ${alt}]` : '[图片]'

    return <span className="weimo-card-markdown__image-placeholder">{label}</span>
  },
  li({ children }) {
    return <li className="weimo-card-markdown__list-item">{children}</li>
  },
  ol: MarkdownOrderedList,
  p({ children }) {
    return <p className="weimo-card-markdown__p">{children}</p>
  },
  pre({ children }) {
    return <pre className="weimo-card-markdown__pre">{children}</pre>
  },
  strong({ children }) {
    return <strong className="weimo-card-markdown__strong">{children}</strong>
  },
  table({ children }) {
    return (
      <div
        className="weimo-card-markdown__scroll-block"
        data-markdown-table-scroll="true"
      >
        <table className="weimo-card-markdown__table">{children}</table>
      </div>
    )
  },
  tbody({ children }) {
    return <tbody className="weimo-card-markdown__table-body">{children}</tbody>
  },
  td({ children, align }) {
    return (
      <td className="weimo-card-markdown__table-cell" style={tableCellStyle(align)}>
        {children}
      </td>
    )
  },
  th({ children, align }) {
    return (
      <th
        className="weimo-card-markdown__table-cell weimo-card-markdown__table-cell--header"
        style={tableCellStyle(align)}
      >
        {children}
      </th>
    )
  },
  thead({ children }) {
    return <thead className="weimo-card-markdown__table-head">{children}</thead>
  },
  tr({ children }) {
    return <tr className="weimo-card-markdown__table-row">{children}</tr>
  },
  ul({ children, className }) {
    return (
      <ul
        className={cn(
          'weimo-card-markdown__list weimo-card-markdown__list--ul',
          className,
        )}
      >
        {children}
      </ul>
    )
  },
}

export type MdRenderImageRenderProps = MarkdownImageRenderProps
export type MdRenderImageRenderer = MarkdownImageRenderer
export type MdRenderImageSrcResolver = MarkdownImageSrcResolver

type MarkdownImageProps = Pick<ComponentPropsWithoutRef<'img'>, 'alt' | 'title'> & {
  renderImage?: MdRenderImageRenderer
  resolvedSrc: string
}

function MarkdownImage({ alt, renderImage, resolvedSrc, title }: MarkdownImageProps) {
  const [width, setWidth] = useState<string | null>(
    () => getCachedMarkdownImageWidth(resolvedSrc) ?? null,
  )

  const imageProps: MdRenderImageRenderProps = {
    alt: alt ?? '',
    className: 'weimo-card-markdown__image',
    onError: () => setWidth('auto'),
    onLoad: (event) => {
      const nextWidth = setMarkdownImageHalfIntrinsicWidth(
        event.currentTarget,
        resolvedSrc,
      )
      if (nextWidth) setWidth(nextWidth)
    },
    src: resolvedSrc,
    style: {
      visibility: width ? 'visible' : 'hidden',
      width: width ?? undefined,
    },
    title,
  }

  return renderImage ? renderImage(imageProps) : <img {...imageProps} />
}

export type MdRenderVariant = 'default' | 'simple'

export type MdRenderProps = ComponentPropsWithoutRef<'div'> & {
  content: string
  renderImage?: MdRenderImageRenderer
  resolveImageSrc?: MdRenderImageSrcResolver
  variant?: MdRenderVariant
}

export const MdRender = forwardRef<HTMLDivElement, MdRenderProps>(function MdRender(
  {
    className,
    content,
    onMouseDown,
    renderImage,
    resolveImageSrc,
    variant = 'default',
    ...props
  },
  ref,
) {
  function handleMouseDown(event: MouseEvent<HTMLDivElement>) {
    if (event.detail > 1) {
      event.preventDefault()
    }

    onMouseDown?.(event)
  }

  const markdownComponents: Components = {
    ...baseMarkdownComponents,
    img({ alt, src, title }) {
      const resolvedSrc = src ? resolveImageSrc?.(src) : undefined

      if (!resolvedSrc) {
        const label = alt ? `[图片: ${alt}]` : '[图片]'

        return <span className="weimo-card-markdown__image-placeholder">{label}</span>
      }

      return (
        <MarkdownImage
          alt={alt ?? ''}
          key={resolvedSrc}
          renderImage={renderImage}
          resolvedSrc={resolvedSrc}
          title={title}
        />
      )
    },
  }

  return (
    <div
      ref={ref}
      className={cn('weimo-card-markdown weimo-markdown-content', className)}
      onMouseDown={handleMouseDown}
      {...props}
    >
      <ReactMarkdown
        components={markdownComponents}
        rehypePlugins={variant === 'simple' ? simpleRehypePlugins : fullRehypePlugins}
        remarkRehypeOptions={markdownRemarkRehypeOptions}
        remarkPlugins={variant === 'simple' ? simpleRemarkPlugins : fullRemarkPlugins}
      >
        {normalizeCenteredQuoteSyntax(content)}
      </ReactMarkdown>
    </div>
  )
})

MdRender.displayName = 'MdRender'
