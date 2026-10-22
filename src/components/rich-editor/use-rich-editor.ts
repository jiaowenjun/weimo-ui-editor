import { useCallback, useEffect, useRef, useState } from 'react'
import { useEditor } from '@tiptap/react'
import {
  isAndroid,
  isSafari,
  isiOS,
  type Editor,
  type JSONContent,
} from '@tiptap/core'

import { editorHasContent } from './rich-editor-content'
import { createRichEditorExtensions } from './rich-editor-extensions'

export type RichEditorContent = JSONContent
export type RichEditorFocusPosition = 'start' | 'end'
export type RichEditorBlockFormat = 'paragraph' | 'heading' | 'list' | 'quote'
export type RichEditorSelectionFormat = Readonly<{
  block: RichEditorBlockFormat
  bold: boolean
}>

export type UseRichEditorProps = {
  autoFocus?: boolean
  autoFocusPosition?: RichEditorFocusPosition
  defaultValue?: RichEditorContent
  disabled?: boolean
  onCancel?: () => void
  onChange?: (content: RichEditorContent) => void
  onSelectionFormatChange?: (format: RichEditorSelectionFormat | null) => void
  /**
   * Fires once when the Tiptap instance has mounted (immediatelyRender: false
   * defers creation). Use this instead of DOM polling to start animations or
   * focus flows that must wait for a real editor.
   */
  onReady?: () => void
  onSave?: (content: RichEditorContent) => void
  placeholder?: string
  value?: RichEditorContent
}

const EMPTY_SIMPLE_DOCUMENT: RichEditorContent = {
  type: 'doc',
  content: [{ type: 'paragraph' }],
}

function focusEditor(editor: Editor, position?: RichEditorFocusPosition) {
  const needsNativeFocusBeforeFrame = isSafari() || isiOS() || isAndroid()

  if (!needsNativeFocusBeforeFrame) {
    editor.commands.focus(position)
    return
  }

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

function selectionFormatsEqual(
  left: RichEditorSelectionFormat | null,
  right: RichEditorSelectionFormat | null,
) {
  return left?.block === right?.block && left?.bold === right?.bold
}

function resolveRichEditorSelectionFormat(
  editor: Editor,
): RichEditorSelectionFormat {
  let block: RichEditorBlockFormat = 'paragraph'

  if (editor.isActive('heading')) {
    block = 'heading'
  } else if (editor.isActive('bulletList') || editor.isActive('orderedList')) {
    block = 'list'
  } else if (editor.isActive('blockquote')) {
    block = 'quote'
  }

  return { block, bold: editor.isActive('bold') }
}

function setEditorBlockFormat(editor: Editor, format: RichEditorBlockFormat) {
  const headingActive = editor.isActive('heading')
  const bulletListActive = editor.isActive('bulletList')
  const orderedListActive = editor.isActive('orderedList')
  const listActive = bulletListActive || orderedListActive
  const quoteActive = editor.isActive('blockquote')
  const command = editor.chain().focus()

  if (format !== 'heading' && headingActive) command.setParagraph()
  if (format !== 'list' && bulletListActive) command.toggleBulletList()
  if (format !== 'list' && orderedListActive) command.toggleOrderedList()
  if (format !== 'quote' && quoteActive) command.unsetBlockquote()

  if (format === 'heading' && !headingActive) command.setHeading({ level: 1 })
  if (format === 'list' && !listActive) command.toggleBulletList()
  if (format === 'quote' && !quoteActive) command.toggleBlockquote()

  return command.run()
}

export function useRichEditor({
  autoFocus = false,
  autoFocusPosition = 'end',
  defaultValue,
  disabled = false,
  onCancel,
  onChange,
  onSelectionFormatChange,
  onReady,
  onSave,
  placeholder,
  value,
}: UseRichEditorProps) {
  const isControlled = value !== undefined
  const [initialValue] = useState(() => value ?? defaultValue)
  const [internalValue, setInternalValue] = useState(initialValue)
  const onChangeRef = useRef(onChange)
  const onSelectionFormatChangeRef = useRef(onSelectionFormatChange)
  const onSaveRef = useRef(onSave)
  const onCancelRef = useRef(onCancel)
  const onReadyRef = useRef(onReady)
  const disabledRef = useRef(disabled)
  const lastSelectionFormatRef = useRef<RichEditorSelectionFormat | null>(null)
  // The editor instance is created asynchronously (immediatelyRender: false),
  // so imperative focus() calls that arrive before it exists are parked here
  // and replayed once the instance is ready.
  const pendingFocusRef = useRef<{ position?: RichEditorFocusPosition } | null>(null)
  const [interactionStore] = useState(() => ({
    get: () => ({
      disabled: disabledRef.current,
      onSave: onSaveRef.current,
      onCancel: onCancelRef.current,
    }),
  }))

  useEffect(() => {
    onChangeRef.current = onChange
    onSelectionFormatChangeRef.current = onSelectionFormatChange
    onSaveRef.current = onSave
    onCancelRef.current = onCancel
    onReadyRef.current = onReady
    disabledRef.current = disabled
  }, [disabled, onCancel, onChange, onReady, onSave, onSelectionFormatChange])

  const emitSelectionFormat = useCallback((currentEditor: Editor | null) => {
    const nextFormat = currentEditor
      ? resolveRichEditorSelectionFormat(currentEditor)
      : null

    if (selectionFormatsEqual(lastSelectionFormatRef.current, nextFormat)) return

    lastSelectionFormatRef.current = nextFormat
    onSelectionFormatChangeRef.current?.(nextFormat)
  }, [])

  const emitContent = useCallback(
    (nextContent: RichEditorContent) => {
      if (!isControlled) {
        setInternalValue(nextContent)
      }

      onChangeRef.current?.(nextContent)
    },
    [isControlled],
  )

  const editor = useEditor({
    extensions: createRichEditorExtensions({
      placeholder,
      getInteraction: interactionStore.get,
    }),
    content: initialValue,
    editable: !disabled,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: 'rich-editor__content weimo-markdown-content tiptap',
      },
    },
    onCreate: ({ editor: currentEditor }) => {
      emitSelectionFormat(currentEditor)
    },
    onTransaction: ({ editor: currentEditor }) => emitSelectionFormat(currentEditor),
    onUpdate: ({ editor: currentEditor }) => {
      emitContent(currentEditor.getJSON())
    },
  })

  useEffect(() => {
    if (!editor) return

    emitSelectionFormat(editor)
    onReadyRef.current?.()

    return () => emitSelectionFormat(null)
  }, [editor, emitSelectionFormat])

  useEffect(() => {
    if (!editor) return

    editor.setEditable(!disabled, false)
  }, [disabled, editor])

  useEffect(() => {
    if (!autoFocus || !editor) return

    focusEditor(editor, autoFocusPosition)
  }, [autoFocus, autoFocusPosition, editor])

  useEffect(() => {
    if (!editor) return

    const pendingFocus = pendingFocusRef.current
    if (!pendingFocus) return

    pendingFocusRef.current = null

    if (!disabledRef.current) focusEditor(editor, pendingFocus.position)
  }, [editor])

  useEffect(() => {
    if (!editor || !isControlled) return

    const nextContent = value ?? EMPTY_SIMPLE_DOCUMENT

    if (editorHasContent(editor, nextContent)) return

    editor.commands.setContent(nextContent, {
      emitUpdate: false,
    })
  }, [editor, isControlled, value])

  const getContent = useCallback(() => {
    if (!editor) return internalValue ?? EMPTY_SIMPLE_DOCUMENT

    return editor.getJSON()
  }, [editor, internalValue])

  const clear = useCallback(() => {
    if (!editor || disabled) return

    editor.commands.clearContent()
    emitContent(editor.getJSON())
  }, [disabled, editor, emitContent])

  const focus = useCallback((position?: RichEditorFocusPosition) => {
    if (disabled) return

    if (editor) {
      focusEditor(editor, position)
    } else {
      pendingFocusRef.current = { position }
    }
  }, [disabled, editor])

  const getSelectionFormat = useCallback(() => {
    if (!editor) return null

    return resolveRichEditorSelectionFormat(editor)
  }, [editor])

  const setBlockFormat = useCallback((format: RichEditorBlockFormat) => {
    if (!editor || disabled) return false

    return setEditorBlockFormat(editor, format)
  }, [disabled, editor])

  const toggleBlockFormat = useCallback((format: Exclude<RichEditorBlockFormat, 'paragraph'>) => {
    if (!editor || disabled) return false

    const currentFormat = resolveRichEditorSelectionFormat(editor).block

    return setEditorBlockFormat(editor, currentFormat === format ? 'paragraph' : format)
  }, [disabled, editor])

  const setBold = useCallback((active: boolean) => {
    if (!editor || disabled) return false

    const command = editor.chain().focus()

    return (active ? command.setBold() : command.unsetBold()).run()
  }, [disabled, editor])

  const toggleBold = useCallback(() => {
    if (!editor || disabled) return false

    return editor.chain().focus().toggleBold().run()
  }, [disabled, editor])

  return {
    editor,
    clear,
    focus,
    getContent,
    getSelectionFormat,
    setBlockFormat,
    setBold,
    toggleBlockFormat,
    toggleBold,
  }
}
