import type { Editor } from '@tiptap/core'
import type {
  MarkdownImageRenderer,
  MarkdownImageSrcResolver,
} from '../markdown/image-renderer'

export type MdEditorFormatContentOptions = {
  formatMarkdown?: (markdown: string) => string
}

export type MdEditorFocusPosition = 'start' | 'end'

export type MdEditorHandle = {
  focus: (position?: MdEditorFocusPosition) => void
  clear: () => void
  convertSelectionToInlineMath: () => boolean
  formatContent: (options?: MdEditorFormatContentOptions) => string
  getMarkdown: () => string
  getContentHeight: () => number
}

export type MdEditorBaseProps = {
  onCancel?: () => void
  onContentHeightChange?: (height: number) => void
  placeholder?: string
  disabled?: boolean
  autoFocus?: boolean
  autoFocusPosition?: MdEditorFocusPosition
  className?: string
  editorClassName?: string
}

export type MdEditorProps = MdEditorBaseProps & {
  value?: string
  defaultValue?: string
  onChange?: (markdown: string) => void
  onSave?: (markdown: string) => void
  onEditorChange?: (editor: Editor | null) => void
  renderImage?: MarkdownImageRenderer
  resolveImageSrc?: MarkdownImageSrcResolver
}
