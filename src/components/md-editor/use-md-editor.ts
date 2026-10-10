import { useCallback, useEffect, useRef, useState } from 'react'
import {
  isAndroid,
  isSafari,
  isiOS,
  type Editor,
  type JSONContent,
} from '@tiptap/core'
import { useEditor } from '@tiptap/react'

import { normalizeCenteredQuoteSyntax } from '../markdown/centered-quote'
import { createMdEditorExtensions, type MdEditorMathClickPayload } from './md-editor-extensions'
import { normalizeEditorMarkdown } from './md-editor-markdown'
import type { MdEditorFocusPosition, MdEditorProps } from './md-editor-types'

const EMPTY_EDITOR_DOCUMENT = {
  type: 'doc',
  content: [{ type: 'paragraph' }],
} satisfies JSONContent

function normalizeMarkdown(markdown: string) {
  return markdown.trim().length > 0 ? markdown : ''
}

function resolveInitialContent(content: string) {
  const normalized = normalizeMarkdown(content)
  const hasInitialContent = normalized.length > 0

  return {
    hasInitialContent,
    initialContent: hasInitialContent
      ? normalizeCenteredQuoteSyntax(normalized)
      : EMPTY_EDITOR_DOCUMENT,
  }
}

export function focusEditor(editor: Editor, position?: MdEditorFocusPosition) {
  const needsNativeFocusBeforeFrame = isSafari() || isiOS() || isAndroid()

  if (!needsNativeFocusBeforeFrame) {
    editor.commands.focus(position)
    return
  }

  // Tiptap's Safari focus branch calls native focus before its command
  // transaction is dispatched. WebKit can synchronously flush DOM changes
  // during that focus, making the pending transaction stale. Commit the
  // selection first, then focus without keeping an old transaction alive.
  if (position) {
    editor.commands.setTextSelection(position === 'start' ? 0 : editor.state.doc.content.size)
  }

  const view = editor.view
  const dom = view.dom as HTMLElement

  if (isiOS() || isAndroid()) {
    dom.focus()
  } else {
    try {
      dom.focus({ preventScroll: true })
    } catch {
      dom.focus()
    }
  }

  const ownerWindow = dom.ownerDocument.defaultView ?? window

  ownerWindow.requestAnimationFrame(() => {
    if (editor.isDestroyed) return

    view.focus()
    editor.commands.scrollIntoView()
  })
}

export function useMdEditor({
  autoFocus = false,
  autoFocusPosition = 'end',
  defaultValue = '',
  disabled = false,
  onCancel,
  onChange,
  onEditorChange,
  onSave,
  placeholder,
  renderImage,
  resolveImageSrc,
  value,
}: Pick<
  MdEditorProps,
  | 'autoFocus'
  | 'autoFocusPosition'
  | 'defaultValue'
  | 'disabled'
  | 'onCancel'
  | 'onChange'
  | 'onEditorChange'
  | 'onSave'
  | 'placeholder'
  | 'renderImage'
  | 'resolveImageSrc'
  | 'value'
>) {
  const isControlled = value !== undefined
  const [initialValue] = useState(() => value ?? defaultValue)
  const { hasInitialContent, initialContent } = resolveInitialContent(initialValue)
  const [isEmpty, setIsEmpty] = useState(!hasInitialContent)
  const [internalValue, setInternalValue] = useState(initialValue)
  const [mathDialog, setMathDialog] = useState<MdEditorMathClickPayload | null>(null)
  const [mathError, setMathError] = useState<string | null>(null)
  const onChangeRef = useRef(onChange)
  const onEditorChangeRef = useRef(onEditorChange)
  const onSaveRef = useRef(onSave)
  const onCancelRef = useRef(onCancel)
  const disabledRef = useRef(disabled)
  const lastMarkdownRef = useRef(normalizeEditorMarkdown(initialValue))
  const [interactionStore] = useState(() => ({
    get: () => ({
      disabled: disabledRef.current,
      onSave: onSaveRef.current,
      onCancel: onCancelRef.current,
    }),
  }))

  useEffect(() => {
    onChangeRef.current = onChange
    onEditorChangeRef.current = onEditorChange
    onSaveRef.current = onSave
    onCancelRef.current = onCancel
    disabledRef.current = disabled
  }, [disabled, onCancel, onChange, onEditorChange, onSave])

  const emitMarkdown = useCallback(
    (nextMarkdown: string) => {
      const normalized = normalizeEditorMarkdown(nextMarkdown)

      lastMarkdownRef.current = normalized
      setIsEmpty(normalized.length === 0)

      if (!isControlled) {
        setInternalValue(normalized)
      }

      onChangeRef.current?.(normalized)
    },
    [isControlled],
  )

  const handleMathClick = useCallback((payload: MdEditorMathClickPayload) => {
    if (disabledRef.current) return

    setMathError(null)
    setMathDialog(payload)
  }, [])

  const closeMathDialog = useCallback(() => {
    setMathDialog(null)
    setMathError(null)
  }, [])

  const editor = useEditor({
    extensions: createMdEditorExtensions({
      placeholder,
      renderImage,
      resolveImageSrc,
      getInteraction: interactionStore.get,
      onMathClick: handleMathClick,
    }),
    content: initialContent,
    contentType: hasInitialContent ? 'markdown' : undefined,
    editable: !disabled,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: 'md-editor__content weimo-markdown-content tiptap',
      },
    },
    onCreate: ({ editor: currentEditor }) => {
      const nextMarkdown = currentEditor.isEmpty ? '' : currentEditor.getMarkdown()

      lastMarkdownRef.current = normalizeEditorMarkdown(nextMarkdown)
      setIsEmpty(currentEditor.isEmpty)
    },
    onUpdate: ({ editor: currentEditor }) => {
      emitMarkdown(currentEditor.isEmpty ? '' : currentEditor.getMarkdown())
    },
  })

  useEffect(() => {
    onEditorChangeRef.current?.(editor)

    return () => onEditorChangeRef.current?.(null)
  }, [editor])

  useEffect(() => {
    if (!editor) return

    editor.setEditable(!disabled, false)
  }, [disabled, editor])

  useEffect(() => {
    if (!autoFocus || !editor) return

    focusEditor(editor, autoFocusPosition)
  }, [autoFocus, autoFocusPosition, editor])

  useEffect(() => {
    if (!editor || !isControlled) return

    const nextValue = normalizeMarkdown(value ?? '')

    if (nextValue === lastMarkdownRef.current) return

    if (nextValue.length === 0) {
      editor.commands.clearContent(false)
    } else {
      editor.commands.setContent(normalizeCenteredQuoteSyntax(nextValue), {
        contentType: 'markdown',
        emitUpdate: false,
      })
    }

    lastMarkdownRef.current = nextValue
    setIsEmpty(nextValue.length === 0)
  }, [editor, isControlled, value])

  const getMarkdown = useCallback(() => {
    if (!editor) return normalizeMarkdown(isControlled ? value ?? '' : internalValue)

    return editor.isEmpty ? '' : normalizeEditorMarkdown(editor.getMarkdown())
  }, [editor, internalValue, isControlled, value])

  const clear = useCallback(() => {
    if (!editor || disabled) return

    editor.commands.clearContent()
    emitMarkdown('')
  }, [disabled, editor, emitMarkdown])

  const focus = useCallback((position?: MdEditorFocusPosition) => {
    if (disabled) return

    if (editor) focusEditor(editor, position)
  }, [disabled, editor])

  const saveMathDialog = useCallback(
    (latex: string) => {
      if (!editor || disabledRef.current || !mathDialog) return

      const nextLatex = latex.trim()

      if (nextLatex.length === 0) {
        setMathError('请输入 LaTeX 源码。')
        return
      }

      const command = editor.chain().setNodeSelection(mathDialog.pos)
      const success =
        mathDialog.kind === 'inline'
          ? command.updateInlineMath({ latex: nextLatex }).focus().run()
          : command.updateBlockMath({ latex: nextLatex }).focus().run()

      if (!success) {
        setMathError('公式已不存在，请关闭后重试。')
        return
      }

      closeMathDialog()
    },
    [closeMathDialog, editor, mathDialog],
  )

  return {
    editor,
    clear,
    closeMathDialog,
    focus,
    getMarkdown,
    isEmpty,
    mathDialog,
    mathError,
    saveMathDialog,
  }
}
