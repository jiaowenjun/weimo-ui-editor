import {
  forwardRef, useEffect, useId, useImperativeHandle, useLayoutEffect, useRef, useState,
  type CSSProperties, type KeyboardEvent, type ReactNode,
} from 'react'
import { flushSync } from 'react-dom'
import { EditorContent, useEditor } from '@tiptap/react'
import type { Editor, JSONContent } from '@tiptap/core'
import { Bold, Check, List, ListOrdered, Pencil, Quote, X } from 'lucide-react'
import { WdfDocument, toTiptap } from 'weimo-wdf'

import { WdfRender } from '../wdf-render/wdf-render'
import { createRichEditorExtensions } from '../rich-editor/rich-editor-extensions'
import { createMdfDraft, freshMdfEditorState } from './new-mdf-document'
import { lockMdfPage, showMdfDialog, waitMdfKeyboard, watchMdfViewport } from './new-mdf-dialog'
import {
  morphMdfDialog, snapshotMdfTransition, type NewMdfMotion,
} from './new-mdf-motion'

import 'weimo-ui-editor/styles/new-mdf-view.css'

export type { NewMdfMotion } from './new-mdf-motion'
export type { WdfDocument } from 'weimo-wdf'
export type NewMdfPresentation = 'auto' | 'inline' | 'dialog'
export type NewMdfViewHandle = {
  edit: () => void
  save: () => Promise<void>
  cancel: () => void
}
export type NewMdfViewProps = {
  document?: WdfDocument
  defaultDocument?: WdfDocument
  onCommit?: (document: WdfDocument) => void | Promise<void>
  onEditingChange?: (editing: boolean) => void
  heading?: ReactNode
  /** Accessible name, including when heading is not plain text. */
  label?: string
  placeholder?: string
  readOnly?: boolean
  presentation?: NewMdfPresentation
  /** Experimental comparison. Unsupported snapshot transitions use flow. */
  motion?: NewMdfMotion
  /** Ordinary content that follows the card and participates in both transitions. */
  following?: ReactNode
  className?: string
}

type Status = 'view' | 'preparing' | 'editing' | 'saving' | 'closing'
type Selection = { bold: boolean; block: string; empty: boolean }

function selectionOf(editor: Editor): Selection {
  let block = 'paragraph'
  if (editor.isActive('heading')) block = `heading-${editor.getAttributes('heading').level}`
  else if (editor.isActive('blockquote')) block = 'quote'
  else if (editor.isActive('bulletList')) block = 'bullet'
  else if (editor.isActive('orderedList')) block = 'ordered'
  return { bold: editor.isActive('bold'), block, empty: editor.isEmpty }
}

// Only the schema is shared with RichEditor. No WdfView session, layout, or animation code.
function MdfEditor({
  content, onReady, onSelection,
}: {
  content: JSONContent
  onReady: (editor: Editor) => void
  onSelection: (selection: Selection) => void
}) {
  const handlers = useRef({ onReady, onSelection })
  handlers.current = { onReady, onSelection }
  const editor = useEditor({
    content,
    editable: false,
    autofocus: false,
    immediatelyRender: typeof window !== 'undefined',
    shouldRerenderOnTransaction: false,
    extensions: createRichEditorExtensions({ getInteraction: () => ({ disabled: true }) }),
    editorProps: {
      attributes: {
        class: 'new-mdf-view__text rich-editor__content weimo-markdown-content',
        'aria-label': '编辑正文', 'aria-multiline': 'true',
      },
    },
    onTransaction: ({ editor: current }) => handlers.current.onSelection(selectionOf(current)),
  })
  useLayoutEffect(() => {
    if (editor) handlers.current.onReady(editor)
  }, [editor])
  return <EditorContent editor={editor} />
}

export const NewMdfView = forwardRef<NewMdfViewHandle, NewMdfViewProps>(
  function NewMdfView({
    document: suppliedDocument, defaultDocument, onCommit, onEditingChange,
    heading, label = '内容', placeholder = '写点什么……', readOnly = false,
    presentation = 'auto', motion = 'flow', following, className,
  }, ref) {
    const [localDocument, setLocalDocument] = useState(() => defaultDocument ?? WdfDocument.empty())
    const committed = suppliedDocument ?? localDocument
    const [status, setStatus] = useState<Status>('view')
    const [expanded, setExpanded] = useState(false)
    const [modal, setModal] = useState(false)
    const [initialContent, setInitialContent] = useState<JSONContent | null>(null)
    const [ready, setReady] = useState(false)
    const [error, setError] = useState('')
    const [returnDocument, setReturnDocument] = useState<WdfDocument | null>(null)
    const [selection, setSelection] = useState<Selection>({ bold: false, block: 'paragraph', empty: false })
    const id = `mdf-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
    const cardRef = useRef<HTMLDialogElement>(null)
    const slotRef = useRef<HTMLDivElement>(null)
    const destinationRef = useRef<HTMLDivElement>(null)
    const toolbarRef = useRef<HTMLDivElement>(null)
    const headingRef = useRef<HTMLDivElement>(null)
    const triggerRef = useRef<HTMLButtonElement>(null)
    const editorRef = useRef<Editor | null>(null)
    const draftRef = useRef<ReturnType<typeof createMdfDraft> | null>(null)
    const busy = useRef(false)
    const opening = useRef(false)
    const alive = useRef(true)
    const statusRef = useRef(status)
    const modalRef = useRef(false)
    const originalViewportHeight = useRef(0)
    const stopMotion = useRef<(() => void) | null>(null)
    const unlock = useRef<(() => void) | null>(null)
    const unwatch = useRef<(() => void) | null>(null)
    const latest = useRef({ committed, onCommit, onEditingChange, readOnly, presentation, motion })
    latest.current = { committed, onCommit, onEditingChange, readOnly, presentation, motion }
    statusRef.current = status

    useEffect(() => {
      alive.current = true
      return () => {
        alive.current = false
        draftRef.current?.dispose()
        stopMotion.current?.()
        unwatch.current?.()
        unlock.current?.()
      }
    }, [])

    useEffect(() => {
      const editor = editorRef.current
      if (status !== 'view' || !editor || editor.isDestroyed) return
      const next = toTiptap(committed)
      if (!editor.state.doc.eq(editor.schema.nodeFromJSON(next))) {
        editor.commands.setContent(next, { emitUpdate: false })
      }
    }, [committed, ready, status])

    function setStage(next: Status) {
      statusRef.current = next
      setStatus(next)
    }

    async function completeOpen(editor: Editor) {
      if (!alive.current || statusRef.current !== 'preparing' || opening.current) return
      const card = cardRef.current
      const slot = slotRef.current
      const toolbar = toolbarRef.current
      if (!card || !slot || !toolbar) return
      opening.current = true
      editor.view.updateState(freshMdfEditorState(editor.state, draftRef.current!.content))
      editor.view.dom.setAttribute('aria-readonly', 'false')
      setSelection(selectionOf(editor))
      const origin = card.getBoundingClientRect()
      const show = () => {
        if (!alive.current) return
        editor.setEditable(true)
        card.style.removeProperty('height')
        flushSync(() => {
          setReady(true)
          setExpanded(true)
          setStage('editing')
        })
      }
      if (modalRef.current) {
        slot.style.height = `${origin.height}px`
        originalViewportHeight.current = window.visualViewport?.height ?? window.innerHeight
        unlock.current = lockMdfPage()
        card.close()
        card.removeAttribute('data-returning')
        flushSync(() => setModal(true))
        show()
        showMdfDialog(card, headingRef.current!)
        unwatch.current = watchMdfViewport(card, () => {
          stopMotion.current?.()
          stopMotion.current = null
        })
        await morphMdfDialog(card, origin, true, (cancel) => { stopMotion.current = cancel })
      } else {
        // Entering edit mode does not summon the keyboard. Input starts with an explicit tap.
        editor.setEditable(true)
        flushSync(() => setReady(true))
        const transition = snapshotMdfTransition(
          { card, toolbar }, show, false, latest.current.motion === 'snapshot',
        )
        stopMotion.current = transition.cancel
        await transition.finished
      }
      stopMotion.current = null
      if (alive.current) busy.current = false
    }

    function begin() {
      if (busy.current || statusRef.current !== 'view' || latest.current.readOnly) return
      try {
        draftRef.current = createMdfDraft(latest.current.committed)
      } catch {
        setError('无法编辑这份内容，请检查 WDF 文档。')
        return
      }
      busy.current = true
      opening.current = false
      setError('')
      const mode = latest.current.presentation
      modalRef.current = mode === 'dialog' || (mode === 'auto' && window.matchMedia('(max-width: 640px)').matches)
      if (cardRef.current) cardRef.current.style.height = `${cardRef.current.getBoundingClientRect().height}px`
      flushSync(() => {
        setStage('preparing')
        if (!initialContent) setInitialContent(draftRef.current!.content)
      })
      latest.current.onEditingChange?.(true)
      if (editorRef.current && !editorRef.current.isDestroyed) void completeOpen(editorRef.current)
    }

    async function finish(next: WdfDocument, saved: boolean) {
      const card = cardRef.current
      const toolbar = toolbarRef.current
      const editor = editorRef.current
      if (!card || !toolbar || !editor || !alive.current) return
      setStage('closing')
      editor.setEditable(false)
      if (card.contains(document.activeElement)) (document.activeElement as HTMLElement)?.blur()
      const update = () => {
        if (!alive.current) return
        editor.commands.setContent(toTiptap(next), { emitUpdate: false })
        editor.view.dom.setAttribute('aria-readonly', 'true')
        flushSync(() => {
          if (saved && suppliedDocument === undefined) setLocalDocument(next)
          setExpanded(false)
        })
      }
      if (modalRef.current) {
        flushSync(() => setReturnDocument(next))
        await waitMdfKeyboard(originalViewportHeight.current, () => alive.current)
        if (!alive.current) return
        // Measure the final reading card at its actual page width, including edits.
        slotRef.current!.style.height = `${destinationRef.current!.getBoundingClientRect().height}px`
        const from = card.getBoundingClientRect()
        // Keyboard tracking is finished. Only the return morph owns geometry from here.
        unwatch.current?.()
        unwatch.current = null
        unlock.current?.()
        unlock.current = null
        const destination = destinationRef.current!.getBoundingClientRect()
        const toolbarHeight = toolbar.getBoundingClientRect().height
        update()
        // The return shows committed content, not a scrolled/cancelled draft.
        card.querySelector('.new-mdf-view__body')?.scrollTo({ top: 0, behavior: 'instant' })
        card.setAttribute('data-returning', 'true')
        await morphMdfDialog(card, destination, false, (cancel) => { stopMotion.current = cancel }, { from, toolbar, toolbarHeight })
        if (!alive.current) return
        card.close()
        flushSync(() => { setModal(false); setReturnDocument(null) })
        card.show()
        slotRef.current!.style.removeProperty('height')
      } else {
        const transition = snapshotMdfTransition(
          { card, toolbar }, update, true, latest.current.motion === 'snapshot',
        )
        stopMotion.current = transition.cancel
        await transition.finished
      }
      if (!alive.current) return
      stopMotion.current = null
      modalRef.current = false
      busy.current = false
      draftRef.current = null
      // Re-enable the reading trigger before restoring focus to it.
      flushSync(() => setStage('view'))
      latest.current.onEditingChange?.(false)
      triggerRef.current?.focus({ preventScroll: true })
    }

    async function save() {
      if (busy.current || statusRef.current !== 'editing' || !editorRef.current || !draftRef.current) return
      busy.current = true
      setError('')
      setStage('saving')
      editorRef.current.setEditable(false)
      let next: WdfDocument | null
      try {
        next = await draftRef.current.save(editorRef.current.getJSON(), latest.current.onCommit)
      } catch (cause) {
        if (!alive.current) return
        setError(cause instanceof Error ? cause.message : '保存失败，请重试。')
        editorRef.current?.setEditable(true)
        busy.current = false
        setStage('editing')
        return
      }
      if (next && alive.current) await finish(next, true)
    }

    function cancel() {
      if (busy.current || statusRef.current !== 'editing' || !draftRef.current?.cancel()) return
      busy.current = true
      setError('')
      void finish(latest.current.committed, false)
    }

    useImperativeHandle(ref, () => ({ edit: begin, save, cancel }))

    function keyDown(event: KeyboardEvent) {
      if (event.nativeEvent.isComposing || statusRef.current === 'view') return
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault()
        event.stopPropagation()
        void save()
      } else if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        cancel()
      }
    }

    function setBlock(value: string) {
      const editor = editorRef.current
      if (!editor || busy.current) return
      const command = editor.chain().focus()
      if (editor.isActive('bulletList')) command.toggleBulletList()
      if (editor.isActive('orderedList')) command.toggleOrderedList()
      if (editor.isActive('blockquote')) command.unsetBlockquote()
      command.setParagraph()
      if (value.startsWith('heading-')) command.setHeading({ level: Number(value.slice(-1)) as 1 | 2 | 3 | 4 | 5 | 6 })
      if (value === 'quote') command.setBlockquote()
      if (value === 'bullet') command.toggleBulletList()
      if (value === 'ordered') command.toggleOrderedList()
      command.run()
    }

    const named = (part: string): CSSProperties => motion === 'snapshot'
      ? { viewTransitionName: `${id}-${part}` } : {}
    const disabled = status !== 'editing'
    const snapshotDelay = status === 'closing' ? '60ms' : '0ms'
    return (
      <div className={['new-mdf-view', className].filter(Boolean).join(' ')} data-status={status} data-motion={motion}>
        <style>{`
          ::view-transition-group(${id}-card), ::view-transition-group(${id}-following) {
            animation-duration: 200ms; animation-timing-function: ease; animation-delay: ${snapshotDelay};
          }
          ::view-transition-group(${id}-toolbar) { overflow: clip; animation-duration: 200ms; animation-delay: ${snapshotDelay}; }
          ::view-transition-old(${id}-toolbar) { animation-duration: 60ms; }
          ::view-transition-new(${id}-toolbar) { animation-duration: 120ms; }
          ::view-transition-old(${id}-card), ::view-transition-new(${id}-card) {
            height: 100%; object-fit: none; object-position: top left; animation-duration: 100ms; mix-blend-mode: normal;
          }
          ::view-transition-old(${id}-following), ::view-transition-new(${id}-following) { animation: none; height: 100%; }
          @media (prefers-reduced-motion: reduce) {
            ::view-transition-group(${id}-card), ::view-transition-group(${id}-following), ::view-transition-group(${id}-toolbar) { animation-duration: 0s; animation-delay: 0s; }
          }
        `}</style>
        <div className="new-mdf-view__slot" ref={slotRef}>
          <dialog
            open ref={cardRef} className="new-mdf-view__card"
            role={modal ? 'dialog' : 'region'} aria-label={label}
            aria-modal={modal || undefined} aria-busy={status === 'saving' || status === 'preparing'}
            data-expanded={expanded} data-modal={modal}
            style={named('card')} onKeyDownCapture={keyDown}
            onCancel={(event) => { event.preventDefault(); if (!editorRef.current?.view.composing) cancel() }}
          >
            <header className="new-mdf-view__header">
              <div ref={headingRef} tabIndex={-1} className="new-mdf-view__heading">{heading ?? label}</div>
              <button type="button" className="new-mdf-view__button" aria-label="编辑内容" title="编辑内容"
                ref={triggerRef} onClick={begin} disabled={readOnly || status !== 'view'} hidden={expanded}>
                <Pencil aria-hidden="true" />
              </button>
            </header>
            <div className="new-mdf-view__body" data-ready={ready}>
              {!ready && <WdfRender content={committed} />}
              {initialContent && <div className="new-mdf-view__editor">
                <MdfEditor content={initialContent}
                  onReady={(editor) => {
                    editorRef.current = editor
                    // begin() normally opens synchronously after its mount commit.
                    queueMicrotask(() => { void completeOpen(editor) })
                  }}
                  onSelection={(next) => setSelection((previous) => previous.bold === next.bold && previous.block === next.block && previous.empty === next.empty ? previous : next)} />
              </div>}
              {(ready ? selection.empty : committed.root.content.every((block) => block.type === 'paragraph' && block.content.length === 0)) &&
                <span className="new-mdf-view__placeholder" aria-hidden="true">{placeholder}</span>}
            </div>
            <div className="new-mdf-view__toolbar" ref={toolbarRef} style={named('toolbar')}
              aria-hidden={!expanded} inert={!expanded || status === 'closing' ? true : undefined}>
              <div className="new-mdf-view__controls">
                <div className="new-mdf-view__formats" role="group" aria-label="文字格式">
                  <button type="button" className="new-mdf-view__button" aria-label="加粗" title="加粗"
                    aria-pressed={selection.bold} disabled={disabled}
                    onPointerDown={(event) => event.preventDefault()} onClick={() => editorRef.current?.chain().focus().toggleBold().run()}><Bold aria-hidden="true" /></button>
                  <select className="new-mdf-view__select" aria-label="段落样式" value={selection.block} disabled={disabled}
                    onChange={(event) => setBlock(event.target.value)}>
                    <option value="paragraph">正文</option>
                    {[1, 2, 3, 4, 5, 6].map((level) => <option key={level} value={`heading-${level}`}>标题 {level}</option>)}
                    <option value="quote">引用</option><option value="bullet">无序列表</option><option value="ordered">有序列表</option>
                  </select>
                  {([
                    ['quote', '引用', Quote], ['bullet', '无序列表', List], ['ordered', '有序列表', ListOrdered],
                  ] as const).map(([value, name, Icon]) => <button key={value} type="button" className="new-mdf-view__button new-mdf-view__optional"
                    aria-label={name} title={name} aria-pressed={selection.block === value} disabled={disabled}
                    onPointerDown={(event) => event.preventDefault()} onClick={() => setBlock(selection.block === value ? 'paragraph' : value)}><Icon aria-hidden="true" /></button>)}
                </div>
                <div className="new-mdf-view__actions" role="group" aria-label="编辑操作">
                  <span className="new-mdf-view__saving" role="status">{status === 'saving' ? '保存中…' : ''}</span>
                  <button type="button" className="new-mdf-view__button" aria-label="取消编辑" title="取消编辑" disabled={disabled} onClick={cancel}><X aria-hidden="true" /></button>
                  <button type="button" className="new-mdf-view__button" aria-label="保存内容" title="保存内容" disabled={disabled} onClick={() => void save()}><Check aria-hidden="true" /></button>
                </div>
              </div>
            </div>
            {error && <p className="new-mdf-view__error" role="alert">{error}</p>}
          </dialog>
          {modal && <div ref={destinationRef} className="new-mdf-view__card new-mdf-view__destination" aria-hidden="true" inert>
            <header className="new-mdf-view__header"><div className="new-mdf-view__heading">{heading ?? label}</div><span className="new-mdf-view__button" /></header>
            <div className="new-mdf-view__body"><WdfRender content={returnDocument ?? committed} /></div>
          </div>}
        </div>
        {following && <div className="new-mdf-view__following" style={named('following')}>{following}</div>}
      </div>
    )
  },
)

NewMdfView.displayName = 'NewMdfView'
