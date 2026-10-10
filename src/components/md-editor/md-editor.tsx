import { forwardRef, useImperativeHandle, useLayoutEffect, useRef } from 'react'
import { EditorContent } from '@tiptap/react'

import { cn } from 'weimo-ui-core/lib/utils'
import { formatEditorContent } from './md-editor-content-format'
import { convertSelectionToInlineMath } from './md-editor-math-conversion'
import { useMdEditor } from './use-md-editor'
import { MathEditor } from './math-editor'
import type { MdEditorHandle, MdEditorProps } from './md-editor-types'

import './md-editor.css'

export const MdEditor = forwardRef<MdEditorHandle, MdEditorProps>(function MdEditor(
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
    onEditorChange,
    onSave,
    placeholder,
    renderImage,
    resolveImageSrc,
    value,
  },
  ref,
) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const contentHeightChangeHandlerRef = useRef(onContentHeightChange)
  const {
    clear,
    closeMathDialog,
    editor,
    focus,
    getMarkdown,
    mathDialog,
    mathError,
    saveMathDialog,
  } = useMdEditor({
    autoFocus,
    autoFocusPosition,
    defaultValue,
    disabled,
    onCancel,
    onChange,
    onEditorChange,
    onSave,
    placeholder,
    renderImage,
    resolveImageSrc,
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
      convertSelectionToInlineMath: () =>
        editor ? convertSelectionToInlineMath(editor) : false,
      focus,
      formatContent: (options) => {
        if (!editor) return getMarkdown()

        formatEditorContent(editor, {
          focus: false,
          formatMarkdown: options?.formatMarkdown,
        })
        return getMarkdown()
      },
      getMarkdown,
      getContentHeight: measureEditorContentHeight,
    }),
    [clear, editor, focus, getMarkdown],
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
      <MathEditor
        dialog={mathDialog}
        error={mathError}
        onOpenChange={closeMathDialog}
        onSave={saveMathDialog}
      />
    </div>
  )
})

MdEditor.displayName = 'MdEditor'
