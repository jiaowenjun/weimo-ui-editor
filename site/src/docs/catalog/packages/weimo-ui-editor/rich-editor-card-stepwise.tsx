import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react'
import { flushSync } from 'react-dom'
import { Bold, Check, List, Pencil, X } from 'lucide-react'

import { GhostIconButton } from 'weimo-ui-core/components/ghost-icon-button'
import {
  RichEditor,
  type RichEditorContent,
  type RichEditorHandle,
} from 'weimo-ui-editor/components/rich-editor'
import type { ComponentDefinition } from '../../types'

import './rich-editor-card-stepwise.css'

/*
 * 渐进式构建页(仅 site):从隔离页 F 系列已知可恢复的基线出发,逐步叠加
 * rich-editor-card 的功能。每一步真机开合 3~5 次、确认关闭后状态栏恢复
 * 系统磨砂,再进入下一步;从哪一步开始不恢复,该步新增的功能即根因。
 *
 * 切换步骤会通过 key 重置卡片实例(打开状态下切换会强制收起)。
 * 基线包含两处已知必要修复:popover 属性常驻(A1 定罪路径不再触发)、
 * 滚动恢复(手势聚焦 preventScroll + 收起时恢复 scrollY,上漂修复)。
 */

const stepSample: RichEditorContent = {
  type: 'doc',
  content: [
    {
      type: 'heading',
      attrs: { level: 2 },
      content: [{ type: 'text', text: '渐进式构建' }],
    },
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: '从 F 系列基线出发,每加一个功能都在真机确认状态栏。' },
      ],
    },
    {
      type: 'bulletList',
      content: [
        {
          type: 'listItem',
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: '确认当前步骤开合正常' }] },
          ],
        },
        {
          type: 'listItem',
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: '再切换到下一步骤' }] },
          ],
        },
      ],
    },
  ],
}

export const STEPWISE_STEPS = [
  {
    level: 0,
    key: 'baseline',
    title: '基线:popover 属性常驻 + 全屏 fixed 几何(瞬时) + 滚动锁 + 同步清理 + 滚动恢复(F 系列已证可恢复)',
  },
  {
    level: 1,
    key: 'editor',
    title: '真实 RichEditor(Tiptap 实例,disabled 切换)+ 手势聚焦弹软键盘',
  },
  {
    level: 2,
    key: 'flip',
    title: 'FLIP 过渡动画(展开/收起 320ms,移动端 1s;收起先动画回槽位再退 top layer)',
  },
  {
    level: 3,
    key: 'slotPin',
    title: '槽位钉高(展开期间 slot 固定 height)',
  },
  {
    level: 4,
    key: 'inert',
    title: '批量 inert(祖先链兄弟节点,关闭同 tick 移除)',
  },
  {
    level: 5,
    key: 'backdrop',
    title: '可见遮罩(第二个 top layer 元素,毛玻璃,点击收起)',
  },
  {
    level: 6,
    key: 'scrollBack',
    title: '收起滚动归零(编辑器视口平滑滚回开头)',
  },
  {
    level: 7,
    key: 'flushSync',
    title: 'flushSync 提交 phase/mode 切换',
  },
  {
    level: 8,
    key: 'viewportTrack',
    title: 'visualViewport/resize 跟随(键盘弹出时调整几何)',
  },
  {
    level: 9,
    key: 'modal',
    title: 'Esc 关闭 + Tab 焦点陷阱 + focusin 拉回',
  },
  {
    level: 10,
    key: 'chrome',
    title: '完整 chrome(铅笔展开/X 收起/完成、底部工具栏、data-phase 过渡)',
  },
] as const

export type StepwiseStepKey = (typeof STEPWISE_STEPS)[number]['key']

const STEP_LEVEL = Object.fromEntries(
  STEPWISE_STEPS.map((step) => [step.key, step.level]),
) as Record<StepwiseStepKey, number>

const MORPH_DURATION = 320
const MOBILE_MORPH_DURATION = 1000
const KEYBOARD_CLOSE_WAIT = 180
const MORPH_PAD = 24
const MOBILE_VIEWPORT_QUERY = '(max-width: 640px)'
const DIALOG_MARGIN = 12

type EditorPhase = 'closed' | 'opening' | 'open' | 'closing'
type PopoverElement = HTMLElement & {
  hidePopover?: () => void
  showPopover?: () => void
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

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function getMorphDuration() {
  if (prefersReducedMotion()) return 0

  return window.matchMedia(MOBILE_VIEWPORT_QUERY).matches
    ? MOBILE_MORPH_DURATION
    : MORPH_DURATION
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
    if (
      typeof popover.hidePopover === 'function' &&
      element.matches(':popover-open')
    ) {
      popover.hidePopover()
    }
  } catch {
    // 已在关闭/卸载流程里时忽略
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

function easeInOutCubic(progress: number) {
  return progress < 0.5
    ? 4 * progress * progress * progress
    : 1 - Math.pow(-2 * progress + 2, 3) / 2
}

export function StepwiseCard({
  defaultValue,
  level,
}: {
  defaultValue: RichEditorContent
  level: number
}) {
  const titleId = useId()
  const [mode, setMode] = useState<'card' | 'dialog'>('card')
  const [phase, setPhase] = useState<EditorPhase>('closed')

  const slotRef = useRef<HTMLDivElement | null>(null)
  const shellRef = useRef<HTMLDivElement | null>(null)
  const backdropRef = useRef<HTMLDivElement | null>(null)
  const editorRef = useRef<RichEditorHandle | null>(null)
  const pencilRef = useRef<HTMLButtonElement | null>(null)
  const phaseRef = useRef<EditorPhase>('closed')
  const timerRef = useRef<number | null>(null)
  const scrollAnimationRef = useRef<number | null>(null)
  const savedScrollYRef = useRef(0)
  const bodyOverflowRef = useRef('')
  const bodyPaddingRightRef = useRef('')
  const inertedRef = useRef<HTMLElement[]>([])
  const lockedRef = useRef(false)

  phaseRef.current = phase

  const has = useCallback(
    (key: StepwiseStepKey) => level >= STEP_LEVEL[key],
    [level],
  )

  const commit = useCallback(
    (update: () => void) => {
      if (has('flushSync')) {
        flushSync(update)
        return
      }
      update()
    },
    [has],
  )

  // 收起过程中把编辑器视口平滑滚回开头(步骤 6)。
  const animateScrollToStart = useCallback(
    (shell: HTMLElement, duration: number) => {
      const viewport = shell.querySelector<HTMLElement>(
        '.rich-editor__viewport',
      )
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

  // 卸载兜底:清定时器、退 top layer、解锁、去 inert。
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
      document.body.style.overflow = bodyOverflowRef.current
      document.body.style.paddingRight = bodyPaddingRightRef.current
      for (const element of inertedRef.current) {
        element.removeAttribute('inert')
      }
      inertedRef.current = []
    }
  }, [])

  const openCard = useCallback(() => {
    if (phaseRef.current !== 'closed') return

    const shell = shellRef.current
    const slot = slotRef.current
    if (!shell || !slot) return

    phaseRef.current = 'opening'
    savedScrollYRef.current = window.scrollY

    // 滚动锁(基线)。
    if (!lockedRef.current) {
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
    }

    // 批量 inert(步骤 4)。
    if (has('inert') && inertedRef.current.length === 0) {
      const inerted: HTMLElement[] = []
      let node: HTMLElement | null = shell

      while (node && node !== document.body) {
        const parentElement: HTMLElement | null = node.parentElement
        if (!parentElement) break

        for (const sibling of Array.from(parentElement.children)) {
          if (sibling === node || sibling === backdropRef.current) continue
          if (
            sibling instanceof HTMLElement &&
            !sibling.hasAttribute('inert')
          ) {
            sibling.setAttribute('inert', '')
            inerted.push(sibling)
          }
        }

        node = parentElement
      }

      inertedRef.current = inerted
    }

    const first = shell.getBoundingClientRect()
    if (has('slotPin')) {
      slot.style.height = `${slot.getBoundingClientRect().height}px`
    }

    if (has('backdrop')) {
      showInTopLayer(backdropRef.current)
    }
    showInTopLayer(shell)

    shell.classList.remove('step-card--animating')
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

    commit(() => {
      setPhase('opening')
      setMode('dialog')
    })

    // 手势聚焦(步骤 1):iOS 只认可点击同步栈里的原生 focus。
    if (has('editor')) {
      const editorDom = shell.querySelector<HTMLElement>('.rich-editor__content')
      if (editorDom?.getAttribute('contenteditable') !== 'true') {
        editorDom?.setAttribute('contenteditable', 'true')
      }
      editorDom?.focus({ preventScroll: true })
      editorRef.current?.focus('start')
    }

    void shell.getBoundingClientRect()
    const duration = has('flip') ? getMorphDuration() : 0

    if (duration > 0) {
      window.requestAnimationFrame(() => {
        if (phaseRef.current !== 'opening' || !shell.isConnected) return
        shell.classList.add('step-card--animating')
        applyRect(shell, getDialogRect())
      })
    } else {
      applyRect(shell, getDialogRect())
    }

    timerRef.current = window.setTimeout(() => {
      if (phaseRef.current !== 'opening' || !shell.isConnected) return

      shell.classList.remove('step-card--animating')
      phaseRef.current = 'open'
      setPhase('open')
    }, duration + MORPH_PAD)
  }, [commit, has])

  const runClose = useCallback(() => {
    const shell = shellRef.current
    const slot = slotRef.current
    if (!shell || !slot) return

    const duration = has('flip') ? getMorphDuration() : 0

    if (has('scrollBack')) {
      animateScrollToStart(shell, duration)
    }

    const target = slot.getBoundingClientRect()

    if (duration > 0) {
      shell.classList.add('step-card--animating')
    }
    applyRect(shell, {
      top: target.top,
      left: target.left,
      width: target.width,
      height: target.height,
    })

    timerRef.current = window.setTimeout(() => {
      if (phaseRef.current !== 'closing' || !shell.isConnected) return

      commit(() => {
        setMode('card')
        setPhase('closed')
      })
      phaseRef.current = 'closed'

      hideFromTopLayer(shell)
      if (has('backdrop')) {
        hideFromTopLayer(backdropRef.current)
      }
      shell.classList.remove('step-card--animating')
      shell.style.position = ''
      shell.style.zIndex = ''
      shell.style.margin = ''
      shell.style.right = ''
      shell.style.bottom = ''
      shell.style.top = ''
      shell.style.left = ''
      shell.style.width = ''
      shell.style.height = ''
      if (has('slotPin')) {
        slot.style.height = ''
      }

      if (lockedRef.current) {
        lockedRef.current = false
        document.body.style.overflow = bodyOverflowRef.current
        document.body.style.paddingRight = bodyPaddingRightRef.current
      }
      for (const element of inertedRef.current) {
        element.removeAttribute('inert')
      }
      inertedRef.current = []

      // 滚动恢复(基线):iOS 聚焦滚动不回位会导致卡片上移。
      if (window.scrollY !== savedScrollYRef.current) {
        window.scrollTo(0, savedScrollYRef.current)
      }

      if (has('chrome')) {
        pencilRef.current?.focus({ preventScroll: true })
      }

      /*
       * iOS Safari 状态栏修复(隔离页 G5 实测):top layer 元素关闭后
       * 仍处于渲染状态(author display 覆盖 UA 隐藏)则状态栏色调不恢复;
       * 关闭后短暂 visibility:hidden(保留布局盒,无重排闪烁)可唤回
       * 重采样,约 1 帧后恢复(双 rAF + setTimeout 兜底)。
       */
      shell.style.visibility = 'hidden'
      const restoreVisibility = () => {
        if (shellRef.current === shell) {
          shell.style.visibility = ''
        }
      }
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(restoreVisibility)
      })
      window.setTimeout(restoreVisibility, 64)
    }, duration + MORPH_PAD)
  }, [animateScrollToStart, commit, has])

  const closeCard = useCallback(() => {
    if (phaseRef.current !== 'open') return

    phaseRef.current = 'closing'
    setPhase('closing')

    // 先失焦让软键盘收起,正在收起的键盘会改变 visualViewport。
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur()
    }

    const viewport = window.visualViewport
    const keyboardOpen =
      !!viewport && window.innerHeight - viewport.height > 120

    if (keyboardOpen) {
      timerRef.current = window.setTimeout(
        () => runClose(),
        KEYBOARD_CLOSE_WAIT,
      )
      return
    }

    runClose()
  }, [runClose])

  // visualViewport/resize 跟随(步骤 8)。
  useEffect(() => {
    if (!has('viewportTrack')) return
    if (phase !== 'opening' && phase !== 'open') return

    const updateGeometry = () => {
      const shell = shellRef.current
      const currentPhase = phaseRef.current
      if (!shell || (currentPhase !== 'opening' && currentPhase !== 'open')) {
        return
      }

      if (currentPhase === 'opening') {
        applyRect(shell, getDialogRect())
        return
      }

      shell.classList.add('step-card--animating')
      applyRect(shell, getDialogRect())
      window.setTimeout(() => {
        if (phaseRef.current === 'open') {
          shell.classList.remove('step-card--animating')
        }
      }, getMorphDuration() + MORPH_PAD)
    }

    const viewport = window.visualViewport
    viewport?.addEventListener('resize', updateGeometry)
    window.addEventListener('resize', updateGeometry)

    return () => {
      viewport?.removeEventListener('resize', updateGeometry)
      window.removeEventListener('resize', updateGeometry)
    }
  }, [has, phase])

  // Esc/Tab 焦点陷阱 + focusin 拉回(步骤 9)。
  useEffect(() => {
    if (!has('modal')) return
    if (phase !== 'open') return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        closeCard()
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
  }, [closeCard, has, phase])

  const editing = phase !== 'closed'

  return (
    <div className="step-card-slot" ref={slotRef}>
      {has('backdrop') && (
        <div
          aria-hidden="true"
          className="step-card-backdrop"
          data-visible={
            phase === 'opening' || phase === 'open' ? 'true' : undefined
          }
          onClick={closeCard}
          ref={backdropRef}
        />
      )}

      <div
        aria-labelledby={editing ? titleId : undefined}
        aria-modal={editing ? true : undefined}
        className="step-card"
        data-mode={mode}
        data-phase={phase}
        onClick={() => {
          if (phaseRef.current === 'closed') openCard()
        }}
        ref={shellRef}
        role={editing ? 'dialog' : undefined}
        tabIndex={-1}
      >
        <header className="step-card__header">
          <span className="step-card__title" id={titleId}>
            渐进式构建 · 步骤 {level}
          </span>
          {has('chrome') && mode === 'card' ? (
            <GhostIconButton
              aria-label="展开编辑"
              onClick={openCard}
              ref={pencilRef}
              size="sm"
            >
              <Pencil />
            </GhostIconButton>
          ) : (
            <div aria-label="编辑操作" className="step-card__actions" role="group">
              {has('chrome') && (
                <GhostIconButton
                  aria-label="完成"
                  disabled={phase !== 'open'}
                  onClick={closeCard}
                  size="sm"
                >
                  <Check />
                </GhostIconButton>
              )}
              <GhostIconButton
                aria-label="收起"
                disabled={phase !== 'open'}
                onClick={closeCard}
                size="sm"
              >
                <X />
              </GhostIconButton>
            </div>
          )}
        </header>

        <div className="step-card__body">
          {has('editor') ? (
            <RichEditor
              defaultValue={defaultValue}
              disabled={!editing}
              placeholder="写点什么…"
              ref={editorRef}
            />
          ) : (
            <div className="step-card__placeholder">
              <p>静态占位:步骤 1 起换为真实 RichEditor。</p>
              <p>点击卡片展开;用右上角 X 收起。</p>
            </div>
          )}
        </div>

        {has('chrome') && (
          <footer className="step-card__toolbar" inert={phase !== 'open'}>
            <div aria-label="编辑工具栏" className="step-card__toolbar-group" role="group">
              <GhostIconButton
                aria-label="切换粗体"
                disabled={phase !== 'open'}
                onClick={() => editorRef.current?.toggleBold()}
                onPointerDown={(event) => event.preventDefault()}
                size="sm"
              >
                <Bold />
              </GhostIconButton>
              <GhostIconButton
                aria-label="切换无序列表"
                disabled={phase !== 'open'}
                onClick={() => editorRef.current?.toggleBlockFormat('list')}
                onPointerDown={(event) => event.preventDefault()}
                size="sm"
              >
                <List />
              </GhostIconButton>
            </div>
          </footer>
        )}
      </div>
    </div>
  )
}

function StepwiseDemo() {
  const [level, setLevel] = useState(0)
  const current = STEPWISE_STEPS[level]

  return (
    <div className="step-demo">
      <p className="step-demo__note">
        渐进式构建页(构建标记 step-v3,看不到说明未整页刷新)。基线已含
        iOS Safari 状态栏修复(隔离页 G5:关闭后短暂 visibility:hidden
        唤回重采样,约 1 帧后恢复)。从基线出发逐步叠加 rich-editor-card 的
        功能;每一步在真机开合 3~5 次、确认关闭后状态栏恢复系统磨砂,再进入
        下一步——从哪一步开始不恢复,该步新增的功能即与修复存在冲突。
        切换步骤会重置卡片。
      </p>

      <div aria-label="构建步骤" className="step-demo__list" role="list">
        {STEPWISE_STEPS.map((step) => (
          <button
            className="step-demo__step"
            data-current={step.level === level ? 'true' : undefined}
            key={step.key}
            onClick={() => setLevel(step.level)}
            role="listitem"
            type="button"
          >
            <span className="step-demo__step-num">{step.level}</span>
            <span className="step-demo__step-title">{step.title}</span>
          </button>
        ))}
      </div>

      <p className="step-demo__current">当前:步骤 {level} — {current.title}</p>

      <StepwiseCard key={level} defaultValue={stepSample} level={level} />
    </div>
  )
}

export const richEditorCardStepwiseDefinition = {
  id: 'rich-editor-card-stepwise',
  summary:
    '卡片式编辑渐进式构建页:从 F 系列基线逐步叠加 rich-editor-card 功能,每步验证 iOS Safari 状态栏保持恢复',
  status: 'Preview',
  frame: 'plain',
  preview: () => <StepwiseDemo />,
} satisfies ComponentDefinition
