import { Extension, wrappingInputRule } from '@tiptap/core'
import type { Editor, JSONContent } from '@tiptap/core'
import Blockquote from '@tiptap/extension-blockquote'
import { ListItem, OrderedList } from '@tiptap/extension-list'
import Placeholder from '@tiptap/extension-placeholder'
import { TextSelection } from '@tiptap/pm/state'
import StarterKit from '@tiptap/starter-kit'

// 预设不加载 tiptap 的 markdown 扩展:内容以 tiptap 原生 JSON 进出,编辑器
// 既不解析 Markdown 源码也不序列化回 Markdown。schema 与 WDF v0.1 对齐:
// 段落、1-6 级标题、加粗、引用和有序/无序列表。其余 StarterKit 格式
// (斜体/链接/换行/行内代码/代码块/删除线/下划线/分隔线)全部关闭。

// WDF 引用只能包含段落,列表项只能包含一个段落。用更严格的 schema
// 替代 StarterKit 默认的 `block+` / `paragraph block*`,从编辑器边界
// 阻止嵌套引用、嵌套列表和多段落列表项。
const WdfBlockquote = Blockquote.extend({
  content: 'paragraph+',
})

const WdfListItem = ListItem.extend({
  content: 'paragraph',
})

// TODO(tiptap): 这是针对 @tiptap/extension-list 3.31.4 的临时兼容。
//
// 列表末尾的空列表项第一次 Backspace 后会被 lift 为列表后的顶层空段落。
// 紧接着再按 Backspace 时,Tiptap ListKeymap 的 handleBackspace 会命中
// “当前节点不在 listItem 内且前一个节点是列表”的分支,通过 cut +
// joinForward 把这个空段落重新放进列表,于是已经取消的项目符号再次出现。
// 仅关闭 ListKeymap 不能解决问题:ProseMirror 的通用 joinBackward 也会借助
// schema 的 wrapping 关系把空段落重新包装为 listItem。
//
// 在上游修复该列表边界行为前,这里只拦截这个精确状态:删除顶层空段落并把
// 光标放到前一个列表项末尾。其他 Backspace 状态返回 false,继续交给上游
// 键位处理。升级 Tiptap 后应先运行 editor-schema-contract,复核上游行为,再
// 删除本函数和 WdfListBoundaryKeymap。
export function handleWdfListBoundaryBackspace(editor: Editor): boolean {
  const { state } = editor
  const { selection } = state

  if (!selection.empty) return false

  const { $from } = selection

  if (
    $from.depth !== 1 ||
    $from.parent.type !== state.schema.nodes.paragraph ||
    $from.parent.content.size !== 0 ||
    $from.parentOffset !== 0
  ) {
    return false
  }

  const blockIndex = $from.index(0)

  if (blockIndex === 0) return false

  const previousBlock = state.doc.child(blockIndex - 1)

  if (
    previousBlock.type !== state.schema.nodes.bulletList &&
    previousBlock.type !== state.schema.nodes.orderedList
  ) {
    return false
  }

  const blockStart = $from.before()
  const blockEnd = $from.after()

  return editor.commands.command(({ tr, dispatch }) => {
    if (!dispatch) return true

    tr.delete(blockStart, blockEnd)
    tr.setSelection(TextSelection.near(tr.doc.resolve(blockStart), -1))
    tr.scrollIntoView()
    dispatch(tr)

    return true
  })
}

const WdfListBoundaryKeymap = Extension.create({
  name: 'wdfListBoundaryKeymap',
  // 必须先于默认优先级为 100 的 ListKeymap 和通用 Keymap 执行。
  priority: 1_000,
  addKeyboardShortcuts() {
    return {
      Backspace: () => handleWdfListBoundaryBackspace(this.editor),
      'Mod-Backspace': () => handleWdfListBoundaryBackspace(this.editor),
    }
  },
})

const WDF_MAX_LIST_START = 0xffff_ffff

export function findWdfOrderedListInput(text: string) {
  const match = /^([1-9]\d*)\.\s$/.exec(text)

  if (!match) return null

  const start = Number(match[1])

  if (!Number.isSafeInteger(start) || start > WDF_MAX_LIST_START) return null

  return {
    index: match.index,
    text: match[0],
    replaceWith: match[1],
  }
}

// Tiptap 3 的 OrderedList 还会生成 `attrs.type: null`,而 WDF 有序列表只有
// `start`。在 schema 层去掉该扩展属性,使 `toTiptap` 的结果与 editor.getJSON()
// 字节结构一致,避免受控更新反复 setContent 影响选区。
const WdfOrderedList = OrderedList.extend({
  addAttributes() {
    return {
      start: {
        default: 1,
        parseHTML: (element) => {
          const start = Number.parseInt(element.getAttribute('start') ?? '', 10)

          return Number.isInteger(start) && start >= 1 && start <= WDF_MAX_LIST_START
            ? start
            : 1
        },
      },
    }
  },
  addInputRules() {
    return [
      wrappingInputRule({
        find: findWdfOrderedListInput,
        type: this.type,
        getAttributes: (match) => ({ start: Number(match[1]) }),
        joinPredicate: (match, node) =>
          node.childCount + node.attrs.start === Number(match[1]),
      }),
    ]
  },
  // OrderedList 默认插件会把纯文本列表直接变成节点,绕过上面的
  // start 范围检查。关闭该特殊粘贴路径,交给标准粘贴流程处理。
  addProseMirrorPlugins() {
    return []
  },
})

export type RichEditorInteractionContext = {
  disabled: boolean
  onSave?: (content: JSONContent) => void
  onCancel?: () => void
}

// 共享 SaveKeymap 的 Mod-S 会调 editor.getMarkdown(),没有 Markdown 扩展
// 时该方法不存在,简化编辑器必须自带 JSON 版保存键位。
const SimpleSaveKeymap = Extension.create<{
  getInteraction: () => RichEditorInteractionContext
}>({
  name: 'weimoRichEditorSaveKeymap',
  addOptions() {
    return {
      getInteraction: () =>
        ({
          disabled: false,
        }) satisfies RichEditorInteractionContext,
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

export function createRichEditorExtensions(options: {
  placeholder?: string
  getInteraction: () => RichEditorInteractionContext
}): Extension[] {
  return [
    StarterKit.configure({
      blockquote: false,
      code: false,
      codeBlock: false,
      hardBreak: false,
      heading: { levels: [1, 2, 3, 4, 5, 6] },
      horizontalRule: false,
      italic: false,
      link: false,
      listItem: false,
      orderedList: false,
      strike: false,
      trailingNode: false,
      underline: false,
    }),
    WdfBlockquote,
    WdfListItem,
    WdfOrderedList,
    WdfListBoundaryKeymap,
    Placeholder.configure({
      placeholder: options.placeholder ?? '',
    }),
    SimpleSaveKeymap.configure({
      getInteraction: options.getInteraction,
    }),
  ] as Extension[]
}
