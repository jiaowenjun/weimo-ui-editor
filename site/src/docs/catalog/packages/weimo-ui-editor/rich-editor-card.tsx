import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react'
import { flushSync } from 'react-dom'
import { Bold, Check, Heading1, List, Pencil, Quote, X } from 'lucide-react'

import { GhostIconButton } from 'weimo-ui-core/components/ghost-icon-button'
import { LabeledSwitch } from 'weimo-ui-core/components/labeled-switch'
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
          text: '光标自动落到文档开头，撤销历史不会丢',
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
 * 刻意不使用 Dialog + visualViewport 方案,这里改用:
 * - 一个始终存在的壳(没有 Dialog.Portal,没有第二个卡片节点)
 * - 一个始终存在的 RichEditor(Tiptap)实例,只切换 disabled
 * - 手写 FLIP 几何动画 + modal 行为(焦点陷阱/inert/滚动锁)
 *
 * 关键发现:site 的文档内容列会裁剪裸 fixed 壳;所以打开时用 Popover API
 * 把同一个节点提升到 top layer,而不是 portal / 重新挂载。关闭时原样归位。
 * 通用组件化仍需处理不支持 popover 的浏览器、多个实例和移动端键盘。
 */

// 正常动画时长;移动端使用 500ms 与软键盘弹出同步,DEBUG 开关开启时改为 3s。
// JS 定时器与 CSS transition 必须同步。
const MORPH_DURATION = 320
const MOBILE_MORPH_DURATION = 500
const DEBUG_MORPH_DURATION = 3000
const KEYBOARD_CLOSE_WAIT = 180

// 移动端展开态顶部对齐,桌面端保持垂直居中。
// 此断点同时控制移动端动画时长,需与 rich-editor-card.css 的 media query 保持一致。
const MOBILE_VIEWPORT_QUERY = '(max-width: 640px)'
const DIALOG_MARGIN = 12

type EditorPhase = 'closed' | 'opening' | 'open' | 'closing'
type EditorMode = 'card' | 'dialog'
type CloseReason = 'done' | 'dismiss'

type PrototypeEvent = { at: number; message: string }
type WindowWithPrototypeLog = Window & {
  __richEditorCardPrototype?: PrototypeEvent[]
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

function getMorphDuration(debug: boolean) {
  if (prefersReducedMotion()) return 0
  if (debug) return DEBUG_MORPH_DURATION

  return window.matchMedia(MOBILE_VIEWPORT_QUERY).matches
    ? MOBILE_MORPH_DURATION
    : MORPH_DURATION
}

function easeInOutCubic(progress: number) {
  return progress < 0.5
    ? 4 * progress * progress * progress
    : 1 - Math.pow(-2 * progress + 2, 3) / 2
}

function getDialogRect(): Rect {
  const viewport = window.visualViewport
  const viewportWidth = viewport?.width ?? window.innerWidth
  const viewportHeight = viewport?.height ?? window.innerHeight
  const offsetLeft = viewport?.offsetLeft ?? 0
  const offsetTop = viewport?.offsetTop ?? 0
  const width = Math.min(720, Math.max(280, viewportWidth - DIALOG_MARGIN * 2))
  const height = Math.min(
    620,
    Math.max(240, viewportHeight - DIALOG_MARGIN * 2),
  )
  const isMobile = window.matchMedia(MOBILE_VIEWPORT_QUERY).matches

  return {
    left: offsetLeft + (viewportWidth - width) / 2,
    top: isMobile
      ? offsetTop + DIALOG_MARGIN
      : offsetTop + (viewportHeight - height) / 2,
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

/*
 * 不用 portal,但用 Popover API 把同一个节点提升到 top layer:
 * - 仍然是同一个 DOM 节点 / 同一个 Tiptap 实例
 * - 逃出文档内容列的 overflow/transform 裁剪(原地 fixed 做不到)
 * - 关闭时 hidePopover,节点原样回到卡片槽位
 *
 * iOS Safari 状态栏修复之一(隔离页 A1/A2 判定):hidePopover 后同步
 * removeAttribute('popover') 会让状态栏回退成白带,属性必须常驻,只切换
 * :popover-open。关闭态下 UA 对 [popover]:not(:popover-open) 的
 * display:none 会被 .rec-card 的 author 样式覆盖,卡片照常显示。
 */
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
}

function getFocusableElements(root: HTMLElement) {
  return Array.from(
    root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  ).filter(
    (element) =>
      element.getClientRects().length > 0 && !element.hasAttribute('inert'),
  )
}

function focusEditorDomInGesture(shell: HTMLElement) {
  const editorDom = shell.querySelector<HTMLElement>('.rich-editor__content')
  if (!editorDom) return

  // RichEditor 的 disabled -> editable 更新在 passive effect 中。
  // iOS Safari 只认可原始点击任务同步栈里的原生 focus;这里先同步
  // 打开 contenteditable,让本次点击能直接唤起软键盘,随后由
  // Tiptap editable effect 与展开 effect 里的 focus('start') 补上
  // 内部状态和选区。
  if (editorDom.getAttribute('contenteditable') !== 'true') {
    editorDom.setAttribute('contenteditable', 'true')
  }
  // preventScroll:iOS 会把聚焦元素滚进视口,导致展开期间页面被滚下去且
  // 收起后不回位(卡片上漂)。对话框是 fixed 定位,不需要滚进视口。
  editorDom.focus({ preventScroll: true })
  logPrototypeEvent(
    editorDom.contains(document.activeElement)
      ? 'editor focused in gesture'
      : 'editor focus in gesture failed',
  )
}

type RichEditorCardProps = {
  debug?: boolean
  defaultValue: RichEditorContent
  onSave?: (content: RichEditorContent) => void
  title?: string
}

export function RichEditorCard({
  debug = false,
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
  const timerRef = useRef<number | null>(null)
  const scrollAnimationRef = useRef<number | null>(null)
  const openStartedAtRef = useRef(0)
  const bodyOverflowRef = useRef('')
  const bodyPaddingRightRef = useRef('')
  const inertedRef = useRef<HTMLElement[]>([])
  const lockedRef = useRef(false)
  const onSaveRef = useRef(onSave)
  // iOS Safari 在展开期间可能把页面滚下去(聚焦/键盘),收起时用于回位。
  const savedScrollYRef = useRef(0)

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
      if (scrollAnimationRef.current !== null) {
        window.cancelAnimationFrame(scrollAnimationRef.current)
      }

      hideFromTopLayer(shellRef.current)
      hideFromTopLayer(backdropRef.current)
      unlockPage()
    }
  }, [unlockPage])

  // 收起动画期间同步把视口平滑滚回文档开头;时长与 morph 同步,缓动为 ease-in-out。
  const animateEditorScrollToStart = useCallback(
    (shell: HTMLElement, duration: number) => {
      const viewport =
        shell.querySelector<HTMLElement>('.rich-editor__viewport')
      if (!viewport) return

      if (scrollAnimationRef.current !== null) {
        window.cancelAnimationFrame(scrollAnimationRef.current)
        scrollAnimationRef.current = null
      }

      const start = viewport.scrollTop
      if (start <= 0 || duration <= 0) {
        viewport.scrollTop = 0
        return
      }

      let startedAt: number | null = null

      const step = (now: number) => {
        startedAt ??= now
        const progress = Math.min(1, (now - startedAt) / duration)
        viewport.scrollTop = start * (1 - easeInOutCubic(progress))

        if (progress < 1) {
          scrollAnimationRef.current = window.requestAnimationFrame(step)
        } else {
          scrollAnimationRef.current = null
        }
      }

      scrollAnimationRef.current = window.requestAnimationFrame(step)
    },
    [],
  )

  const focusEditorForOpen = useCallback(() => {
    // 每次展开都把光标固定到文档开头。
    editorRef.current?.focus('start')
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
    savedScrollYRef.current = window.scrollY
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

    flushSync(() => {
      setPhase('opening')
      setMode('dialog')
      setSelectionFormat(null)
    })

    // 聚焦必须在原始点击的同步任务里完成;iOS Safari 在 rAF/effect 中
    // 调用 focus 不会弹出软键盘。同时写入选区,让本次聚焦就落在开头。
    focusEditorDomInGesture(shell)
    focusEditorForOpen()

    // 强制一次布局,确保"卡片几何"是过渡起点。
    void shell.getBoundingClientRect()

    const duration = getMorphDuration(debug)

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

        setSelectionFormat(editorRef.current?.getSelectionFormat() ?? null)
      })
    }, duration + 24)
  }, [debug, focusEditorForOpen, lockPage])

  const runCloseAnimation = useCallback(
    (reason: CloseReason) => {
      const shell = shellRef.current
      const slot = slotRef.current
      if (!shell || !slot) return

      const duration = getMorphDuration(debug)

      // 收起过程中平滑回到内容开头,保证初始态卡片始终展示文档起始部分。
      animateEditorScrollToStart(shell, duration)
      logPrototypeEvent('editor scrolling to start')

      const target = slot.getBoundingClientRect()

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

        // iOS Safari 修复之二:展开期间聚焦/键盘可能把页面滚下去且收起后
        // 不回位(卡片上漂),恢复展开前的滚动位置。
        if (window.scrollY !== savedScrollYRef.current) {
          window.scrollTo(0, savedScrollYRef.current)
        }

        /*
         * iOS Safari 修复之三(隔离页 G 系列判定):top layer 元素关闭后
         * 仍处于渲染状态(author display 覆盖 UA 隐藏)会导致状态栏色调
         * 不恢复;关闭后经历一次不可见绘制即可唤回重采样。隐形窗口约
         * 1 个绘制帧(双 rAF 恢复,setTimeout 兜底 rAF 挂起的环境);
         * 期间用一次性克隆替身盖在同一几何上顶住视觉,彻底消除落位闪烁。
         * 若真机复验白带回归,优先去掉替身,再依次放宽窗口到 50/100ms
         * (G5 实验验证过的窗口)。
         */
        const ghost = shell.cloneNode(true) as HTMLElement
        ghost.setAttribute('aria-hidden', 'true')
        ghost.removeAttribute('id')
        ghost.querySelectorAll('[id]').forEach((node) => {
          node.removeAttribute('id')
        })
        ghost.style.position = 'absolute'
        ghost.style.inset = '0'
        slot.appendChild(ghost)
        shell.style.visibility = 'hidden'
        const restoreVisibility = () => {
          if (shellRef.current === shell) {
            shell.style.visibility = ''
          }
          ghost.remove()
        }
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(restoreVisibility)
        })
        window.setTimeout(restoreVisibility, 64)

        if (reason === 'done') {
          const nextContent = editorRef.current?.getContent() ?? content
          onSaveRef.current?.(nextContent)
        }

        logPrototypeEvent('close finished')
      }, duration + 24)
    },
    [animateEditorScrollToStart, content, debug, unlockPage],
  )

  const closeEditor = useCallback(
    (reason: CloseReason) => {
      if (phaseRef.current !== 'open') return

      phaseRef.current = 'closing'
      setPhase('closing')
      logPrototypeEvent(`close requested (${reason})`)

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
      }, getMorphDuration(debug) + 24)
    }

    const viewport = window.visualViewport
    viewport?.addEventListener('resize', updateGeometry)
    window.addEventListener('resize', updateGeometry)

    return () => {
      viewport?.removeEventListener('resize', updateGeometry)
      window.removeEventListener('resize', updateGeometry)
    }
  }, [debug, phase])

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
    <div
      className="rec-card-slot"
      data-debug={debug ? 'true' : undefined}
      ref={slotRef}
    >
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
        <header className="rec-card__header">
          <span className="rec-card__title" id={titleId}>
            {title}
          </span>
          {mode === 'card' ? (
            <GhostIconButton
              aria-label="展开编辑"
              className="rec-card__edit"
              onClick={openEditor}
              ref={editButtonRef}
              size="sm"
            >
              <Pencil />
            </GhostIconButton>
          ) : (
            <div
              aria-label="编辑操作"
              className="rec-card__actions"
              role="group"
            >
              <GhostIconButton
                aria-label="收起"
                className="rec-card__collapse"
                disabled={phase !== 'open'}
                onClick={() => closeEditor('dismiss')}
                size="sm"
              >
                <X />
              </GhostIconButton>
              <GhostIconButton
                aria-label="完成"
                disabled={phase !== 'open'}
                onClick={() => closeEditor('done')}
                size="sm"
              >
                <Check />
              </GhostIconButton>
            </div>
          )}
        </header>

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

        {/* 常驻底栏:显隐交给 data-phase 过渡,非 open 状态禁止聚焦。 */}
        <footer className="rec-card__toolbar" inert={phase !== 'open'}>
          <div
            aria-label="编辑工具栏"
            className="rec-card__toolbar-group"
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
          </div>
        </footer>
      </div>
    </div>
  )
}

function RichEditorCardDemo() {
  const [debug, setDebug] = useState(false)

  return (
    <div className="rec-card-demo">
      <RichEditorCard
        debug={debug}
        defaultValue={cardSample}
        title="卡片式编辑 rich-editor-card"
      />
      <div className="docs-debug-toggle">
        <LabeledSwitch
          ariaLabel="切换 DEBUG 动画时长"
          checked={debug}
          labelOff="已关闭 DEBUG 动画"
          labelOn="已开启 DEBUG 动画 · 3 秒"
          onCheckedChange={setDebug}
        />
        {/* 诊断标记:真机确认加载了含状态栏修复的代码,排查结束后移除 */}
        <span className="rec-card-demo__build">fix-v3</span>
      </div>
    </div>
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
