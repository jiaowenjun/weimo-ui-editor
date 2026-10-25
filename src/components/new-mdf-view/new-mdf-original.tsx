import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import type { JSONContent } from '@tiptap/core'

import { WdfView, type WdfViewHandle, type WdfViewMode } from '../wdf-view/wdf-view'
import { WdfViewBridgeContext } from '../wdf-view/wdf-view-bridge'
import { createMdfDraft } from './new-mdf-document'
import type { NewMdfViewHandle, NewMdfViewProps } from './new-mdf-view'

/** Original WdfView owns every mobile pixel and transition. Only adapt the data API. */
export const NewMdfOriginal = forwardRef<NewMdfViewHandle, NewMdfViewProps>(
  function NewMdfOriginal({
    document, onCommit, onEditingChange, heading, label = '内容',
    placeholder = '写点什么……', readOnly = false, following, className,
  }, ref) {
    const view = useRef<WdfViewHandle>(null)
    const cancelRef = useRef<(() => void) | null>(null)
    const draft = useRef<ReturnType<typeof createMdfDraft> | null>(null)
    const pending = useRef<Promise<void> | null>(null)
    const returned = useRef<(() => void) | null>(null)
    const [mode, setMode] = useState<WdfViewMode>('view')
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')
    const alive = useRef(true)
    const latest = useRef({ document, onCommit, onEditingChange, readOnly })
    latest.current = { document, onCommit, onEditingChange, readOnly }

    useEffect(() => {
      alive.current = true
      return () => {
        alive.current = false
        draft.current?.dispose()
        returned.current?.()
        returned.current = null
      }
    }, [])

    function changeMode(next: WdfViewMode) {
      if (next === 'edit') {
        if (latest.current.readOnly || draft.current) return
        try { draft.current = createMdfDraft(latest.current.document!) } catch {
          setError('无法编辑这份内容，请检查 WDF 文档。')
          return
        }
      } else {
        draft.current?.dispose()
        draft.current = null
      }
      setError('')
      setMode(next)
      latest.current.onEditingChange?.(next === 'edit')
      if (next === 'view') {
        returned.current?.()
        returned.current = null
      }
    }

    function save(content: JSONContent, close: () => void) {
      const session = draft.current
      if (!session || pending.current) return
      setError('')
      setSaving(true)
      pending.current = (async () => {
        try {
          const next = await session.save(content, latest.current.onCommit)
          if (!next || !alive.current || draft.current !== session) return
          // Flush the caller's committed WDF backing before the original close measurement.
          flushSync(() => setSaving(false))
          // save() resolves after the original settle-to-view, never on a guessed timer.
          await new Promise<void>((resolve) => { returned.current = resolve; close() })
        } catch (cause) {
          if (alive.current && draft.current === session) {
            setError(cause instanceof Error ? cause.message : '保存失败，请重试。')
          }
        } finally {
          pending.current = null
          if (alive.current) setSaving(false)
        }
      })()
    }

    useImperativeHandle(ref, () => ({
      edit: () => view.current?.open(),
      save: async () => { view.current?.close(); await pending.current },
      cancel: () => { if (!pending.current) cancelRef.current?.() },
    }))

    return <>
      <WdfViewBridgeContext.Provider value={{ readOnly, saving, error, cancelRef, save }}>
        <WdfView
          ref={view} value={document} mode={mode} onModeChange={changeMode}
          title={heading ?? label} aria-label={label} className={className}
          editStyle="dialog" autoFocus={false} editorProps={{ placeholder }}
        />
      </WdfViewBridgeContext.Provider>
      {following}
    </>
  },
)
