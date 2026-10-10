import { Extension } from '@tiptap/core'

import { normalizeEditorMarkdown } from './md-editor-markdown'

export type MdEditorInteractionContext = {
  disabled: boolean
  onSave?: (markdown: string) => void
  onCancel?: () => void
}

export const SaveKeymap = Extension.create<{
  getInteraction: () => MdEditorInteractionContext
}>({
  name: 'weimoMdEditorSaveKeymap',
  addOptions() {
    return {
      getInteraction: () =>
        ({
          disabled: false,
        }) satisfies MdEditorInteractionContext,
    }
  },
  addKeyboardShortcuts() {
    return {
      'Mod-s': () => {
        const ctx = this.options.getInteraction()

        if (ctx.disabled || !ctx.onSave) return false

        ctx.onSave(normalizeEditorMarkdown(this.editor.getMarkdown()))

        return true
      },
      Escape: () => {
        const ctx = this.options.getInteraction()

        if (!ctx.onCancel) return false

        ctx.onCancel?.()

        return true
      },
    }
  },
})
