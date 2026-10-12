import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from 'react'
import { Bold, Heading1, List, Quote } from 'lucide-react'

import { cn } from 'weimo-ui-core/lib/utils'
import { GhostIconButton } from 'weimo-ui-core/components/ghost-icon-button'
import { TextButton } from 'weimo-ui-core/components/text-button'
import {
  Dialog,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from 'weimo-ui-core/components/coss/dialog'
import {
  RichEditor,
  type RichEditorBlockFormat,
  type RichEditorContent,
  type RichEditorFocusPosition,
  type RichEditorHandle,
  type RichEditorProps,
  type RichEditorSelectionFormat,
} from '../rich-editor/rich-editor'
import { useVisualViewportRect } from './use-visual-viewport'

import 'weimo-ui-editor/styles/rich-editor-dialog.css'

export type {
  RichEditorBlockFormat,
  RichEditorContent,
  RichEditorFocusPosition,
  RichEditorSelectionFormat,
} from '../rich-editor/rich-editor'

export type RichEditorDialogProps = Omit<
  ComponentPropsWithoutRef<'div'>,
  'children' | 'title' | 'onChange'
> & {
  /** Controlled open state. Closing discards the session draft unless it was saved. */
  open: boolean
  onOpenChange: (open: boolean) => void
  title?: ReactNode
  /** Initial content of each editing session (snapshot, WdfView-style). */
  value?: RichEditorContent
  defaultValue?: RichEditorContent
  /** Called with the session draft when saving (save button or Cmd/Ctrl+S). */
  onSave?: (content: RichEditorContent) => void
  /** Called whenever the dialog closes without saving (cancel, Esc, backdrop). */
  onCancel?: () => void
  saveLabel?: ReactNode
  cancelLabel?: ReactNode
  editorProps?: Omit<
    RichEditorProps,
    'defaultValue' | 'value' | 'onChange' | 'onSave'
  >
}

export type RichEditorDialogHandle = {
  clear: () => void
  focus: (position?: RichEditorFocusPosition) => void
  getContent: () => RichEditorContent | null
  getSelectionFormat: () => RichEditorSelectionFormat | null
  setBlockFormat: (format: RichEditorBlockFormat) => boolean
  setBold: (active: boolean) => boolean
  toggleBlockFormat: (
    format: Exclude<RichEditorBlockFormat, 'paragraph'>,
  ) => boolean
  toggleBold: () => boolean
}

const EMPTY_EDITOR_DOCUMENT: RichEditorContent = {
  type: 'doc',
  content: [{ type: 'paragraph' }],
}

export const RichEditorDialog = forwardRef<
  RichEditorDialogHandle,
  RichEditorDialogProps
>(function RichEditorDialog(
  {
    cancelLabel = '取消',
    className,
    defaultValue,
    editorProps,
    onCancel,
    onOpenChange,
    onSave,
    open,
    saveLabel = '保存',
    title,
    value,
  },
  ref,
) {
  const editorRef = useRef<RichEditorHandle | null>(null)
  // Distinguishes an intentional save-close from every other close path so
  // onCancel fires exactly once per discarded session.
  const savedCloseRef = useRef(false)
  const [selectionFormat, setSelectionFormat] =
    useState<RichEditorSelectionFormat | null>(null)
  const editorContent = useMemo(() => value ?? defaultValue, [value, defaultValue])
  const editorAutoFocus = editorProps?.autoFocus ?? true
  const viewportRect = useVisualViewportRect(open)

  // 键盘避让变量挂在文档根上:弹窗(popup)与其定位容器(viewport,父级
  // 元素,core 不透传 style)都要消费,自定义属性只能沿树向下继承。
  useEffect(() => {
    if (!viewportRect) return

    const root = document.documentElement
    root.style.setProperty(
      '--rich-editor-dialog-vv-h',
      `${viewportRect.height}px`,
    )
    root.style.setProperty(
      '--rich-editor-dialog-vv-top',
      `${viewportRect.offsetTop}px`,
    )

    return () => {
      root.style.removeProperty('--rich-editor-dialog-vv-h')
      root.style.removeProperty('--rich-editor-dialog-vv-top')
    }
  }, [viewportRect])

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next && !savedCloseRef.current) onCancel?.()

      savedCloseRef.current = false
      onOpenChange(next)
    },
    [onCancel, onOpenChange],
  )

  const handleSave = useCallback(() => {
    savedCloseRef.current = true
    onSave?.(editorRef.current?.getContent() ?? editorContent ?? EMPTY_EDITOR_DOCUMENT)

    handleOpenChange(false)
  }, [editorContent, handleOpenChange, onSave])

  const handleEditorSave = useCallback(
    (content: RichEditorContent) => {
      savedCloseRef.current = true
      onSave?.(content)

      handleOpenChange(false)
    },
    [handleOpenChange, onSave],
  )

  const handleSelectionFormatChange = useCallback(
    (format: RichEditorSelectionFormat | null) => {
      setSelectionFormat(format)
      editorProps?.onSelectionFormatChange?.(format)
    },
    [editorProps],
  )

  useImperativeHandle(
    ref,
    () => ({
      clear: () => editorRef.current?.clear(),
      focus: (position) => editorRef.current?.focus(position),
      getContent: () => editorRef.current?.getContent() ?? null,
      getSelectionFormat: () => editorRef.current?.getSelectionFormat() ?? null,
      setBlockFormat: (format) =>
        editorRef.current?.setBlockFormat(format) ?? false,
      setBold: (active) => editorRef.current?.setBold(active) ?? false,
      toggleBlockFormat: (format) =>
        editorRef.current?.toggleBlockFormat(format) ?? false,
      toggleBold: () => editorRef.current?.toggleBold() ?? false,
    }),
    [],
  )

  function runToolbarAction(action: () => unknown) {
    return () => {
      action()
    }
  }

  const toolbarButtons = [
    {
      key: 'bold',
      label: '切换粗体',
      icon: <Bold />,
      active: selectionFormat?.bold === true,
      action: () => editorRef.current?.toggleBold(),
    },
    {
      key: 'heading',
      label: '切换标题',
      icon: <Heading1 />,
      active: selectionFormat?.block === 'heading',
      action: () => editorRef.current?.toggleBlockFormat('heading'),
    },
    {
      key: 'list',
      label: '切换无序列表',
      icon: <List />,
      active: selectionFormat?.block === 'list',
      action: () => editorRef.current?.toggleBlockFormat('list'),
    },
    {
      key: 'quote',
      label: '切换引用',
      icon: <Quote />,
      active: selectionFormat?.block === 'quote',
      action: () => editorRef.current?.toggleBlockFormat('quote'),
    },
  ] as const

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogPopup className={cn('rich-editor-dialog__popup', className)}>
        <DialogHeader className="rich-editor-dialog__header">
          <TextButton
            className="rich-editor-dialog__cancel"
            onClick={() => handleOpenChange(false)}
          >
            {cancelLabel}
          </TextButton>
          <DialogTitle className="rich-editor-dialog__title">
            {title ?? '编辑'}
          </DialogTitle>
          <TextButton
            className="rich-editor-dialog__save"
            onClick={handleSave}
          >
            {saveLabel}
          </TextButton>
        </DialogHeader>
        <DialogPanel className="rich-editor-dialog__panel">
          <RichEditor
            {...editorProps}
            autoFocus={editorAutoFocus}
            defaultValue={editorContent}
            onSelectionFormatChange={handleSelectionFormatChange}
            onSave={handleEditorSave}
            ref={editorRef}
          />
        </DialogPanel>
        <div
          aria-label="编辑工具栏"
          className="rich-editor-dialog__toolbar"
          role="group"
        >
          {toolbarButtons.map((button) => (
            <GhostIconButton
              active={button.active}
              aria-label={button.label}
              disabled={!selectionFormat}
              key={button.key}
              // 保持编辑器焦点:点工具栏不收起软键盘,命令内部 chain().focus() 复位光标
              onPointerDown={(event) => event.preventDefault()}
              onClick={runToolbarAction(button.action)}
              size="sm"
            >
              {button.icon}
            </GhostIconButton>
          ))}
        </div>
      </DialogPopup>
    </Dialog>
  )
})

RichEditorDialog.displayName = 'RichEditorDialog'
