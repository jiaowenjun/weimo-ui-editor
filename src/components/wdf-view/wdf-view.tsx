import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
} from 'react'
import {
  fromTiptap,
  WdfDocument,
  type Diagnostic,
} from 'weimo-wdf'

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

export type { Diagnostic, WdfDocument } from 'weimo-wdf'

export type WdfViewMode = 'view' | 'edit'
export type WdfViewConversionSource = 'change' | 'save'

export type WdfViewProps = Omit<
  ComponentPropsWithoutRef<'div'>,
  'children' | 'onChange'
> & {
  /**
   * The requested presentation mode. An `edit` to `view` transition commits
   * the current editing-session draft before the editor is unmounted.
   */
  mode: WdfViewMode
  /**
   * The committed WDF value. Changes received during an editing session do
   * not replace that session's local draft.
   */
  value?: WdfDocument
  defaultValue?: WdfDocument
  /** Called once with the committed WDF draft when an editing session exits. */
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
    // Stage mode changes so an exiting editor remains mounted through the
    // layout phase in which its final local draft is read and committed.
    const [renderedMode, setRenderedMode] = useState(mode)
    const editorContent = useMemo(
      () => toWdfEditorContent(document),
      [document],
    )
    // Entering an editing session implies focus unless the caller opts out
    // through editorProps; RichEditor's own default is a plain `false`.
    const editorAutoFocus = editorProps?.autoFocus ?? mode === 'edit'
    const editorAutoFocusPosition = editorProps?.autoFocusPosition ?? 'end'

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

    const handleEditorSave = useCallback(
      (content: Parameters<typeof fromTiptap>[0]) => {
        const document = convertEditorContent(content, 'save')

        if (document) onSave?.(document)
      },
      [convertEditorContent, onSave],
    )

    useLayoutEffect(() => {
      if (renderedMode === mode) return

      if (renderedMode === 'edit' && mode === 'view') {
        const content = editorRef.current?.getContent() ?? editorContent
        const nextDocument = convertEditorContent(content, 'change')

        if (nextDocument) {
          if (!isControlled) setInternalValue(nextDocument)
          onChange?.(nextDocument)
        }
      }

      setRenderedMode(mode)
    }, [
      convertEditorContent,
      editorContent,
      isControlled,
      mode,
      onChange,
      renderedMode,
    ])

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
          if (renderedMode === 'edit') {
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
      [document, renderedMode],
    )

    return (
      <div
        {...props}
        className={cn('wdf-view', className)}
        data-mode={renderedMode}
      >
        {renderedMode === 'edit' ? (
          <RichEditor
            {...editorProps}
            autoFocus={editorAutoFocus}
            autoFocusPosition={editorAutoFocusPosition}
            defaultValue={editorContent}
            onSave={handleEditorSave}
            ref={editorRef}
          />
        ) : (
          <WdfRender {...renderProps} content={document} ref={renderRef} />
        )}
      </div>
    )
  },
)

WdfView.displayName = 'WdfView'
