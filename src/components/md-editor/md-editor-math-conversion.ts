import type { Editor } from '@tiptap/core'
import { TextSelection } from '@tiptap/pm/state'

type InlineMathSelection = {
  from: number
  to: number
  latex: string
}

export function resolveInlineMathSelection(editor: Editor): InlineMathSelection | null {
  const { selection } = editor.state

  if (!(selection instanceof TextSelection) || selection.empty) return null
  if (!selection.$from.sameParent(selection.$to) || !selection.$from.parent.isTextblock) {
    return null
  }

  let containsUnsupportedInlineNode = false

  editor.state.doc.nodesBetween(selection.from, selection.to, (node) => {
    if (node.isInline && node.isLeaf && !node.isText) {
      containsUnsupportedInlineNode = true
      return false
    }
  })

  if (containsUnsupportedInlineNode) return null

  const selectedText = editor.state.doc.textBetween(selection.from, selection.to, '')
  if (selectedText.trim().length === 0) return null

  return { from: selection.from, to: selection.to, latex: selectedText }
}

export function convertSelectionToInlineMath(editor: Editor) {
  const selection = resolveInlineMathSelection(editor)
  if (!selection) return false

  return editor
    .chain()
    .focus()
    .deleteRange({ from: selection.from, to: selection.to })
    .insertInlineMath({ latex: selection.latex, pos: selection.from })
    .setTextSelection(selection.from + 1)
    .run()
}

export function convertBlockMathToInline(editor: Editor, pos: number) {
  const { blockMath, inlineMath, paragraph } = editor.schema.nodes
  const node = editor.state.doc.nodeAt(pos)

  if (!blockMath || !inlineMath || !paragraph || node?.type !== blockMath) {
    return false
  }

  const $pos = editor.state.doc.resolve(pos)
  const index = $pos.index()

  if (!$pos.parent.canReplaceWith(index, index + 1, paragraph)) {
    return false
  }

  const inlineNode = inlineMath.create({ latex: node.attrs.latex })
  const paragraphNode = paragraph.create(null, inlineNode)
  const tr = editor.state.tr.replaceWith(pos, pos + node.nodeSize, paragraphNode)

  editor.view.dispatch(tr.scrollIntoView())
  return true
}

export function convertInlineMathToBlock(editor: Editor, pos: number) {
  const { blockMath, inlineMath } = editor.schema.nodes
  const node = editor.state.doc.nodeAt(pos)

  if (!blockMath || !inlineMath || node?.type !== inlineMath) {
    return false
  }

  const $pos = editor.state.doc.resolve(pos)
  const parent = $pos.parent

  if (!$pos.depth || !parent.isTextblock) {
    return false
  }

  const beforeContent = parent.content.cut(0, $pos.parentOffset)
  const afterContent = parent.content.cut($pos.parentOffset + node.nodeSize)
  const replacement = []

  if (beforeContent.size > 0) {
    replacement.push(parent.type.create(parent.attrs, beforeContent, parent.marks))
  }

  replacement.push(blockMath.create({ latex: node.attrs.latex }))

  if (afterContent.size > 0) {
    replacement.push(parent.type.create(parent.attrs, afterContent, parent.marks))
  }

  const parentPos = $pos.before()
  const tr = editor.state.tr.replaceWith(
    parentPos,
    parentPos + parent.nodeSize,
    replacement,
  )

  if (!tr.docChanged) {
    return false
  }

  editor.view.dispatch(tr.scrollIntoView())
  return true
}
