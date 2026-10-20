import { useCallback, useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { Pencil } from 'lucide-react'

import { ComponentPreviewCard } from 'weimo-ui-core/components/component-preview-card'
import { GhostIconButton } from 'weimo-ui-core/components/ghost-icon-button'
import {
  RichEditor,
  type RichEditorContent,
} from 'weimo-ui-editor/components/rich-editor'
import {
  RichEditorDialog,
  type RichEditorDialogHandle,
} from 'weimo-ui-editor/components/rich-editor-dialog'
import type { ComponentDefinition } from '../../component-docs'

const dialogSample: RichEditorContent = {
  type: 'doc',
  content: [
    {
      type: 'heading',
      attrs: { level: 2 },
      content: [{ type: 'text', text: '移动端编辑会话' }],
    },
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: '点击右上角铅笔打开弹窗;工具栏位于对话框底部,' },
        { type: 'text', marks: [{ type: 'bold' }], text: '紧贴软键盘上方' },
        { type: 'text', text: '。' },
      ],
    },
    {
      type: 'bulletList',
      content: [
        {
          type: 'listItem',
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: '保存:提交草稿' }] },
          ],
        },
        {
          type: 'listItem',
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: '取消/Esc/遮罩:放弃草稿' }] },
          ],
        },
      ],
    },
  ],
}

/*
 * SPIKE(仅 site demo):验证 View Transitions + 受控 open + Tiptap ready 时序。
 * 所有逻辑都留在演示文件里,验证通过后再决定如何下沉进 RichEditorDialog。
 */

const SHELL_VIEW_TRANSITION_NAME = 'rich-editor-dialog-shell'
const SPIKE_LOG_PREFIX = '[rich-editor-dialog-spike]'
const EDITOR_READY_TIMEOUT = 800

type SpikeEvent = { at: number; message: string }

type WindowWithSpikeLog = Window & {
  __spikeRichEditorDialog?: SpikeEvent[]
}

function spikeLog(message: string) {
  const target = window as WindowWithSpikeLog
  target.__spikeRichEditorDialog ??= []
  target.__spikeRichEditorDialog.push({
    at: Math.round(performance.now()),
    message,
  })
  console.info(`${SPIKE_LOG_PREFIX} ${message}`)
}

function getStartViewTransition() {
  if (typeof document === 'undefined') return null

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return null
  }

  const start = (
    document as Document & {
      startViewTransition?: (callback: () => void | Promise<void>) => {
        finished: Promise<void>
        ready: Promise<void>
      }
    }
  ).startViewTransition

  return start ? start.bind(document) : null
}

function isSoftKeyboardOpen() {
  const viewport = window.visualViewport

  if (!viewport) return false

  return window.innerHeight - viewport.height > 120
}

function RichEditorDialogDemo() {
  const [content, setContent] = useState<RichEditorContent>(dialogSample)
  const [open, setOpen] = useState(false)
  // 弹窗已可见(结束 prepare 阶段);与 open 分开是为了让 VT 捕获"旧=卡片 / 新=对话框"。
  const [revealed, setRevealed] = useState(false)
  const [lastAction, setLastAction] = useState<string | null>(null)

  const rootRef = useRef<HTMLDivElement | null>(null)
  const dialogRef = useRef<RichEditorDialogHandle | null>(null)
  const preparingRef = useRef(false)
  const openStartedAtRef = useRef(0)
  // SPIKE:重叠 view transition 会让回调乱序(旧 transition 的 finally 会改新状态),
  // 这里先粗暴串行化;正式实现需要队列/打断策略。
  const viewTransitionRunningRef = useRef(false)
  const openRef = useRef(false)

  openRef.current = open

  const getAnchorElement = useCallback(() => {
    const root = rootRef.current

    if (!root) return null

    return root.querySelector<HTMLElement>('.component-preview-card') ?? root
  }, [])

  const getPopupElement = useCallback(
    () => document.querySelector<HTMLElement>('.spike-editor-dialog'),
    [],
  )

  // 卡片在"关闭态"始终带共享 view-transition-name,VT 才能把卡片当作旧快照。
  useEffect(() => {
    const anchor = getAnchorElement()

    anchor?.style.setProperty(
      'view-transition-name',
      SHELL_VIEW_TRANSITION_NAME,
    )

    return () => {
      anchor?.style.removeProperty('view-transition-name')
    }
  }, [getAnchorElement])

  const requestOpen = useCallback(() => {
    // SPIKE:重复触发(连点)时直接忽略,避免 prepare/reveal 状态被重入。
    if (openRef.current || preparingRef.current) {
      spikeLog('open ignored: already open or preparing')
      return
    }

    const startViewTransition = getStartViewTransition()
    const anchor = getAnchorElement()

    if (!startViewTransition || !anchor) {
      spikeLog('open without morph: view transitions unavailable')
      setOpen(true)
      return
    }

    openStartedAtRef.current = performance.now()
    preparingRef.current = true
    anchor.style.setProperty(
      'view-transition-name',
      SHELL_VIEW_TRANSITION_NAME,
    )
    document.documentElement.setAttribute('data-spike-dialog', 'prepare')
    spikeLog('open requested: mounting dialog in prepare phase')
    setOpen(true)
  }, [getAnchorElement])

  // 等 Tiptap 真正挂载(首帧只有 skeleton),再启动 VT,避免新快照拍到骨架屏。
  const reveal = useCallback(() => {
    const startViewTransition = getStartViewTransition()
    const anchor = getAnchorElement()
    const popup = getPopupElement()
    const canMorph =
      !!startViewTransition &&
      !!anchor &&
      !!popup &&
      !viewTransitionRunningRef.current

    preparingRef.current = false
    document.documentElement.removeAttribute('data-spike-dialog')
    const readyCost =
      performance.now() - openStartedAtRef.current

    if (!canMorph) {
      spikeLog('reveal without morph: transition busy or VT unavailable')
      if (popup) {
        popup.style.setProperty('transition', 'none')
        popup.style.setProperty('opacity', '1')
        popup.style.setProperty('transform', 'none')
        window.setTimeout(() => {
          popup.style.removeProperty('transition')
          popup.style.removeProperty('opacity')
          popup.style.removeProperty('transform')
        }, 200)
      }
      setRevealed(true)
      return
    }

    viewTransitionRunningRef.current = true

    const transition = startViewTransition(() => {
      flushSync(() => setRevealed(true))
      // 旧快照已捕获(卡片带 name);这里把 name 交给对话框并强制可见。
      // transition 必须先关掉,否则 opacity 1 会走 160ms 过渡,新快照拍到的是 0。
      anchor.style.setProperty('view-transition-name', 'none')
      popup.style.setProperty(
        'view-transition-name',
        SHELL_VIEW_TRANSITION_NAME,
      )
      popup.style.setProperty('transition', 'none')
      popup.style.setProperty('opacity', '1')
      popup.style.setProperty('transform', 'none')
      spikeLog(
        `VT open update committed (editor ready at +${readyCost.toFixed(0)}ms)`,
      )
    })

    transition.finished.finally(() => {
      viewTransitionRunningRef.current = false
      popup.style.removeProperty('transition')
      popup.style.removeProperty('opacity')
      popup.style.removeProperty('transform')
      dialogRef.current?.focus('end')
      spikeLog(
        `VT open finished at +${(
          performance.now() - openStartedAtRef.current
        ).toFixed(0)}ms`,
      )
    })
  }, [getAnchorElement, getPopupElement])

  useEffect(() => {
    if (!open || revealed || !preparingRef.current) return

    const deadline = performance.now() + EDITOR_READY_TIMEOUT
    let frame = 0

    const checkEditorReady = () => {
      const popup = getPopupElement()
      const editorReady =
        popup?.querySelector('.rich-editor__content') != null

      if (editorReady || performance.now() >= deadline) {
        spikeLog(`editor ${editorReady ? 'ready' : 'timed out'}`)
        reveal()
        return
      }

      frame = requestAnimationFrame(checkEditorReady)
    }

    frame = requestAnimationFrame(checkEditorReady)

    return () => cancelAnimationFrame(frame)
  }, [getPopupElement, open, reveal, revealed])

  const requestClose = useCallback(() => {
    const startViewTransition = getStartViewTransition()
    const anchor = getAnchorElement()
    const popup = getPopupElement()
    const keyboardOpen = isSoftKeyboardOpen()

    const canMorph =
      !!startViewTransition &&
      !!anchor &&
      !!popup &&
      !keyboardOpen &&
      !viewTransitionRunningRef.current

    if (!canMorph) {
      spikeLog(
        `close without morph: ${
          keyboardOpen
            ? 'soft keyboard open'
            : viewTransitionRunningRef.current
              ? 'transition busy'
              : 'view transitions unavailable'
        }`,
      )
      preparingRef.current = false
      document.documentElement.removeAttribute('data-spike-dialog')
      anchor?.style.setProperty(
        'view-transition-name',
        SHELL_VIEW_TRANSITION_NAME,
      )
      popup?.style.removeProperty('opacity')
      popup?.style.removeProperty('transform')
      setOpen(false)
      setRevealed(false)
      return
    }

    const startedAt = performance.now()
    viewTransitionRunningRef.current = true

    const transition = startViewTransition(() => {
      anchor.style.setProperty(
        'view-transition-name',
        SHELL_VIEW_TRANSITION_NAME,
      )
      popup.style.removeProperty('view-transition-name')
      flushSync(() => {
        setOpen(false)
        setRevealed(false)
      })
      // Base UI 关闭时会把 popup 留在 DOM 里播 160ms 退场动画;新快照里把它压成
      // 透明,否则会与"对话框→卡片"的 morph 叠出一个幽灵弹窗。
      // transition 先关掉,确保快照那一刻就是 0,而不是 160ms 过渡的起点。
      popup.style.setProperty('transition', 'none')
      popup.style.setProperty('opacity', '0')
      popup.style.setProperty('transform', 'none')
      spikeLog('VT close update committed')
    })

    transition.finished.finally(() => {
      viewTransitionRunningRef.current = false
      // 若关闭动画期间又打开了对话框,不要用旧回调把 name 抢回卡片。
      if (!openRef.current) {
        anchor.style.setProperty(
          'view-transition-name',
          SHELL_VIEW_TRANSITION_NAME,
        )
      }
      spikeLog(
        `VT close finished at +${(performance.now() - startedAt).toFixed(0)}ms`,
      )
    })
  }, [getAnchorElement, getPopupElement])

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (next) {
        requestOpen()
        return
      }

      requestClose()
    },
    [requestClose, requestOpen],
  )

  const handleSave = (next: RichEditorContent) => {
    setContent(next)
    setLastAction('已保存草稿')
  }

  const popupClassName = [
    'spike-editor-dialog',
    open && !revealed ? 'spike-editor-dialog--preparing' : null,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div ref={rootRef} style={{ display: 'contents' }}>
      <ComponentPreviewCard
        action={
          <GhostIconButton
            aria-label="打开弹出式编辑器"
            onClick={requestOpen}
            size="sm"
          >
            <Pencil />
          </GhostIconButton>
        }
        footer={
          lastAction ? (
            <span className="rich-editor-dialog-docs-hint">{lastAction}</span>
          ) : undefined
        }
        label={
          <>
            弹出式编辑器{' '}
            <code className="docs-component-class">rich-editor-dialog</code>
          </>
        }
      >
        <div className="rich-editor-dialog-docs-preview">
          <RichEditor disabled value={content} />
        </div>
        <RichEditorDialog
          className={popupClassName}
          // SPIKE:延迟聚焦到 VT 结束后,避免动画中软键盘改变几何。
          editorProps={{ autoFocus: false }}
          onCancel={() => setLastAction('已放弃草稿')}
          onOpenChange={handleOpenChange}
          onSave={handleSave}
          open={open}
          ref={dialogRef}
          title="编辑内容"
          value={content}
        />
      </ComponentPreviewCard>
    </div>
  )
}

export const richEditorDialogDefinition = {
  id: 'rich-editor-dialog',
  summary:
    'RichEditorDialog 把 RichEditor 装进 coss 对话框,visualViewport 定尺寸,移动端键盘不遮挡工具栏',
  status: 'Ready',
  frame: 'plain',
  preview: () => <RichEditorDialogDemo />,
} satisfies ComponentDefinition
