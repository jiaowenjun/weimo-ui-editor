import type { JSONContent, MarkdownRendererHelpers } from '@tiptap/core'
import { Table, renderTableToMarkdown } from '@tiptap/extension-table'

function promoteFirstRowToMarkdownHeader(node: JSONContent): JSONContent {
  const firstRow = node.content?.[0]
  const firstRowCells = firstRow?.content

  if (
    !firstRowCells?.length ||
    !firstRowCells.every((cell) => cell.type === 'tableCell')
  ) {
    return node
  }

  return {
    ...node,
    content: [
      {
        ...firstRow,
        content: firstRowCells.map((cell) => ({
          ...cell,
          type: 'tableHeader',
        })),
      },
      ...(node.content?.slice(1) ?? []),
    ],
  }
}

export const MdEditorTable = Table.extend({
  renderMarkdown(node: JSONContent, helpers: MarkdownRendererHelpers) {
    return renderTableToMarkdown(
      promoteFirstRowToMarkdownHeader(node),
      helpers,
    )
  },
})
