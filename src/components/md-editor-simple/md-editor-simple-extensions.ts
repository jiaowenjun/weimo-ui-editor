import { Extension } from '@tiptap/core'
import type { JSONContent } from '@tiptap/core'
import Placeholder from '@tiptap/extension-placeholder'
import StarterKit from '@tiptap/starter-kit'

// 预设不加载 tiptap 的 markdown 扩展:内容以 tiptap 原生 JSON 进出,编辑器
// 既不解析 Markdown 源码也不序列化回 Markdown。格式面收敛为标题/加粗/引用/
// 无序列表四种(标题仅 level 1),其余 StarterKit 格式(斜体/链接/行内代码/
// 代码块/删除线/下划线/有序列表/分隔线)全部关闭,schema 层面即无法产生。

export type MdEditorSimpleInteractionContext = {
  disabled: boolean
  onSave?: (content: JSONContent) => void
  onCancel?: () => void
}

// 共享 SaveKeymap 的 Mod-S 会调 editor.getMarkdown(),没有 Markdown 扩展
// 时该方法不存在,简化编辑器必须自带 JSON 版保存键位。
const SimpleSaveKeymap = Extension.create<{
  getInteraction: () => MdEditorSimpleInteractionContext
}>({
  name: 'weimoMdEditorSimpleSaveKeymap',
  addOptions() {
    return {
      getInteraction: () =>
        ({
          disabled: false,
        }) satisfies MdEditorSimpleInteractionContext,
    }
  },
  addKeyboardShortcuts() {
    return {
      'Mod-s': () => {
        const ctx = this.options.getInteraction()

        if (ctx.disabled || !ctx.onSave) return false

        ctx.onSave(this.editor.getJSON())

        return true
      },
      Escape: () => {
        const ctx = this.options.getInteraction()

        if (!ctx.onCancel) return false

        ctx.onCancel()

        return true
      },
    }
  },
})

export function createMdEditorSimpleExtensions(options: {
  placeholder?: string
  getInteraction: () => MdEditorSimpleInteractionContext
}): Extension[] {
  return [
    StarterKit.configure({
      code: false,
      codeBlock: false,
      heading: { levels: [1] },
      horizontalRule: false,
      italic: false,
      link: false,
      orderedList: false,
      strike: false,
      underline: false,
    }),
    Placeholder.configure({
      placeholder: options.placeholder ?? '',
    }),
    SimpleSaveKeymap.configure({
      getInteraction: options.getInteraction,
    }),
  ] as Extension[]
}
