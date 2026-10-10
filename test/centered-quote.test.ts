import { describe, expect, it } from 'vitest'

import {
  normalizeCenteredQuoteSyntax,
  restoreCenteredQuoteSyntax,
  WEIMO_CENTERED_QUOTE_MARKER,
} from '../src/components/markdown/centered-quote'

describe('centered quote syntax', () => {
  it('normalizes a centered quote block and restores its public syntax', () => {
    const markdown = 'before\n>= first\n>= second\nafter'
    const normalized = normalizeCenteredQuoteSyntax(markdown)

    expect(normalized).toContain(`> ${WEIMO_CENTERED_QUOTE_MARKER}first`)
    expect(normalized).toContain('> second')
    expect(restoreCenteredQuoteSyntax(normalized)).toBe(markdown)
  })

  it('normalizes Windows newlines', () => {
    expect(normalizeCenteredQuoteSyntax('>= quote\r\nnext')).toBe(
      `> ${WEIMO_CENTERED_QUOTE_MARKER}quote\nnext`,
    )
  })
})
