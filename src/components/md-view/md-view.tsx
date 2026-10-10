import {
  Component,
  createRef,
  forwardRef,
  lazy,
  Suspense,
  useEffect,
  useImperativeHandle,
  useRef,
} from 'react'
import type { ComponentPropsWithoutRef, CSSProperties } from 'react'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import remarkParse from 'remark-parse'
import remarkStringify from 'remark-stringify'
import { unified } from 'unified'

import type { MdEditorHandle, MdEditorProps } from 'weimo-ui-markdown/components/md-editor'
import { MdRender, type MdRenderProps } from 'weimo-ui-markdown/components/md-render'
import {
  normalizeCenteredQuoteSyntax,
  restoreCenteredQuoteSyntax,
} from '../markdown/centered-quote'
import { cn } from 'weimo-ui-core/lib/utils'

import 'weimo-ui-markdown/styles/md-view.css'

const MdEditor = lazy(() =>
  import('weimo-ui-markdown/components/md-editor').then((module) => ({
    default: module.MdEditor,
  })),
)

export type MdViewMode = 'view' | 'edit'
/* --md-view-editor-bottom-safe-area 是 MdView 的公开布局交接 token:
   MdView 在编辑器根内联注入,宿主与消费方(如 weimo-ui-card 的编辑视口)
   在后代选择器中经 var() 消费,为末行下方预留底部安全区。 */
type MdViewStyle = CSSProperties & Record<'--md-view-editor-bottom-safe-area', string>

type MdViewRootProps = ComponentPropsWithoutRef<'div'> & { mode: MdViewMode }

class MdViewRoot extends Component<MdViewRootProps, Record<string, never>, boolean> {
  private rootRef = createRef<HTMLDivElement>()
  private previousMinHeight: string | null = null
  private editorReady = false

  getSnapshotBeforeUpdate(previousProps: MdViewRootProps) {
    const root = this.rootRef.current

    if (!root || previousProps.mode === this.props.mode) return false

    // Hold height before either subtree is removed. Entry also needs protection
    // across the lazy import and Tiptap initialization, not just this commit.
    // A layout effect runs too late to protect this part of the commit.
    this.previousMinHeight ??= root.style.minHeight
    root.style.minHeight = window.getComputedStyle(root).height
    return true
  }

  componentDidUpdate(
    _previousProps: MdViewRootProps,
    _previousState: Record<string, never>,
    modeChanged: boolean,
  ) {
    if (!modeChanged) return
    // Exits and already-preloaded entries must be unlocked before Card measures.
    if (this.props.mode === 'view' || this.editorReady) this.releaseHeight()
  }

  setEditorReady(ready: boolean) {
    this.editorReady = ready
    if (!ready || this.previousMinHeight === null) return

    // Wait for the whole initialization commit, including StrictMode's effect
    // replay, before releasing. This still precedes the editor's focus frame.
    queueMicrotask(() => {
      if (this.props.mode === 'edit' && this.editorReady) this.releaseHeight()
    })
  }

  private releaseHeight() {
    const root = this.rootRef.current
    const previousMinHeight = this.previousMinHeight
    if (previousMinHeight === null || !root) return

    // Flush the mounted content's layout while still protected: Safari can
    // otherwise apply a pending scroll clamp from the empty intermediate layout.
    root.getBoundingClientRect()
    root.style.minHeight = previousMinHeight
    this.previousMinHeight = null
  }

  render() {
    const { mode, ...props } = this.props
    return <div {...props} data-mode={mode} ref={this.rootRef} />
  }
}

const mdViewMarkdownFormatter = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkMath)
  .use(remarkStringify, {
    bullet: '-',
    fences: true,
  })

function formatMdViewMarkdown(markdown: string) {
  const normalizedMarkdown = normalizeCenteredQuoteSyntax(markdown)
  const formattedMarkdown = String(
    mdViewMarkdownFormatter.processSync(normalizedMarkdown),
  )

  return restoreCenteredQuoteSyntax(formattedMarkdown).replace(/\n$/, '')
}

export type MdViewHandle = {
  convertSelectionToInlineMath: MdEditorHandle['convertSelectionToInlineMath']
  focus: MdEditorHandle['focus']
  formatContent: MdEditorHandle['formatContent']
  getContentHeight: () => number
}

export type MdViewProps = {
  mode: MdViewMode
  value: string
  onChange?: (markdown: string) => void
  className?: string
  editorBottomSafeArea?: number | string
  preloadEditor?: boolean
  renderProps?: Omit<MdRenderProps, 'content' | 'className'>
  editorProps?: Omit<MdEditorProps, 'value' | 'onChange' | 'className'>
}

export const MdView = forwardRef<MdViewHandle, MdViewProps>(function MdView(
  {
    className,
    editorBottomSafeArea = 100,
    editorProps,
    mode,
    onChange,
    preloadEditor = false,
    renderProps,
    value,
  },
  ref,
) {
  const rootRef = useRef<MdViewRoot | null>(null)
  const editorRef = useRef<MdEditorHandle | null>(null)
  const renderRef = useRef<HTMLDivElement | null>(null)
  const previousModeRef = useRef<MdViewMode>(mode)
  const showEditor = mode === 'edit'
  const shouldMountEditor = showEditor || preloadEditor
  const editorAutoFocus = editorProps?.autoFocus ?? showEditor
  const editorAutoFocusPosition = editorProps?.autoFocusPosition ?? 'end'
  const editorImageRenderer = editorProps?.renderImage ?? renderProps?.renderImage
  const editorImageSrcResolver = editorProps?.resolveImageSrc ?? renderProps?.resolveImageSrc

  const handleEditorChange: NonNullable<MdEditorProps['onEditorChange']> = (editor) => {
    rootRef.current?.setEditorReady(editor !== null)
    editorProps?.onEditorChange?.(editor)
  }

  useEffect(() => {
    const previousMode = previousModeRef.current
    previousModeRef.current = mode

    if (previousMode !== 'edit' || mode !== 'view' || !onChange) return

    const formattedMarkdown = formatMdViewMarkdown(value)

    if (formattedMarkdown !== value) {
      onChange(formattedMarkdown)
    }
  }, [mode, onChange, value])

  function measureRenderContentHeight() {
    const render = renderRef.current

    if (!render) return 0

    return Math.max(
      render.scrollHeight,
      render.getBoundingClientRect().height,
    )
  }

  useImperativeHandle(
    ref,
    () => ({
      convertSelectionToInlineMath: () =>
        editorRef.current?.convertSelectionToInlineMath() ?? false,
      focus: (position) => editorRef.current?.focus(position),
      formatContent: (options) =>
        editorRef.current?.formatContent(options) ?? value,
      getContentHeight: () =>
        showEditor
          ? editorRef.current?.getContentHeight() ?? 0
          : measureRenderContentHeight(),
    }),
    [showEditor, value],
  )

  const resolvedEditorBottomSafeArea =
    typeof editorBottomSafeArea === 'number'
      ? `${editorBottomSafeArea}px`
      : editorBottomSafeArea
  const editorStyle: MdViewStyle | undefined =
    showEditor
      ? ({
          '--md-view-editor-bottom-safe-area': resolvedEditorBottomSafeArea,
        } satisfies MdViewStyle)
      : undefined

  return (
    <MdViewRoot
      ref={rootRef}
      mode={mode}
      className={cn('md-view', className)}
      data-preloading-editor={preloadEditor && !showEditor ? 'true' : undefined}
      style={editorStyle}
    >
      {shouldMountEditor ? (
        <div
          aria-hidden={!showEditor}
          className="md-view__editor-layer"
          hidden={!showEditor}
        >
          <Suspense fallback={null}>
            <MdEditor
              ref={editorRef}
              value={value}
              onChange={onChange}
              {...editorProps}
              onEditorChange={handleEditorChange}
              autoFocus={editorAutoFocus}
              autoFocusPosition={editorAutoFocusPosition}
              renderImage={editorImageRenderer}
              resolveImageSrc={editorImageSrcResolver}
            />
          </Suspense>
        </div>
      ) : null}
      {showEditor ? null : (
        <MdRender ref={renderRef} content={value} {...renderProps} />
      )}
    </MdViewRoot>
  )
})

MdView.displayName = 'MdView'
