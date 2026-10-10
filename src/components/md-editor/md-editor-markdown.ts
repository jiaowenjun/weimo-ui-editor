import { restoreCenteredQuoteSyntax } from '../markdown/centered-quote'
import { normalizeParenthesizedListMarkdown } from '../markdown/parenthesized-list'

const EMPTY_PARAGRAPH_PLACEHOLDER_RE = /^(?:[ \t]*(?:&nbsp;|\u00a0)[ \t]*)+$/u

function normalizeMarkdown(markdown: string) {
  return markdown.trim().length > 0 ? markdown : ''
}

function removeEmptyParagraphPlaceholders(markdown: string) {
  return markdown
    .replace(/\r\n|\r/g, '\n')
    .split(/\n{2,}/)
    .filter((paragraph) => !EMPTY_PARAGRAPH_PLACEHOLDER_RE.test(paragraph))
    .join('\n\n')
}

export function normalizeEditorMarkdown(markdown: string) {
  return normalizeMarkdown(
    normalizeParenthesizedListMarkdown(
      removeEmptyParagraphPlaceholders(restoreCenteredQuoteSyntax(markdown)),
    ),
  )
}
