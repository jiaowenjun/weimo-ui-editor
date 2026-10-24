import { fromTiptap, toTiptap, type WdfDocument } from 'weimo-wdf'
import { EditorState } from '@tiptap/pm/state'
import type { JSONContent } from '@tiptap/core'

/** A new session must not undo into a saved or discarded previous draft. */
export function freshMdfEditorState(state: EditorState, content: JSONContent) {
  return EditorState.create({
    doc: state.schema.nodeFromJSON(content),
    plugins: state.plugins,
  })
}

// ProseMirror omits `content` on empty text blocks; WDF's wire format requires it.
export function readMdfDraft(value: unknown): WdfDocument {
  function complete(node: unknown): unknown {
    if (!node || typeof node !== 'object') return node
    const record = node as Record<string, unknown>
    if (Array.isArray(record.content)) {
      return { ...record, content: record.content.map(complete) }
    }
    if (record.type === 'paragraph' || record.type === 'heading') {
      return { ...record, content: [] }
    }
    return record
  }
  const result = fromTiptap(complete(value))
  if (!result.ok) throw new Error('内容格式不受支持，请检查后重试。')
  return result.value
}

/** One isolated draft; a pending or completed save cannot be submitted twice. */
export function createMdfDraft(document: WdfDocument) {
  let state: 'editing' | 'saving' | 'closed' = 'editing'
  const closed = () => state === 'closed'
  return {
    content: toTiptap(document),
    cancel() {
      if (state !== 'editing') return false
      state = 'closed'
      return true
    },
    dispose() { state = 'closed' },
    async save(
      content: unknown,
      persist?: (document: WdfDocument) => void | Promise<void>,
    ): Promise<WdfDocument | null> {
      if (state !== 'editing') return null
      state = 'saving'
      try {
        const next = readMdfDraft(content)
        await persist?.(next)
        if (closed()) return null
        state = 'closed'
        return next
      } catch (error) {
        if (!closed()) state = 'editing'
        throw error
      }
    },
  }
}
