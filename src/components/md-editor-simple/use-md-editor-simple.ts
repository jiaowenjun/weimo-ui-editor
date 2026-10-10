import { useCallback, useEffect, useRef, useState } from 'react'
import { useEditor } from '@tiptap/react'
import type { Editor, JSONContent } from '@tiptap/core'

import type { MdEditorFocusPosition } from '../md-editor/md-editor-types'
import { focusEditor } from '../md-editor/use-md-editor'
import { createMdEditorSimpleExtensions } from './md-editor-simple-extensions'

export type MdEditorSimpleContent = JSONContent
export type MdEditorSimpleBlockFormat = 'paragraph' | 'heading' | 'list' | 'quote'
export type MdEditorSimpleSelectionFormat = Readonly<{
  block: MdEditorSimpleBlockFormat
  bold: boolean
}>

export type UseMdEditorSimpleProps = {
  autoFocus?: boolean
  autoFocusPosition?: MdEditorFocusPosition
  defaultValue?: MdEditorSimpleContent
  disabled?: boolean
  onCancel?: () => void
  onChange?: (content: MdEditorSimpleContent) => void
  onSelectionFormatChange?: (format: MdEditorSimpleSelectionFormat | null) => void
  onSave?: (content: MdEditorSimpleContent) => void
  placeholder?: string
  value?: MdEditorSimpleContent
}

const EMPTY_SIMPLE_DOCUMENT: MdEditorSimpleContent = {
  type: 'doc',
  content: [{ type: 'paragraph' }],
}

function serializeContent(content: MdEditorSimpleContent) {
  return JSON.stringify(content)
}

function selectionFormatsEqual(
  left: MdEditorSimpleSelectionFormat | null,
  right: MdEditorSimpleSelectionFormat | null,
) {
  return left?.block === right?.block && left?.bold === right?.bold
}

function resolveMdEditorSimpleSelectionFormat(
  editor: Editor,
): MdEditorSimpleSelectionFormat {
  let block: MdEditorSimpleBlockFormat = 'paragraph'

  if (editor.isActive('heading', { level: 1 })) {
    block = 'heading'
  } else if (editor.isActive('bulletList')) {
    block = 'list'
  } else if (editor.isActive('blockquote')) {
    block = 'quote'
  }

  return { block, bold: editor.isActive('bold') }
}

function setEditorBlockFormat(editor: Editor, format: MdEditorSimpleBlockFormat) {
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

export function useMdEditorSimple({
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
}: UseMdEditorSimpleProps) {
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
  const lastSelectionFormatRef = useRef<MdEditorSimpleSelectionFormat | null>(null)
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
      ? resolveMdEditorSimpleSelectionFormat(currentEditor)
      : null

    if (selectionFormatsEqual(lastSelectionFormatRef.current, nextFormat)) return

    lastSelectionFormatRef.current = nextFormat
    onSelectionFormatChangeRef.current?.(nextFormat)
  }, [])

  const emitContent = useCallback(
    (nextContent: MdEditorSimpleContent, nextIsEmpty: boolean) => {
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
    extensions: createMdEditorSimpleExtensions({
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

    return resolveMdEditorSimpleSelectionFormat(editor)
  }, [editor])

  const setBlockFormat = useCallback((format: MdEditorSimpleBlockFormat) => {
    if (!editor || disabled) return false

    return setEditorBlockFormat(editor, format)
  }, [disabled, editor])

  const toggleBlockFormat = useCallback((format: Exclude<MdEditorSimpleBlockFormat, 'paragraph'>) => {
    if (!editor || disabled) return false

    const currentFormat = resolveMdEditorSimpleSelectionFormat(editor).block

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
