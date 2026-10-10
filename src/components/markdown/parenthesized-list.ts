export const PAREN_UPPER_ROMAN_MARKER_STYLE = 'paren-upper-roman'
export const PAREN_DECIMAL_MARKER_STYLE = 'paren-decimal'

export type ParenthesizedListMarkerStyle =
  | typeof PAREN_UPPER_ROMAN_MARKER_STYLE
  | typeof PAREN_DECIMAL_MARKER_STYLE

export type ParenthesizedListMarker = {
  consumed: number
  level: 1 | 2
  markerStyle: ParenthesizedListMarkerStyle
  start: number
}

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

const UNICODE_ROMAN_MARKERS = new Map([
  ['Ⅰ', 'I'],
  ['Ⅱ', 'II'],
  ['Ⅲ', 'III'],
  ['Ⅳ', 'IV'],
  ['Ⅴ', 'V'],
  ['Ⅵ', 'VI'],
  ['Ⅶ', 'VII'],
  ['Ⅷ', 'VIII'],
  ['Ⅸ', 'IX'],
  ['Ⅹ', 'X'],
  ['Ⅺ', 'XI'],
  ['Ⅻ', 'XII'],
])

const CIRCLED_DECIMAL_MARKERS = [...'①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳']
const PRIMARY_MARKER_RE = /^(?:（(?<full>[^）]+)）|\((?<ascii>[^)]+)\))\s*/u
const CIRCLED_MARKER_RE = /^(?<marker>[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳])\s*/u
const FENCED_BLOCK_RE = /^ {0,3}(?<fence>`{3,}|~{3,})(?<rest>.*)$/

function romanMarkerAt(start: number): string {
  let remaining = start
  let marker = ''

  for (const [value, numeral] of ROMAN_NUMERALS) {
    while (remaining >= value) {
      marker += numeral
      remaining -= value
    }
  }

  return marker
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

  return remaining.length === 0 && start > 0 && romanMarkerAt(start) === uppercaseMarker
    ? start
    : null
}

function normalizeRomanMarker(marker: string): string | null {
  if (/^[IVXLCDM]+$/.test(marker)) return marker

  const markerParts = [...marker].map((value) => UNICODE_ROMAN_MARKERS.get(value))

  return markerParts.length > 0 && markerParts.every((value) => value !== undefined)
    ? markerParts.join('')
    : null
}

export function parseParenthesizedListMarker(
  text: string,
): ParenthesizedListMarker | null {
  const circledMatch = text.match(CIRCLED_MARKER_RE)

  if (circledMatch?.groups?.marker) {
    return {
      consumed: circledMatch[0].length,
      level: 2,
      markerStyle: PAREN_DECIMAL_MARKER_STYLE,
      start: CIRCLED_DECIMAL_MARKERS.indexOf(circledMatch.groups.marker) + 1,
    }
  }

  const parenthesizedMatch = text.match(PRIMARY_MARKER_RE)

  if (!parenthesizedMatch?.groups) return null

  const rawMarker = parenthesizedMatch.groups.full ?? parenthesizedMatch.groups.ascii
  const decimalStart = /^\d+$/.test(rawMarker) ? Number(rawMarker) : null

  if (decimalStart !== null) {
    return Number.isSafeInteger(decimalStart) && decimalStart > 0
      ? {
          consumed: parenthesizedMatch[0].length,
          level: 2,
          markerStyle: PAREN_DECIMAL_MARKER_STYLE,
          start: decimalStart,
        }
      : null
  }

  const lowercaseRomanStart = /^[ivxlcdm]+$/.test(rawMarker)
    ? romanMarkerStart(rawMarker)
    : null

  if (lowercaseRomanStart) {
    return {
      consumed: parenthesizedMatch[0].length,
      level: 2,
      markerStyle: PAREN_DECIMAL_MARKER_STYLE,
      start: lowercaseRomanStart,
    }
  }

  const normalizedRoman = normalizeRomanMarker(rawMarker)
  const romanStart = normalizedRoman ? romanMarkerStart(normalizedRoman) : null

  return romanStart
    ? {
        consumed: parenthesizedMatch[0].length,
        level: 1,
        markerStyle: PAREN_UPPER_ROMAN_MARKER_STYLE,
        start: romanStart,
      }
    : null
}

export function formatParenthesizedListMarker(
  markerStyle: ParenthesizedListMarkerStyle,
  start: number,
): string {
  return markerStyle === PAREN_UPPER_ROMAN_MARKER_STYLE
    ? `(${romanMarkerAt(start)})`
    : `(${start})`
}

export function normalizeParenthesizedListMarkdown(markdown: string): string {
  let activeFence: { marker: string; minimumLength: number } | null = null

  return markdown
    .replace(/\r\n|\r/g, '\n')
    .split('\n')
    .map((line) => {
      const fenceMatch = line.match(FENCED_BLOCK_RE)
      const fence = fenceMatch?.groups?.fence

      if (fence) {
        if (!activeFence) {
          activeFence = {
            marker: fence.charAt(0),
            minimumLength: fence.length,
          }
        } else if (
          fence.charAt(0) === activeFence.marker &&
          fence.length >= activeFence.minimumLength &&
          (fenceMatch.groups?.rest ?? '').trim().length === 0
        ) {
          activeFence = null
        }

        return line
      }

      if (activeFence) return line

      const trimmedLine = line.trimStart()
      const parsed = parseParenthesizedListMarker(trimmedLine)

      if (!parsed) return line

      const content = trimmedLine.slice(parsed.consumed)
      const marker = formatParenthesizedListMarker(parsed.markerStyle, parsed.start)

      return content.length > 0 ? `${marker} ${content}` : marker
    })
    .join('\n')
}
