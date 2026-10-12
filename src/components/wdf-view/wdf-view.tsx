import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
} from 'react'
import {
  fromTiptap,
  WdfDocument,
  type Diagnostic,
} from 'weimo-doc'

import { cn } from 'weimo-ui-core/lib/utils'
import {
  RichEditor,
  type RichEditorBlockFormat,
  type RichEditorFocusPosition,
  type RichEditorHandle,
  type RichEditorProps,
  type RichEditorSelectionFormat,
} from '../rich-editor/rich-editor'
import {
  WdfRender,
  type WdfRenderProps,
} from '../wdf-render/wdf-render'
import { toWdfEditorContent } from './wdf-editor-content'

export type { Diagnostic, WdfDocument } from 'weimo-doc'

export type WdfViewMode = 'view' | 'edit'
export type WdfViewConversionSource = 'change' | 'save'

export type WdfViewProps = Omit<
  ComponentPropsWithoutRef<'div'>,
  'children' | 'onChange'
> & {
  mode: WdfViewMode
  value?: WdfDocument
  defaultValue?: WdfDocument
  onChange?: (document: WdfDocument) => void
  onSave?: (document: WdfDocument) => void
  onConversionError?: (
    diagnostics: Diagnostic[],
    source: WdfViewConversionSource,
  ) => void
  renderProps?: Omit<WdfRenderProps, 'content'>
  editorProps?: Omit<
    RichEditorProps,
    'defaultValue' | 'onChange' | 'onSave' | 'value'
  >
}

export type WdfViewHandle = {
  clear: () => void
  focus: (position?: RichEditorFocusPosition) => void
  getContent: () => WdfDocument
  getContentHeight: () => number
  getSelectionFormat: () => RichEditorSelectionFormat | null
  setBlockFormat: (format: RichEditorBlockFormat) => boolean
  setBold: (active: boolean) => boolean
  toggleBlockFormat: (
    format: Exclude<RichEditorBlockFormat, 'paragraph'>,
  ) => boolean
  toggleBold: () => boolean
}

export const WdfView = forwardRef<WdfViewHandle, WdfViewProps>(
  function WdfView(
    {
      className,
      defaultValue,
      editorProps,
      mode,
      onChange,
      onConversionError,
      onSave,
      renderProps,
      value,
      ...props
    },
    ref,
  ) {
    const editorRef = useRef<RichEditorHandle | null>(null)
    const renderRef = useRef<HTMLDivElement | null>(null)
    const isControlled = value !== undefined
    const [internalValue, setInternalValue] = useState(
      () => value ?? defaultValue ?? WdfDocument.empty(),
    )
    const document = isControlled ? value : internalValue
    const editorContent = useMemo(
      () => toWdfEditorContent(document),
      [document],
    )

    const convertEditorContent = useCallback(
      (
        content: Parameters<typeof fromTiptap>[0],
        source: WdfViewConversionSource,
      ) => {
        const result = fromTiptap(content)

        if (!result.ok) {
          onConversionError?.(result.diagnostics, source)
          return null
        }

        return result.value
      },
      [onConversionError],
    )

    const handleEditorChange = useCallback(
      (content: Parameters<typeof fromTiptap>[0]) => {
        const document = convertEditorContent(content, 'change')

        if (!document) return

        if (!isControlled) setInternalValue(document)
        onChange?.(document)
      },
      [convertEditorContent, isControlled, onChange],
    )

    const handleEditorSave = useCallback(
      (content: Parameters<typeof fromTiptap>[0]) => {
        const document = convertEditorContent(content, 'save')

        if (document) onSave?.(document)
      },
      [convertEditorContent, onSave],
    )

    useImperativeHandle(
      ref,
      () => ({
        clear: () => editorRef.current?.clear(),
        focus: (position) => editorRef.current?.focus(position),
        getContent: () => {
          const currentContent = editorRef.current?.getContent()

          if (!currentContent) return document

          const result = fromTiptap(currentContent)

          return result.ok ? result.value : document
        },
        getContentHeight: () => {
          if (mode === 'edit') {
            return editorRef.current?.getContentHeight() ?? 0
          }

          const render = renderRef.current

          if (!render) return 0

          return Math.max(
            render.scrollHeight,
            render.getBoundingClientRect().height,
          )
        },
        getSelectionFormat: () =>
          editorRef.current?.getSelectionFormat() ?? null,
        setBlockFormat: (format) =>
          editorRef.current?.setBlockFormat(format) ?? false,
        setBold: (active) => editorRef.current?.setBold(active) ?? false,
        toggleBlockFormat: (format) =>
          editorRef.current?.toggleBlockFormat(format) ?? false,
        toggleBold: () => editorRef.current?.toggleBold() ?? false,
      }),
      [document, mode],
    )

    return (
      <div
        {...props}
        className={cn('wdf-view', className)}
        data-mode={mode}
      >
        {mode === 'edit' ? (
          <RichEditor
            {...editorProps}
            onChange={handleEditorChange}
            onSave={handleEditorSave}
            ref={editorRef}
            value={editorContent}
          />
        ) : (
          <WdfRender {...renderProps} content={document} ref={renderRef} />
        )}
      </div>
    )
  },
)

WdfView.displayName = 'WdfView'
