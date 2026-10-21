import { useEffect, useRef, useState, type ReactNode } from 'react'

import { TextButton } from 'weimo-ui-core/components/text-button'
import type { ComponentDefinition } from '../../types'

import './rich-editor-card-isolation.css'

/*
 * 诊断页(仅 site):逐个复刻 rich-editor-card 展开流程中的单一机制,
 * 用于在 iOS Safari 真机上定位状态栏白带的根因。
 *
 * 已排除:浮层阴影/遮罩、软键盘(见 rich-editor-card-no-shadow)。
 * 弹出式编辑页(portal + fixed + z-index,不进 top layer)关闭后状态栏
 * 保持透明,据此锁定四个待验证机制,每节实验只复刻其中一个,时序与
 * rich-editor-card.tsx 逐字一致:
 * - A: Popover API top layer 往返(showPopover/hidePopover/removeAttribute)
 * - B: body 滚动锁(overflow hidden + paddingRight 补偿,直接写 inline style)
 * - C: 祖先链兄弟节点批量 inert
 * - D: FLIP 固定几何动画(fixed + zIndex + 强制回流 + slot 钉高)
 */

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

const MOBILE_VIEWPORT_QUERY = '(max-width: 640px)'
const DIALOG_MARGIN = 12
const FLIP_DURATION = 320
const MOBILE_FLIP_DURATION = 1000
const FLIP_DURATION_PAD = 24

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function getFlipDuration() {
  if (prefersReducedMotion()) return 0

  return window.matchMedia(MOBILE_VIEWPORT_QUERY).matches
    ? MOBILE_FLIP_DURATION
    : FLIP_DURATION
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

function ExperimentSection({
  badge,
  description,
  open,
  onToggle,
  openLabel = '开启',
  closeLabel = '关闭',
  statusHint,
  target,
  children,
}: {
  badge: string
  description: ReactNode
  open: boolean
  onToggle: () => void
  openLabel?: string
  closeLabel?: string
  statusHint?: string
  target?: ReactNode
  children?: ReactNode
}) {
  return (
    <section className="ric-iso-section">
      <header className="ric-iso-section__header">
        <span className="ric-iso-section__badge">{badge}</span>
        <span
          className="ric-iso-section__status"
          data-on={open ? 'true' : undefined}
        >
          {open ? statusHint ?? '已开启' : '已关闭'}
        </span>
        <TextButton onClick={onToggle}>{open ? closeLabel : openLabel}</TextButton>
      </header>
      <p className="ric-iso-section__desc">{description}</p>
      {target}
      {children}
    </section>
  )
}

/* --- 实验 A:Popover API top layer 往返 --- */

function PopoverRoundTripRow({
  keepAttribute,
  label,
  note,
}: {
  keepAttribute: boolean
  label: string
  note: string
}) {
  const [open, setOpen] = useState(false)
  const targetRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const target = targetRef.current

    return () => {
      try {
        ;(target as PopoverElement | null)?.hidePopover?.()
      } catch {
        // 卸载兜底,失败忽略
      }
      target?.removeAttribute('popover')
    }
  }, [])

  const toggle = () => {
    const target = targetRef.current as PopoverElement | null
    if (!target) return

    // 以 DOM 实际状态为准,而非 React 状态:连点/同步连击不会误判分支。
    if (!target.matches(':popover-open')) {
      if (!target.hasAttribute('popover')) {
        target.setAttribute('popover', 'manual')
      }
      try {
        target.showPopover?.()
      } catch {
        // 浏览器不支持时按已开处理,便于观察 CSS 差异
      }
      setOpen(true)
      return
    }

    // 与卡片 hideFromTopLayer 逐字一致:同步 hidePopover + removeAttribute。
    try {
      if (
        typeof target.hidePopover === 'function' &&
        target.matches(':popover-open')
      ) {
        target.hidePopover()
      }
    } catch {
      // 已在关闭流程里时忽略
    }
    if (!keepAttribute) {
      target.removeAttribute('popover')
    }
    setOpen(false)
  }

  return (
    <div className="ric-iso-row">
      <div className="ric-iso-row__head">
        <strong>{label}</strong>
        <span className="ric-iso-row__note">{note}</span>
        <TextButton onClick={toggle}>{open ? '关闭' : '开启'}</TextButton>
        <span
          className="ric-iso-section__status"
          data-on={open ? 'true' : undefined}
        >
          {open ? '已开启' : '已关闭'}
        </span>
      </div>
      {/* popover="manual" 初始即隐藏;首次开启补 setAttribute 的分支与卡片一致 */}
      <div className="ric-iso-popover-target" popover="manual" ref={targetRef}>
        {label}:top layer 元素(开启时可见)
      </div>
    </div>
  )
}

function NativeDialogRow() {
  const [open, setOpen] = useState(false)
  const dialogRef = useRef<HTMLDialogElement | null>(null)

  const toggle = () => {
    const dialog = dialogRef.current
    if (!dialog) return

    if (!dialog.open) {
      dialog.showModal()
      setOpen(true)
      return
    }

    dialog.close()
    setOpen(false)
  }

  return (
    <div className="ric-iso-row">
      <div className="ric-iso-row__head">
        <strong>A3 原生 dialog 对照</strong>
        <span className="ric-iso-row__note">
          showModal/close,同样进 top layer。模态期间页面其余部分不可交互
          (原生行为),请用对话框内的关闭按钮或 Esc 关闭
        </span>
        <TextButton onClick={toggle}>{open ? '关闭' : '开启'}</TextButton>
        <span
          className="ric-iso-section__status"
          data-on={open ? 'true' : undefined}
        >
          {open ? '已开启' : '已关闭'}
        </span>
      </div>
      <dialog
        className="ric-iso-dialog"
        onClose={() => setOpen(false)}
        ref={dialogRef}
      >
        <p>A3:原生 dialog(top layer 对照)</p>
        <TextButton onClick={toggle}>{open ? '关闭' : '开启'}</TextButton>
      </dialog>
    </div>
  )
}

/* --- 实验 B:body 滚动锁 --- */

function ScrollLockExperiment() {
  const [locked, setLocked] = useState(false)
  const overflowRef = useRef('')
  const paddingRef = useRef('')

  useEffect(() => {
    return () => {
      // 卸载兜底:不能把 body 留在锁定态
      document.body.style.overflow = overflowRef.current
      document.body.style.paddingRight = paddingRef.current
    }
  }, [])

  const toggle = () => {
    if (!locked) {
      overflowRef.current = document.body.style.overflow
      paddingRef.current = document.body.style.paddingRight
      const scrollbarWidth =
        window.innerWidth - document.documentElement.clientWidth

      document.body.style.overflow = 'hidden'
      if (scrollbarWidth > 0) {
        const currentPadding = paddingRef.current || '0px'
        document.body.style.paddingRight = `calc(${currentPadding} + ${scrollbarWidth}px)`
      }
      setLocked(true)
      return
    }

    document.body.style.overflow = overflowRef.current
    document.body.style.paddingRight = paddingRef.current
    setLocked(false)
  }

  return (
    <ExperimentSection
      badge="B"
      description="复刻 lockPage/unlockPage 的 body inline style 写法与恢复时机(不含 inert)。开启后页面应不可滚动。判定:开关循环 3~5 次后状态栏是否出现白带。"
      onToggle={toggle}
      open={locked}
      openLabel="锁定滚动"
      closeLabel="恢复滚动"
      statusHint="已锁定"
    />
  )
}

/* --- 实验 C:祖先链兄弟节点批量 inert --- */

function InertExperiment() {
  const [active, setActive] = useState(false)
  const [inertedCount, setInertedCount] = useState(0)
  const inertedRef = useRef<HTMLElement[]>([])
  const anchorRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    return () => {
      for (const element of inertedRef.current) {
        element.removeAttribute('inert')
      }
      inertedRef.current = []
    }
  }, [])

  const toggle = () => {
    if (!active) {
      const anchor = anchorRef.current
      if (!anchor) return

      const inerted: HTMLElement[] = []
      let node: HTMLElement | null = anchor

      while (node && node !== document.body) {
        const parentElement: HTMLElement | null = node.parentElement
        if (!parentElement) break

        for (const sibling of Array.from(parentElement.children)) {
          if (sibling === node) continue
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
      setInertedCount(inerted.length)
      setActive(true)
      return
    }

    for (const element of inertedRef.current) {
      element.removeAttribute('inert')
    }
    inertedRef.current = []
    setInertedCount(0)
    setActive(false)
  }

  return (
    <section className="ric-iso-section">
      {/* 锚点必须包住本节开关:inert 作用在锚点祖先链的兄弟节点上,
          开关放在锚点外会被自己 inert(真机已踩坑)。 */}
      <div className="ric-iso-anchor" ref={anchorRef}>
        <header className="ric-iso-section__header">
          <span className="ric-iso-section__badge">C</span>
          <span
            className="ric-iso-section__status"
            data-on={active ? 'true' : undefined}
          >
            {active ? `已 inert ${inertedCount} 个节点` : '已关闭'}
          </span>
          <TextButton onClick={toggle}>
            {active ? '移除 inert' : '批量 inert'}
          </TextButton>
        </header>
        <p className="ric-iso-section__desc">
          复刻 lockPage 的 inert 循环:对本节锚点祖先链的兄弟节点批量加/去
          inert。开启后页面其余部分(导航、其他实验)应不可交互,本节开关不受影响。判定:开关循环后状态栏是否出现白带。
        </p>
      </div>
    </section>
  )
}

/* --- 实验 D:FLIP 固定几何动画 --- */

type FlipPhase = 'closed' | 'opening' | 'open' | 'closing'

function FlipGeometryExperiment() {
  const [phase, setPhase] = useState<FlipPhase>('closed')
  const phaseRef = useRef<FlipPhase>('closed')
  const timerRef = useRef<number | null>(null)
  const slotRef = useRef<HTMLDivElement | null>(null)
  const shellRef = useRef<HTMLDivElement | null>(null)

  phaseRef.current = phase

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current)
      }
    }
  }, [])

  const openFlip = () => {
    if (phaseRef.current !== 'closed') return

    const shell = shellRef.current
    const slot = slotRef.current
    if (!shell || !slot) return

    phaseRef.current = 'opening'

    const first = shell.getBoundingClientRect()
    const slotRect = slot.getBoundingClientRect()
    slot.style.height = `${slotRect.height}px`

    shell.classList.remove('ric-iso-flip__shell--animating')
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

    void shell.getBoundingClientRect()

    const duration = getFlipDuration()

    window.requestAnimationFrame(() => {
      if (phaseRef.current !== 'opening' || !shell.isConnected) return

      if (duration > 0) {
        shell.classList.add('ric-iso-flip__shell--animating')
      }
      applyRect(shell, getDialogRect())
    })

    timerRef.current = window.setTimeout(() => {
      if (phaseRef.current !== 'opening' || !shell.isConnected) return

      shell.classList.remove('ric-iso-flip__shell--animating')
      phaseRef.current = 'open'
      setPhase('open')
    }, duration + FLIP_DURATION_PAD)
  }

  const closeFlip = () => {
    if (phaseRef.current !== 'open') return

    const shell = shellRef.current
    const slot = slotRef.current
    if (!shell || !slot) return

    phaseRef.current = 'closing'
    // ref 与 state 必须同步写:render 里的 phaseRef.current = phase 会在
    // 收起动画期间的任意重渲染时覆盖 ref,清理定时器的守卫就会失效。
    setPhase('closing')

    const duration = getFlipDuration()
    const target = slot.getBoundingClientRect()

    if (duration > 0) {
      shell.classList.add('ric-iso-flip__shell--animating')
    }
    applyRect(shell, {
      top: target.top,
      left: target.left,
      width: target.width,
      height: target.height,
    })

    timerRef.current = window.setTimeout(() => {
      if (phaseRef.current !== 'closing' || !shell.isConnected) return

      shell.classList.remove('ric-iso-flip__shell--animating')
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
      phaseRef.current = 'closed'
      setPhase('closed')
    }, duration + FLIP_DURATION_PAD)
  }

  const busy = phase === 'opening' || phase === 'closing'

  return (
    <ExperimentSection
      badge="D"
      description="复刻 FLIP 几何(无 popover、无滚动锁、无 inert):fixed + zIndex 101 + 强制回流 + slot 钉高,动画到与卡片相同的 dialog 矩形再返回。判定:开合循环后状态栏是否出现白带。"
      open={phase !== 'closed'}
      onToggle={() => {
        if (phase === 'closed') openFlip()
        if (phase === 'open') closeFlip()
      }}
      openLabel="展开"
      closeLabel="收起"
      statusHint={busy ? '动画中…' : '已展开'}
    >
      <div className="ric-iso-flip-slot" ref={slotRef}>
        <div className="ric-iso-flip__shell" ref={shellRef}>
          D:FLIP 几何元素
        </div>
      </div>
    </ExperimentSection>
  )
}

function RichEditorCardIsolationDemo() {
  return (
    <div className="ric-iso-demo">
      <p className="ric-iso-note">
        机制隔离诊断页:四个实验各自只复刻卡片展开流程中的一个机制,互不叠加。
        请一次只操作一个实验,开合 3~5 次;状态栏出现白带即停下,记录是哪个实验。
        白带出现后可上下滚动页面或切换标签页再返回,观察是否恢复(区分渲染残留与持久状态)。
      </p>

      <section className="ric-iso-section">
        <header className="ric-iso-section__header">
          <span className="ric-iso-section__badge">A</span>
          <span className="ric-iso-section__title">Popover API top layer 往返</span>
        </header>
        <p className="ric-iso-section__desc">
          复刻 showInTopLayer/hideFromTopLayer 的时序。A1 与卡片逐字一致
          (hidePopover 后同步 removeAttribute);A2 保留 popover 属性;
          A3 用原生 dialog 对照。判定:哪个变体开合循环后状态栏出现白带。
        </p>
        <PopoverRoundTripRow
          keepAttribute={false}
          label="A1 hidePopover + removeAttribute"
          note="与卡片一致"
        />
        <PopoverRoundTripRow
          keepAttribute
          label="A2 hidePopover 保留属性"
          note="时序变体"
        />
        <NativeDialogRow />
      </section>

      <ScrollLockExperiment />
      <InertExperiment />
      <FlipGeometryExperiment />
    </div>
  )
}

export const richEditorCardIsolationDefinition = {
  id: 'rich-editor-card-isolation',
  summary:
    '卡片式编辑机制隔离诊断页:单复刻 Popover 往返/滚动锁/inert/FLIP,定位 iOS Safari 状态栏白带根因',
  status: 'Preview',
  frame: 'plain',
  preview: () => <RichEditorCardIsolationDemo />,
} satisfies ComponentDefinition
