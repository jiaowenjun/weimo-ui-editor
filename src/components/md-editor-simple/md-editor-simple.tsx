import { forwardRef, useImperativeHandle, useLayoutEffect, useRef } from 'react'
import { EditorContent } from '@tiptap/react'

import { cn } from 'weimo-ui-core/lib/utils'
import type { MdEditorBaseProps, MdEditorFocusPosition } from '../md-editor/md-editor-types'
import {
  useMdEditorSimple,
  type MdEditorSimpleBlockFormat,
  type MdEditorSimpleContent,
  type MdEditorSimpleSelectionFormat,
} from './use-md-editor-simple'

import 'weimo-ui-markdown/styles/md-editor.css'

export type {
  MdEditorSimpleBlockFormat,
  MdEditorSimpleContent,
  MdEditorSimpleSelectionFormat,
} from './use-md-editor-simple'

export type MdEditorSimpleProps = MdEditorBaseProps & {
  value?: MdEditorSimpleContent
  defaultValue?: MdEditorSimpleContent
  onChange?: (content: MdEditorSimpleContent) => void
  onSelectionFormatChange?: (format: MdEditorSimpleSelectionFormat | null) => void
  onSave?: (content: MdEditorSimpleContent) => void
}
export type MdEditorSimpleHandle = {
  clear: () => void
  focus: (position?: MdEditorFocusPosition) => void
  getContent: () => MdEditorSimpleContent
  getContentHeight: () => number
  getSelectionFormat: () => MdEditorSimpleSelectionFormat | null
  setBlockFormat: (format: MdEditorSimpleBlockFormat) => boolean
  setBold: (active: boolean) => boolean
  toggleBlockFormat: (
    format: Exclude<MdEditorSimpleBlockFormat, 'paragraph'>,
  ) => boolean
  toggleBold: () => boolean
}

export const MdEditorSimple = forwardRef<MdEditorSimpleHandle, MdEditorSimpleProps>(
  function MdEditorSimple(
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
    } = useMdEditorSimple({
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

MdEditorSimple.displayName = 'MdEditorSimple'
