import type { Editor } from '@tiptap/core'
import { closeHistory } from '@tiptap/pm/history'
import { TextSelection } from '@tiptap/pm/state'

import { normalizeCenteredQuoteSyntax } from '../markdown/centered-quote'
import { normalizeEditorMarkdown } from './md-editor-markdown'

export function formatEditorContent(
  editor: Editor,
  {
    focus = true,
    formatMarkdown,
  }: { focus?: boolean; formatMarkdown?: (markdown: string) => string } = {},
) {
  let chain = editor.chain()

  if (focus) {
    chain = chain.focus()
  }

  if (!formatMarkdown) return chain.run()

  const manager = editor.storage.markdown.manager
  const markdown = normalizeEditorMarkdown(
    manager.serialize(editor.state.doc.toJSON()),
  )
  const formattedMarkdown = formatMarkdown(markdown)

  if (formattedMarkdown === markdown) return chain.run()

  return chain
    .command(({ tr }) => {
      closeHistory(tr)
      const originalSelectionHead = tr.selection.head
      const nextJson = manager.parse(normalizeCenteredQuoteSyntax(formattedMarkdown))
      const nextDocument = editor.schema.nodeFromJSON(nextJson)
      tr.replaceWith(0, tr.doc.content.size, nextDocument.content)
      tr.setSelection(
        TextSelection.near(
          tr.doc.resolve(Math.min(originalSelectionHead, tr.doc.content.size)),
        ),
      )

      return tr.docChanged
    })
    .run()
}
