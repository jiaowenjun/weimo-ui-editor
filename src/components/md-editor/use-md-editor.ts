import { useCallback, useEffect, useRef, useState } from 'react'
import { useEditor } from '@tiptap/react'
import {
  isAndroid,
  isSafari,
  isiOS,
  type Editor,
  type JSONContent,
} from '@tiptap/core'

import { createMdEditorExtensions } from './md-editor-extensions'

export type MdEditorContent = JSONContent
export type MdEditorFocusPosition = 'start' | 'end'
export type MdEditorBlockFormat = 'paragraph' | 'heading' | 'list' | 'quote'
export type MdEditorSelectionFormat = Readonly<{
  block: MdEditorBlockFormat
  bold: boolean
}>

export type UseMdEditorProps = {
  autoFocus?: boolean
  autoFocusPosition?: MdEditorFocusPosition
  defaultValue?: MdEditorContent
  disabled?: boolean
  onCancel?: () => void
  onChange?: (content: MdEditorContent) => void
  onSelectionFormatChange?: (format: MdEditorSelectionFormat | null) => void
  onSave?: (content: MdEditorContent) => void
  placeholder?: string
  value?: MdEditorContent
}

const EMPTY_SIMPLE_DOCUMENT: MdEditorContent = {
  type: 'doc',
  content: [{ type: 'paragraph' }],
}

function focusEditor(editor: Editor, position?: MdEditorFocusPosition) {
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

function serializeContent(content: MdEditorContent) {
  return JSON.stringify(content)
}

function selectionFormatsEqual(
  left: MdEditorSelectionFormat | null,
  right: MdEditorSelectionFormat | null,
) {
  return left?.block === right?.block && left?.bold === right?.bold
}

function resolveMdEditorSelectionFormat(
  editor: Editor,
): MdEditorSelectionFormat {
  let block: MdEditorBlockFormat = 'paragraph'

  if (editor.isActive('heading', { level: 1 })) {
    block = 'heading'
  } else if (editor.isActive('bulletList')) {
    block = 'list'
  } else if (editor.isActive('blockquote')) {
    block = 'quote'
  }

  return { block, bold: editor.isActive('bold') }
}

function setEditorBlockFormat(editor: Editor, format: MdEditorBlockFormat) {
  const headingActive = editor.isActive('heading', { level: 1 })
  const listActive = editor.isActive('bulletList')
  const quoteActive = editor.isActive('blockquote')
  const command = editor.chain().focus()

  if (format !== 'heading' && headingActive) command.setParagraph()
  if (format !== 'list' && listActive) command.toggleBulletList()
  if (format !== 'quote' && quoteActive) command.unsetBlockquote()

  if (format === 'heading' && !headingActive) command.setHeading({ level: 1 })
  if (format === 'list' && !listActive) command.toggleBulletList()
  if (format === 'quote' && !quoteActive) command.toggleBlockquote()

  return command.run()
}

export function useMdEditor({
  autoFocus = false,
  autoFocusPosition = 'end',
  defaultValue,
  disabled = false,
  onCancel,
  onChange,
  onSelectionFormatChange,
  onSave,
  placeholder,
  value,
}: UseMdEditorProps) {
  const isControlled = value !== undefined
  const [initialValue] = useState(() => value ?? defaultValue)
  const [isEmpty, setIsEmpty] = useState(initialValue === undefined)
  const [internalValue, setInternalValue] = useState(initialValue)
  const onChangeRef = useRef(onChange)
  const onSelectionFormatChangeRef = useRef(onSelectionFormatChange)
  const onSaveRef = useRef(onSave)
  const onCancelRef = useRef(onCancel)
  const disabledRef = useRef(disabled)
  const lastContentRef = useRef(initialValue === undefined ? '' : serializeContent(initialValue))
  const lastSelectionFormatRef = useRef<MdEditorSelectionFormat | null>(null)
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
    disabledRef.current = disabled
  }, [disabled, onCancel, onChange, onSave, onSelectionFormatChange])

  const emitSelectionFormat = useCallback((currentEditor: Editor | null) => {
    const nextFormat = currentEditor
      ? resolveMdEditorSelectionFormat(currentEditor)
      : null

    if (selectionFormatsEqual(lastSelectionFormatRef.current, nextFormat)) return

    lastSelectionFormatRef.current = nextFormat
    onSelectionFormatChangeRef.current?.(nextFormat)
  }, [])

  const emitContent = useCallback(
    (nextContent: MdEditorContent, nextIsEmpty: boolean) => {
      lastContentRef.current = serializeContent(nextContent)
      setIsEmpty(nextIsEmpty)

      if (!isControlled) {
        setInternalValue(nextContent)
      }

      onChangeRef.current?.(nextContent)
    },
    [isControlled],
  )

  const editor = useEditor({
    extensions: createMdEditorExtensions({
      placeholder,
      getInteraction: interactionStore.get,
    }),
    content: initialValue,
    editable: !disabled,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: 'md-editor__content weimo-markdown-content tiptap',
      },
    },
    onCreate: ({ editor: currentEditor }) => {
      lastContentRef.current = serializeContent(currentEditor.getJSON())
      setIsEmpty(currentEditor.isEmpty)
      emitSelectionFormat(currentEditor)
    },
    onTransaction: ({ editor: currentEditor }) => emitSelectionFormat(currentEditor),
    onUpdate: ({ editor: currentEditor }) => {
      emitContent(currentEditor.getJSON(), currentEditor.isEmpty)
    },
  })

  useEffect(() => {
    if (!editor) return

    emitSelectionFormat(editor)

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
    if (!editor || !isControlled) return

    const nextContent = value ?? EMPTY_SIMPLE_DOCUMENT
    const serialized = serializeContent(nextContent)

    if (serialized === lastContentRef.current) return

    editor.commands.setContent(nextContent, {
      emitUpdate: false,
    })

    lastContentRef.current = serialized
    setIsEmpty(editor.isEmpty)
  }, [editor, isControlled, value])

  const getContent = useCallback(() => {
    if (!editor) return internalValue ?? EMPTY_SIMPLE_DOCUMENT

    return editor.getJSON()
  }, [editor, internalValue])

  const clear = useCallback(() => {
    if (!editor || disabled) return

    editor.commands.clearContent()
    emitContent(editor.getJSON(), editor.isEmpty)
  }, [disabled, editor, emitContent])

  const focus = useCallback((position?: MdEditorFocusPosition) => {
    if (disabled) return

    if (editor) focusEditor(editor, position)
  }, [disabled, editor])

  const getSelectionFormat = useCallback(() => {
    if (!editor) return null

    return resolveMdEditorSelectionFormat(editor)
  }, [editor])

  const setBlockFormat = useCallback((format: MdEditorBlockFormat) => {
    if (!editor || disabled) return false

    return setEditorBlockFormat(editor, format)
  }, [disabled, editor])

  const toggleBlockFormat = useCallback((format: Exclude<MdEditorBlockFormat, 'paragraph'>) => {
    if (!editor || disabled) return false

    const currentFormat = resolveMdEditorSelectionFormat(editor).block

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
    isEmpty,
    setBlockFormat,
    setBold,
    toggleBlockFormat,
    toggleBold,
  }
}
