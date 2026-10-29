import { forwardRef, useImperativeHandle, useLayoutEffect, useRef } from 'react'
import { EditorContent } from '@tiptap/react'

import { cn } from 'weimo-ui-core/lib/utils'
import {
  useRichEditor,
  type RichEditorBlockFormat,
  type RichEditorContent,
  type RichEditorFocusPosition,
  type RichEditorSelectionFormat,
} from './use-rich-editor'

import 'weimo-ui-editor/styles/tokens.css'
import 'weimo-ui-editor/styles/rich-editor.css'

export type {
  RichEditorBlockFormat,
  RichEditorContent,
  RichEditorFocusPosition,
  RichEditorSelectionFormat,
} from './use-rich-editor'

export type RichEditorProps = {
  autoFocus?: boolean
  autoFocusPosition?: RichEditorFocusPosition
  className?: string
  value?: RichEditorContent
  defaultValue?: RichEditorContent
  disabled?: boolean
  editorClassName?: string
  onCancel?: () => void
  onChange?: (content: RichEditorContent) => void
  onContentHeightChange?: (height: number) => void
  onSelectionFormatChange?: (format: RichEditorSelectionFormat | null) => void
  /** Fires once the async-mounted Tiptap instance exists (per mount). */
  onReady?: () => void
  onSave?: (content: RichEditorContent) => void
  placeholder?: string
}
export type RichEditorHandle = {
  clear: () => void
  focus: (position?: RichEditorFocusPosition) => void
  getContent: () => RichEditorContent
  getContentHeight: () => number
  getSelectionFormat: () => RichEditorSelectionFormat | null
  setBlockFormat: (format: RichEditorBlockFormat) => boolean
  setBold: (active: boolean) => boolean
  toggleBlockFormat: (
    format: Exclude<RichEditorBlockFormat, 'paragraph'>,
  ) => boolean
  toggleBold: () => boolean
}

export const RichEditor = forwardRef<RichEditorHandle, RichEditorProps>(
  function RichEditor(
    {
      autoFocus = false,
      autoFocusPosition = 'end',
      className,
      defaultValue,
      disabled = false,
      editorClassName,
      onCancel,
      onChange,
      onContentHeightChange,
      onSelectionFormatChange,
      onReady,
      onSave,
      placeholder,
      value,
    },
    ref,
  ) {
    const rootRef = useRef<HTMLDivElement | null>(null)
    const contentHeightChangeHandlerRef = useRef(onContentHeightChange)
    const {
      clear,
      editor,
      focus,
      getContent,
      getSelectionFormat,
      setBlockFormat,
      setBold,
      toggleBlockFormat,
      toggleBold,
    } = useRichEditor({
      autoFocus,
      autoFocusPosition,
      defaultValue,
      disabled,
      onCancel,
      onChange,
      onSelectionFormatChange,
      onReady,
      onSave,
      placeholder,
      value,
    })

    function measureEditorContentHeight() {
      const root = rootRef.current

      if (!root) return 0

      const editorContent = root.querySelector<HTMLElement>('.rich-editor__content')

      if (!editorContent) return 0

      return Math.max(
        editorContent.scrollHeight,
        editorContent.getBoundingClientRect().height,
      )
    }

    useLayoutEffect(() => {
      contentHeightChangeHandlerRef.current = onContentHeightChange
    }, [onContentHeightChange])

    useLayoutEffect(() => {
      const editorContent = rootRef.current?.querySelector<HTMLElement>('.rich-editor__content')

      if (!editorContent) return
      const observedEditorContent = editorContent

      function notifyContentHeightChange() {
        const nextHeight = Math.max(
          observedEditorContent.scrollHeight,
          observedEditorContent.getBoundingClientRect().height,
        )

        if (nextHeight <= 0) return

        contentHeightChangeHandlerRef.current?.(nextHeight)
      }

      notifyContentHeightChange()

      if (typeof ResizeObserver === 'undefined') return

      const contentResizeObserver = new ResizeObserver(notifyContentHeightChange)
      contentResizeObserver.observe(observedEditorContent)

      return () => contentResizeObserver.disconnect()
    }, [editor])

    useImperativeHandle(
      ref,
      () => ({
        clear,
        focus,
        getContent,
        getSelectionFormat,
        getContentHeight: measureEditorContentHeight,
        setBlockFormat,
        setBold,
        toggleBlockFormat,
        toggleBold,
      }),
      [
        clear,
        editor,
        focus,
        getContent,
        getSelectionFormat,
        setBlockFormat,
        setBold,
        toggleBlockFormat,
        toggleBold,
      ],
    )

    if (!editor) {
      return (
        <div
          ref={rootRef}
          className={cn('rich-editor rich-editor--loading', className)}
          data-disabled={disabled ? 'true' : undefined}
        >
          <div className="rich-editor__viewport">
            <div className="rich-editor__skeleton" />
          </div>
        </div>
      )
    }

    return (
      <div
        ref={rootRef}
        className={cn('rich-editor', className)}
        data-disabled={disabled ? 'true' : undefined}
      >
        <div className="rich-editor__viewport">
          <EditorContent editor={editor} className={cn('rich-editor__root', editorClassName)} />
        </div>
      </div>
    )
  },
)

RichEditor.displayName = 'RichEditor'
