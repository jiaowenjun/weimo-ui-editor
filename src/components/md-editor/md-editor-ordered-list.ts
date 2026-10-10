import {
  Extension,
  renderNestedMarkdownContent,
  type MarkdownLexerConfiguration,
  type MarkdownParseHelpers,
  type MarkdownParseResult,
  type MarkdownToken,
} from '@tiptap/core'
import {
  getListMarker,
  ListItem,
  OrderedList,
  toRomanUpper,
} from '@tiptap/extension-list'

import {
  PAREN_DECIMAL_MARKER_STYLE,
  PAREN_UPPER_ROMAN_MARKER_STYLE,
  parseParenthesizedListMarker,
  type ParenthesizedListMarker,
  type ParenthesizedListMarkerStyle,
} from '../markdown/parenthesized-list'

type ParenthesizedListLine = {
  content: string
  marker: ParenthesizedListMarker
  raw: string
}

type ParenthesizedPrimaryItem = {
  line: ParenthesizedListLine
  nested: ParenthesizedListLine[]
}

type ParenthesizedListGroup = {
  items: ParenthesizedPrimaryItem[]
  markerStyle: ParenthesizedListMarkerStyle
}

type ListItemRenderContext = {
  index?: number
  meta?: {
    parentAttrs?: {
      markerStyle?: unknown
      start?: number
      type?: string | null
    }
  }
  parentType?: string
}

function isMarkerStyle(value: unknown): value is ParenthesizedListMarkerStyle {
  return value === PAREN_UPPER_ROMAN_MARKER_STYLE || value === PAREN_DECIMAL_MARKER_STYLE
}

function findParenthesizedListStart(src: string): number {
  let offset = 0

  for (const line of src.split('\n')) {
    if (parseParenthesizedListMarker(line)) return offset
    offset += line.length + 1
  }

  return -1
}

function collectParenthesizedLines(src: string): {
  consumedLines: number
  lines: ParenthesizedListLine[]
} {
  const sourceLines = src.split('\n')
  const lines: ParenthesizedListLine[] = []
  let index = 0

  while (index < sourceLines.length) {
    const raw = sourceLines[index] ?? ''
    const marker = parseParenthesizedListMarker(raw)

    if (!marker) break

    const content = raw.slice(marker.consumed)

    if (content.length === 0) break

    lines.push({ content, marker, raw })
    index += 1

    while (
      sourceLines[index]?.trim().length === 0 &&
      parseParenthesizedListMarker(sourceLines[index + 1] ?? '')
    ) {
      index += 1
    }
  }

  return { consumedLines: index, lines }
}

function groupParenthesizedLines(
  lines: ParenthesizedListLine[],
): ParenthesizedListGroup | null {
  if (lines.length >= 2 && lines.every((line) => line.marker.level === 2)) {
    const firstStart = lines[0]?.marker.start ?? 1
    if (!lines.every((line, index) => line.marker.start === firstStart + index)) {
      return null
    }

    return {
      items: lines.map((line) => ({ line, nested: [] })),
      markerStyle: PAREN_DECIMAL_MARKER_STYLE,
    }
  }

  const primaryItems: ParenthesizedPrimaryItem[] = []
  let currentPrimary: ParenthesizedPrimaryItem | null = null

  for (const line of lines) {
    if (line.marker.level === 1) {
      const expected = primaryItems[0]
        ? primaryItems[0].line.marker.start + primaryItems.length
        : line.marker.start

      if (line.marker.start !== expected) return null

      currentPrimary = { line, nested: [] }
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

  return primaryItems.length >= 2 && primaryItems.every((item) => item.nested.length !== 1)
    ? {
        items: primaryItems,
        markerStyle: PAREN_UPPER_ROMAN_MARKER_STYLE,
      }
    : null
}

function createParagraphToken(
  line: ParenthesizedListLine,
  lexer: MarkdownLexerConfiguration,
): MarkdownToken {
  return {
    raw: line.content,
    tokens: lexer.inlineTokens(line.content),
    type: 'paragraph',
  }
}

function createListItemToken(
  line: ParenthesizedListLine,
  lexer: MarkdownLexerConfiguration,
  nested?: MarkdownToken,
): MarkdownToken {
  return {
    raw: line.raw,
    text: line.content,
    tokens: nested
      ? [createParagraphToken(line, lexer), nested]
      : [createParagraphToken(line, lexer)],
    type: 'list_item',
  }
}

function createListToken(
  group: ParenthesizedListGroup,
  raw: string,
  lexer: MarkdownLexerConfiguration,
): MarkdownToken {
  const { items, markerStyle } = group

  return {
    items: items.map(({ line, nested }) => {
      const nestedList = nested.length > 1
        ? {
            items: nested.map((nestedLine) => createListItemToken(nestedLine, lexer)),
            markerStyle: PAREN_DECIMAL_MARKER_STYLE,
            ordered: true,
            raw: nested.map(({ raw: nestedRaw }) => nestedRaw).join('\n'),
            start: nested[0]?.marker.start ?? 1,
            type: 'list',
          }
        : undefined

      return createListItemToken(line, lexer, nestedList)
    }),
    markerStyle,
    ordered: true,
    raw,
    start: items[0]?.line.marker.start ?? 1,
    type: 'list',
    typeMarker: markerStyle === PAREN_UPPER_ROMAN_MARKER_STYLE ? 'I' : '1',
  }
}

export const ParenthesizedOrderedListTokenizer = Extension.create({
  name: 'parenthesizedOrderedListTokenizer',

  markdownTokenizer: {
    name: 'parenthesizedOrderedList',
    level: 'block',
    start: findParenthesizedListStart,
    tokenize: (src, _tokens, lexer) => {
      const { consumedLines, lines } = collectParenthesizedLines(src)
      const group = groupParenthesizedLines(lines)

      if (!group) return undefined

      const raw = src.split('\n').slice(0, consumedLines).join('\n')

      return createListToken(group, raw, lexer)
    },
  },
})

export const MdEditorOrderedList = OrderedList.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      markerStyle: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-marker-style'),
        renderHTML: (attributes) =>
          isMarkerStyle(attributes.markerStyle)
            ? { 'data-marker-style': attributes.markerStyle }
            : {},
      },
    }
  },

  parseMarkdown(
    token: MarkdownToken,
    helpers: MarkdownParseHelpers,
  ): MarkdownParseResult {
    const parsed = this.parent?.(token, helpers)

    if (!parsed || Array.isArray(parsed) || !isMarkerStyle(token.markerStyle)) {
      return parsed ?? []
    }

    return {
      ...parsed,
      attrs: {
        ...parsed.attrs,
        markerStyle: token.markerStyle,
      },
    }
  },
})

export const MdEditorListItem = ListItem.extend({
  renderMarkdown: (node, helpers, context) =>
    renderNestedMarkdownContent(
      node,
      helpers,
      (itemContext: ListItemRenderContext) => {
        if (itemContext.parentType === 'bulletList') return '- '

        if (itemContext.parentType === 'orderedList') {
          const parentAttrs = itemContext.meta?.parentAttrs ?? {}
          const start = parentAttrs.start || 1
          const index = start + (itemContext.index || 0)

          if (parentAttrs.markerStyle === PAREN_UPPER_ROMAN_MARKER_STYLE) {
            return `(${toRomanUpper(index)}) `
          }

          if (parentAttrs.markerStyle === PAREN_DECIMAL_MARKER_STYLE) {
            return `(${index}) `
          }

          return getListMarker(parentAttrs.type, index - 1, '. ')
        }

        return '- '
      },
      context,
    ),
})
