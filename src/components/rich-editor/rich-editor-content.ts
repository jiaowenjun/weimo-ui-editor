import type { Editor, JSONContent } from '@tiptap/core'

export function editorHasContent(
  editor: Editor,
  content: JSONContent,
) {
  try {
    return editor.state.doc.eq(editor.schema.nodeFromJSON(content))
  } catch {
    return false
  }
}
