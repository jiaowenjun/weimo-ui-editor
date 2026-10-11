import { forwardRef, useImperativeHandle, useLayoutEffect, useRef } from 'react'
import { EditorContent } from '@tiptap/react'

import { cn } from 'weimo-ui-core/lib/utils'
import {
  useMdEditor,
  type MdEditorBlockFormat,
  type MdEditorContent,
  type MdEditorFocusPosition,
  type MdEditorSelectionFormat,
} from './use-md-editor'

import 'weimo-ui-markdown/styles/md-editor.css'

export type {
  MdEditorBlockFormat,
  MdEditorContent,
  MdEditorFocusPosition,
  MdEditorSelectionFormat,
} from './use-md-editor'

export type MdEditorProps = {
  autoFocus?: boolean
  autoFocusPosition?: MdEditorFocusPosition
  className?: string
  value?: MdEditorContent
  defaultValue?: MdEditorContent
  disabled?: boolean
  editorClassName?: string
  onCancel?: () => void
  onChange?: (content: MdEditorContent) => void
  onContentHeightChange?: (height: number) => void
  onSelectionFormatChange?: (format: MdEditorSelectionFormat | null) => void
  onSave?: (content: MdEditorContent) => void
  placeholder?: string
}
export type MdEditorHandle = {
  clear: () => void
  focus: (position?: MdEditorFocusPosition) => void
  getContent: () => MdEditorContent
  getContentHeight: () => number
  getSelectionFormat: () => MdEditorSelectionFormat | null
  setBlockFormat: (format: MdEditorBlockFormat) => boolean
  setBold: (active: boolean) => boolean
  toggleBlockFormat: (
    format: Exclude<MdEditorBlockFormat, 'paragraph'>,
  ) => boolean
  toggleBold: () => boolean
}

export const MdEditor = forwardRef<MdEditorHandle, MdEditorProps>(
  function MdEditor(
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
    } = useMdEditor({
      autoFocus,
      autoFocusPosition,
      defaultValue,
      disabled,
      onCancel,
      onChange,
      onSelectionFormatChange,
      onSave,
      placeholder,
      value,
    })

    function measureEditorContentHeight() {
      const root = rootRef.current

      if (!root) return 0

      const editorContent = root.querySelector<HTMLElement>('.md-editor__content')

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
      const editorContent = rootRef.current?.querySelector<HTMLElement>('.md-editor__content')

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
          className={cn('md-editor md-editor--loading', className)}
          data-disabled={disabled ? 'true' : undefined}
        >
          <div className="md-editor__viewport">
            <div className="md-editor__skeleton" />
          </div>
        </div>
      )
    }

    return (
      <div
        ref={rootRef}
        className={cn('md-editor', className)}
        data-disabled={disabled ? 'true' : undefined}
      >
        <div className="md-editor__viewport">
          <EditorContent editor={editor} className={cn('md-editor__root', editorClassName)} />
        </div>
      </div>
    )
  },
)

MdEditor.displayName = 'MdEditor'
