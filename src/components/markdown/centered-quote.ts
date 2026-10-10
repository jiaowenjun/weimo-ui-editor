export const WEIMO_CENTERED_QUOTE_MARKER = '\uE000weimo-centered-quote\uE000'

export function normalizeCenteredQuoteSyntax(markdown: string): string {
  const lines = markdown.replace(/\r\n|\r/g, '\n').split('\n')
  const normalized: string[] = []
  let insideCenteredQuote = false

  for (const line of lines) {
    const match = line.match(/^(\s*)>=[ \t]?(.*)$/)

    if (match) {
      const [, indent, text] = match

      if (!insideCenteredQuote) {
        normalized.push(`${indent}> ${WEIMO_CENTERED_QUOTE_MARKER}${text}`)
        insideCenteredQuote = true
      } else {
        normalized.push(`${indent}> ${text}`)
      }

      continue
    }

    insideCenteredQuote = false
    normalized.push(line)
  }

  return normalized.join('\n')
}

export function restoreCenteredQuoteSyntax(markdown: string): string {
  const lines = markdown.replace(/\r\n|\r/g, '\n').split('\n')
  const restored: string[] = []
  let insideCenteredQuote = false

  for (const line of lines) {
    const markerMatch = line.match(
      new RegExp(`^(\\s*)>\\s*${WEIMO_CENTERED_QUOTE_MARKER}(.*)$`),
    )

    if (markerMatch) {
      const [, indent, rest] = markerMatch
      const firstLine = rest.replace(/^[ \t]?/, '')

      insideCenteredQuote = true

      if (firstLine.length > 0) {
        restored.push(`${indent}>= ${firstLine}`)
      }

      continue
    }

    if (insideCenteredQuote) {
      const quoteMatch = line.match(/^(\s*)>[ \t]?(.*)$/)

      if (quoteMatch) {
        const [, indent, text] = quoteMatch

        restored.push(`${indent}>= ${text}`)
        continue
      }

      insideCenteredQuote = false
    }

    restored.push(line)
  }

  return restored.join('\n')
}
