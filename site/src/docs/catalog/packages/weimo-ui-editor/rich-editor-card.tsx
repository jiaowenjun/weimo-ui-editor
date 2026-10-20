import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react'
import { flushSync } from 'react-dom'
import { Bold, Heading1, List, Pencil, Quote } from 'lucide-react'

import { ComponentPreviewCard } from 'weimo-ui-core/components/component-preview-card'
import { GhostIconButton } from 'weimo-ui-core/components/ghost-icon-button'
import { TextButton } from 'weimo-ui-core/components/text-button'
import {
  RichEditor,
  type RichEditorContent,
  type RichEditorHandle,
  type RichEditorSelectionFormat,
} from 'weimo-ui-editor/components/rich-editor'
import type { ComponentDefinition } from '../../component-docs'

import './rich-editor-card.css'

const cardSample: RichEditorContent = {
  type: 'doc',
  content: [
    {
      type: 'heading',
      attrs: { level: 2 },
      content: [{ type: 'text', text: '本周重点' }],
    },
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: '卡片本身就是编辑器。展开后继续使用同一个 Tiptap 实例，' },
        {
          type: 'text',
          marks: [{ type: 'bold' }],
          text: '选区、撤销历史和滚动位置都不会丢',
        },
        { type: 'text', text: '。' },
      ],
    },
    {
      type: 'bulletList',
      content: [
        {
          type: 'listItem',
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: '确认首页改版的验收范围' }] },
          ],
        },
        {
          type: 'listItem',
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: '编辑器工具栏保持贴底' }] },
          ],
        },
        {
          type: 'listItem',
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: '补充移动端软键盘的回归用例' }] },
          ],
        },
      ],
    },
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: '点击卡片任意位置或右上角铅笔展开；按 Esc 收起。' },
      ],
    },
  ],
}

/*
 * DEMO PROTOTYPE(仅 site):卡片即迷你编辑器。
 *
 * 与 rich-editor-dialog 的 VT 方案不同,这里刻意使用:
 * - 一个始终存在的壳(没有 Dialog.Portal,没有第二个卡片节点)
 * - 一个始终存在的 RichEditor(Tiptap)实例,只切换 disabled
 * - 手写 FLIP 几何动画 + modal 行为(焦点陷阱/inert/滚动锁)
 *
 * 关键发现:site 的文档内容列会裁剪裸 fixed 壳;所以打开时用 Popover API
 * 把同一个节点提升到 top layer,而不是 portal / 重新挂载。关闭时原样归位。
 * 通用组件化仍需处理不支持 popover 的浏览器、多个实例和移动端键盘。
 */

// 调试期:3s(原值 320ms)。JS 定时器与 CSS transition 必须同步改。
const MORPH_DURATION = 3000
const KEYBOARD_CLOSE_WAIT = 180

type EditorPhase = 'closed' | 'opening' | 'open' | 'closing'
type EditorMode = 'card' | 'dialog'
type CloseReason = 'done' | 'dismiss'

type PrototypeEvent = { at: number; message: string }
type WindowWithPrototypeLog = Window & {
  __richEditorCardPrototype?: PrototypeEvent[]
}

type RichTextNode = {
  content?: RichTextNode[]
  text?: string
}

type Rect = {
  height: number
  left: number
  top: number
  width: number
}

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]',
].join(',')

function logPrototypeEvent(message: string) {
  const target = window as WindowWithPrototypeLog
  target.__richEditorCardPrototype ??= []
  target.__richEditorCardPrototype.push({
    at: Math.round(performance.now()),
    message,
  })
  console.info(`[rich-editor-card] ${message}`)
}

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function getDialogRect(): Rect {
  const viewport = window.visualViewport
  const viewportWidth = viewport?.width ?? window.innerWidth
  const viewportHeight = viewport?.height ?? window.innerHeight
  const offsetLeft = viewport?.offsetLeft ?? 0
  const offsetTop = viewport?.offsetTop ?? 0
  const width = Math.min(720, Math.max(280, viewportWidth - 24))
  const height = Math.min(620, Math.max(240, viewportHeight - 24))

  return {
    left: offsetLeft + (viewportWidth - width) / 2,
    top: offsetTop + (viewportHeight - height) / 2,
    width,
    height,
  }
}

function applyRect(element: HTMLElement, rect: Rect) {
  element.style.top = `${rect.top}px`
  element.style.left = `${rect.left}px`
  element.style.width = `${rect.width}px`
  element.style.height = `${rect.height}px`
}

type PopoverElement = HTMLElement & {
  hidePopover?: () => void
  showPopover?: () => void
}

/*
 * 不用 portal,但用 Popover API 把同一个节点提升到 top layer:
 * - 仍然是同一个 DOM 节点 / 同一个 Tiptap 实例
 * - 逃出文档内容列的 overflow/transform 裁剪(原地 fixed 做不到)
 * - 关闭时 hidePopover,节点原样回到卡片槽位
 */
function showInTopLayer(element: HTMLElement | null) {
  if (!element) return false

  const popover = element as PopoverElement
  if (typeof popover.showPopover !== 'function') return false

  try {
    if (!element.hasAttribute('popover')) {
      element.setAttribute('popover', 'manual')
    }
    if (!element.matches(':popover-open')) {
      popover.showPopover()
    }
    return element.matches(':popover-open')
  } catch {
    return false
  }
}

function hideFromTopLayer(element: HTMLElement | null) {
  if (!element) return

  const popover = element as PopoverElement
  try {
    if (typeof popover.hidePopover === 'function' && element.matches(':popover-open')) {
      popover.hidePopover()
    }
  } catch {
    // 节点已经在关闭/卸载流程里时忽略。
  }

  element.removeAttribute('popover')
}

function getFocusableElements(root: HTMLElement) {
  return Array.from(
    root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  ).filter(
    (element) =>
      element.getClientRects().length > 0 && !element.hasAttribute('inert'),
  )
}

function countTextLength(node: RichTextNode | undefined): number {
  if (!node) return 0

  const own = node.text?.length ?? 0
  const children =
    node.content?.reduce((total, child) => total + countTextLength(child), 0) ??
    0

  return own + children
}

type RichEditorCardProps = {
  defaultValue: RichEditorContent
  onSave?: (content: RichEditorContent) => void
  title?: string
}

export function RichEditorCard({
  defaultValue,
  onSave,
  title = '周一产品例会',
}: RichEditorCardProps) {
  const titleId = useId()
  const [mode, setMode] = useState<EditorMode>('card')
  const [phase, setPhase] = useState<EditorPhase>('closed')
  const [content, setContent] = useState<RichEditorContent>(defaultValue)
  const [selectionFormat, setSelectionFormat] =
    useState<RichEditorSelectionFormat | null>(null)

  const slotRef = useRef<HTMLDivElement | null>(null)
  const shellRef = useRef<HTMLDivElement | null>(null)
  const backdropRef = useRef<HTMLDivElement | null>(null)
  const editorRef = useRef<RichEditorHandle | null>(null)
  const editButtonRef = useRef<HTMLButtonElement | null>(null)
  const phaseRef = useRef<EditorPhase>('closed')
  const hasOpenedRef = useRef(false)
  const editorScrollTopRef = useRef(0)
  const timerRef = useRef<number | null>(null)
  const openStartedAtRef = useRef(0)
  const bodyOverflowRef = useRef('')
  const bodyPaddingRightRef = useRef('')
  const inertedRef = useRef<HTMLElement[]>([])
  const lockedRef = useRef(false)
  const onSaveRef = useRef(onSave)

  phaseRef.current = phase
  onSaveRef.current = onSave

  const lockPage = useCallback(() => {
    if (lockedRef.current) return

    lockedRef.current = true
    bodyOverflowRef.current = document.body.style.overflow
    bodyPaddingRightRef.current = document.body.style.paddingRight
    const scrollbarWidth =
      window.innerWidth - document.documentElement.clientWidth

    document.body.style.overflow = 'hidden'
    if (scrollbarWidth > 0) {
      const currentPadding = bodyPaddingRightRef.current || '0px'
      document.body.style.paddingRight = `calc(${currentPadding} + ${scrollbarWidth}px)`
    }

    const shell = shellRef.current
    if (!shell) return

    const backdrop = backdropRef.current
    const inerted: HTMLElement[] = []
    let node: HTMLElement | null = shell

    // 只 inert 壳的"旁支",保留壳自身的祖先链可交互。
    // backdrop 是壳的兄弟节点,必须跳过,否则遮罩点不了。
    while (node && node !== document.body) {
      const parentElement: HTMLElement | null = node.parentElement
      if (!parentElement) break

      for (const sibling of Array.from(parentElement.children)) {
        if (sibling === node || sibling === backdrop) continue
        if (sibling instanceof HTMLElement && !sibling.hasAttribute('inert')) {
          sibling.setAttribute('inert', '')
          inerted.push(sibling)
        }
      }

      node = parentElement
    }

    inertedRef.current = inerted
    logPrototypeEvent(`locked page, inerted ${inerted.length} siblings`)
  }, [])

  const unlockPage = useCallback(() => {
    if (!lockedRef.current) return

    lockedRef.current = false
    document.body.style.overflow = bodyOverflowRef.current
    document.body.style.paddingRight = bodyPaddingRightRef.current

    for (const element of inertedRef.current) {
      element.removeAttribute('inert')
    }
    inertedRef.current = []
  }, [])

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current)
      }

      hideFromTopLayer(shellRef.current)
      hideFromTopLayer(backdropRef.current)
      unlockPage()
    }
  }, [unlockPage])

  const focusEditorForOpen = useCallback(() => {
    const editor = editorRef.current
    if (!editor) return

    // 首次展开落到末尾;再次展开恢复上一次的 Tiptap 选区。
    if (hasOpenedRef.current) {
      editor.focus()
    } else {
      // Tiptap 的 focus 命令会先同步 state selection,再在下一帧真正聚焦;
      // 所以这里立即记为已展开过,避免动画结束的兜底再次把光标推到末尾。
      hasOpenedRef.current = true
      editor.focus('end')
    }
  }, [])

  // 展开一开始就聚焦,不必等 FLIP 动画结束(调试期 3s)才能输入。
  useEffect(() => {
    if (phase !== 'opening') return

    const frame = window.requestAnimationFrame(() => {
      if (phaseRef.current === 'opening' || phaseRef.current === 'open') {
        focusEditorForOpen()
      }
    })

    return () => window.cancelAnimationFrame(frame)
  }, [focusEditorForOpen, phase])

  const openEditor = useCallback(() => {
    if (phaseRef.current !== 'closed') return

    const shell = shellRef.current
    const slot = slotRef.current
    if (!shell || !slot) return

    phaseRef.current = 'opening'
    openStartedAtRef.current = performance.now()
    logPrototypeEvent('open requested')

    // 先锁页再测量,避免滚动条消失导致卡片位置偏移。
    lockPage()

    const first = shell.getBoundingClientRect()
    const slotRect = slot.getBoundingClientRect()
    slot.style.height = `${slotRect.height}px`

    const backdropTopLayer = showInTopLayer(backdropRef.current)
    const shellTopLayer = showInTopLayer(shell)
    logPrototypeEvent(
      `top layer: shell=${shellTopLayer} backdrop=${backdropTopLayer}`,
    )

    shell.classList.remove('rec-card--animating')
    shell.style.position = 'fixed'
    shell.style.zIndex = '101'
    shell.style.margin = '0'
    shell.style.right = 'auto'
    shell.style.bottom = 'auto'
    applyRect(shell, {
      top: first.top,
      left: first.left,
      width: first.width,
      height: first.height,
    })

    setPhase('opening')
    setMode('dialog')
    setSelectionFormat(null)

    // 强制一次布局,确保"卡片几何"是过渡起点。
    void shell.getBoundingClientRect()

    const duration = prefersReducedMotion() ? 0 : MORPH_DURATION

    window.requestAnimationFrame(() => {
      if (phaseRef.current !== 'opening' || !shell.isConnected) return

      if (duration > 0) {
        shell.classList.add('rec-card--animating')
      }
      applyRect(shell, getDialogRect())
      logPrototypeEvent('open geometry applied')
    })

    timerRef.current = window.setTimeout(() => {
      if (phaseRef.current !== 'opening' || !shell.isConnected) return

      shell.classList.remove('rec-card--animating')
      phaseRef.current = 'open'
      setPhase('open')
      logPrototypeEvent(
        `open finished at +${(
          performance.now() - openStartedAtRef.current
        ).toFixed(0)}ms`,
      )

      window.requestAnimationFrame(() => {
        // 展开开始时已聚焦;这里只做兜底,避免某些浏览器在动画中丢焦点。
        const editorDom = shell.querySelector<HTMLElement>(
          '.rich-editor__content',
        )
        if (!editorDom || !editorDom.contains(document.activeElement)) {
          focusEditorForOpen()
        }

        const viewport =
          shell.querySelector<HTMLElement>('.rich-editor__viewport')
        if (viewport) {
          viewport.scrollTop = editorScrollTopRef.current
        }
        setSelectionFormat(editorRef.current?.getSelectionFormat() ?? null)
      })
    }, duration + 24)
  }, [focusEditorForOpen, lockPage])

  const runCloseAnimation = useCallback(
    (reason: CloseReason) => {
      const shell = shellRef.current
      const slot = slotRef.current
      if (!shell || !slot) return

      const target = slot.getBoundingClientRect()
      const duration = prefersReducedMotion() ? 0 : MORPH_DURATION

      if (duration > 0) {
        shell.classList.add('rec-card--animating')
      }
      applyRect(shell, {
        top: target.top,
        left: target.left,
        width: target.width,
        height: target.height,
      })
      logPrototypeEvent('close geometry applied')

      timerRef.current = window.setTimeout(() => {
        if (phaseRef.current !== 'closing' || !shell.isConnected) return

        // 先同步切回卡片 chrome,再撤掉 fixed 几何,避免中间帧闪一下对话框布局。
        flushSync(() => {
          setMode('card')
          setPhase('closed')
        })
        phaseRef.current = 'closed'

        hideFromTopLayer(shell)
        hideFromTopLayer(backdropRef.current)
        shell.classList.remove('rec-card--animating')
        shell.style.position = ''
        shell.style.zIndex = ''
        shell.style.margin = ''
        shell.style.right = ''
        shell.style.bottom = ''
        shell.style.top = ''
        shell.style.left = ''
        shell.style.width = ''
        shell.style.height = ''
        slot.style.height = ''

        unlockPage()
        editButtonRef.current?.focus({ preventScroll: true })

        if (reason === 'done') {
          const nextContent = editorRef.current?.getContent() ?? content
          onSaveRef.current?.(nextContent)
        }

        logPrototypeEvent('close finished')
      }, duration + 24)
    },
    [content, unlockPage],
  )

  const closeEditor = useCallback(
    (reason: CloseReason) => {
      if (phaseRef.current !== 'open') return

      phaseRef.current = 'closing'
      setPhase('closing')
      logPrototypeEvent(`close requested (${reason})`)

      editorScrollTopRef.current =
        shellRef.current?.querySelector<HTMLElement>('.rich-editor__viewport')
          ?.scrollTop ?? 0

      // 先失焦让软键盘收起;正在收起的键盘会改变 visualViewport,等一拍再测卡片位置。
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur()
      }

      const viewport = window.visualViewport
      const keyboardOpen =
        !!viewport && window.innerHeight - viewport.height > 120

      if (keyboardOpen) {
        logPrototypeEvent('waiting for soft keyboard to close')
        timerRef.current = window.setTimeout(
          () => runCloseAnimation(reason),
          KEYBOARD_CLOSE_WAIT,
        )
        return
      }

      runCloseAnimation(reason)
    },
    [runCloseAnimation],
  )

  // 展开/打开期间跟随 visualViewport(软键盘)调整几何。
  useEffect(() => {
    if (phase !== 'opening' && phase !== 'open') return

    const updateGeometry = () => {
      const shell = shellRef.current
      const currentPhase = phaseRef.current
      if (!shell || (currentPhase !== 'opening' && currentPhase !== 'open')) {
        return
      }

      if (currentPhase === 'opening') {
        // 开场动画进行中:直接改目标几何,让进行中的 transition 重新定向。
        applyRect(shell, getDialogRect())
        return
      }

      shell.classList.add('rec-card--animating')
      applyRect(shell, getDialogRect())
      window.setTimeout(() => {
        shell.classList.remove('rec-card--animating')
      }, MORPH_DURATION + 24)
    }

    const viewport = window.visualViewport
    viewport?.addEventListener('resize', updateGeometry)
    window.addEventListener('resize', updateGeometry)

    return () => {
      viewport?.removeEventListener('resize', updateGeometry)
      window.removeEventListener('resize', updateGeometry)
    }
  }, [phase])

  // 基础 modal:Esc 关闭 + Tab 焦点陷阱 + 焦点外逃时拉回壳。
  useEffect(() => {
    if (phase !== 'open') return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        closeEditor('dismiss')
        return
      }

      if (event.key !== 'Tab') return

      const shell = shellRef.current
      if (!shell) return

      const focusables = getFocusableElements(shell)
      if (focusables.length === 0) {
        event.preventDefault()
        shell.focus()
        return
      }

      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      const active = document.activeElement

      if (event.shiftKey) {
        if (active === first || !shell.contains(active)) {
          event.preventDefault()
          last.focus()
        }
        return
      }

      if (active === last || !shell.contains(active)) {
        event.preventDefault()
        first.focus()
      }
    }

    const handleFocusIn = (event: FocusEvent) => {
      // 关闭流程里已经主动 blur,这里不要再把焦点抢回来(否则软键盘关不掉)。
      if (phaseRef.current !== 'open') return

      const shell = shellRef.current
      if (!shell) return

      if (event.target instanceof Node && !shell.contains(event.target)) {
        shell.focus({ preventScroll: true })
      }
    }

    document.addEventListener('keydown', handleKeyDown, true)
    document.addEventListener('focusin', handleFocusIn, true)

    return () => {
      document.removeEventListener('keydown', handleKeyDown, true)
      document.removeEventListener('focusin', handleFocusIn, true)
    }
  }, [closeEditor, phase])

  const textLength = countTextLength(content as unknown as RichTextNode)
  const editing = phase !== 'closed'

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
    <div className="rec-card-slot" ref={slotRef}>
      <div
        aria-hidden="true"
        className="rec-card-backdrop"
        data-interactive={phase === 'open' ? 'true' : undefined}
        data-visible={
          phase === 'opening' || phase === 'open' ? 'true' : undefined
        }
        onClick={() => closeEditor('dismiss')}
        ref={backdropRef}
      />

      <div
        aria-labelledby={phase !== 'closed' ? titleId : undefined}
        aria-modal={phase !== 'closed' ? true : undefined}
        className="rec-card"
        data-mode={mode}
        data-phase={phase}
        onClick={() => {
          if (phaseRef.current === 'closed') openEditor()
        }}
        ref={shellRef}
        role={phase !== 'closed' ? 'dialog' : undefined}
        tabIndex={-1}
      >
        {mode === 'card' ? (
          <header className="rec-card__header rec-card__header--card">
            <span className="rec-card__title" id={titleId}>
              {title}
            </span>
            <GhostIconButton
              aria-label="展开编辑"
              className="rec-card__edit"
              onClick={openEditor}
              ref={editButtonRef}
              size="sm"
            >
              <Pencil />
            </GhostIconButton>
          </header>
        ) : (
          <header className="rec-card__header rec-card__header--dialog">
            <TextButton
              disabled={phase !== 'open'}
              onClick={() => closeEditor('dismiss')}
            >
              收起
            </TextButton>
            <span className="rec-card__title" id={titleId}>
              {title}
            </span>
            <TextButton
              className="rec-card__done"
              disabled={phase !== 'open'}
              onClick={() => closeEditor('done')}
            >
              完成
            </TextButton>
          </header>
        )}

        <div className="rec-card__editor">
          <RichEditor
            defaultValue={defaultValue}
            disabled={!editing}
            onChange={setContent}
            onSelectionFormatChange={setSelectionFormat}
            placeholder="写点什么…"
            ref={editorRef}
          />
        </div>

        {mode === 'card' ? (
          <footer className="rec-card__footer">
            <span className="rec-card__hint">
              只读预览 · 点击卡片或铅笔继续编辑
            </span>
            <span className="rec-card__stats">{textLength} 字</span>
          </footer>
        ) : (
          <footer
            aria-label="编辑工具栏"
            className="rec-card__toolbar"
            role="group"
          >
            {toolbarButtons.map((button) => (
              <GhostIconButton
                active={button.active}
                aria-label={button.label}
                disabled={phase !== 'open' || !selectionFormat}
                key={button.key}
                onClick={() => button.action()}
                onPointerDown={(event) => event.preventDefault()}
                size="sm"
              >
                {button.icon}
              </GhostIconButton>
            ))}
          </footer>
        )}
      </div>
    </div>
  )
}

function RichEditorCardDemo() {
  const [lastSaved, setLastSaved] = useState<string | null>(null)

  return (
    <ComponentPreviewCard
      action={<span className="rec-card-demo__badge">prototype</span>}
      footer={
        <span className="rich-editor-dialog-docs-hint">
          {lastSaved ??
            '同一个 Tiptap 实例 · 单壳 FLIP · Popover top layer'}
        </span>
      }
      label={
        <>
          卡片式编辑{' '}
          <code className="docs-component-class">rich-editor-card</code>
        </>
      }
    >
      <div className="rec-card-demo">
        <RichEditorCard
          defaultValue={cardSample}
          onSave={() => setLastSaved('已保存 · 编辑器实例未重建')}
        />
      </div>
    </ComponentPreviewCard>
  )
}

export const richEditorCardDefinition = {
  id: 'rich-editor-card',
  summary:
    '卡片即迷你编辑器：同一个 Tiptap 实例 + 单壳 FLIP 展开为对话框（原型）',
  status: 'Preview',
  frame: 'plain',
  preview: () => <RichEditorCardDemo />,
} satisfies ComponentDefinition
