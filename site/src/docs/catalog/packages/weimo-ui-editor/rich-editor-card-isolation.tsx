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

/* --- 实验 E:Popover 关闭路径变体 --- */

function applyTestGeometry(element: HTMLElement) {
  element.style.position = 'fixed'
  element.style.zIndex = '101'
  applyRect(element, getDialogRect())
}

function clearTestGeometry(element: HTMLElement) {
  element.style.position = ''
  element.style.zIndex = ''
  element.style.top = ''
  element.style.left = ''
  element.style.width = ''
  element.style.height = ''
}

/* 卡片 lockPage 的 inert 循环:锚点祖先链的兄弟节点批量加 inert。 */
function inertSiblingsOf(anchor: HTMLElement) {
  const inerted: HTMLElement[] = []
  let node: HTMLElement | null = anchor

  while (node && node !== document.body) {
    const parentElement: HTMLElement | null = node.parentElement
    if (!parentElement) break

    for (const sibling of Array.from(parentElement.children)) {
      if (sibling === node) continue
      if (sibling instanceof HTMLElement && !sibling.hasAttribute('inert')) {
        sibling.setAttribute('inert', '')
        inerted.push(sibling)
      }
    }

    node = parentElement
  }

  return inerted
}

/*
 * 基线(实验 A2 实测):popover 开启期间状态栏脱掉系统磨砂(页面背景直透),
 * 关闭后恢复——这是健康表现,真正的 bug 是「关闭后未恢复」。
 * E1(同步清理/全覆盖几何/滚动锁/focus)实测可恢复;F 系列在此基线上
 * 每次只加一个卡片特有因素(FLIP 过渡/inert/滚动容器/可见遮罩/软键盘)。
 */
function ClosePathVariantRow({
  deferCleanup = false,
  lockBody = false,
  useGeometry = false,
  nudgeScroll = false,
  inertSiblings = false,
  animateGeometry = false,
  useScroller = false,
  editableFocus = false,
  twinVisible = false,
  label,
  note,
}: {
  deferCleanup?: boolean
  lockBody?: boolean
  useGeometry?: boolean
  nudgeScroll?: boolean
  inertSiblings?: boolean
  animateGeometry?: boolean
  useScroller?: boolean
  editableFocus?: boolean
  twinVisible?: boolean
  label: string
  note: string
}) {
  const [open, setOpen] = useState(false)
  const targetRef = useRef<HTMLDivElement | null>(null)
  const twinRef = useRef<HTMLDivElement | null>(null)
  const rowRef = useRef<HTMLDivElement | null>(null)
  const scrollerRef = useRef<HTMLDivElement | null>(null)
  const editableRef = useRef<HTMLDivElement | null>(null)
  const bodyOverflowRef = useRef('')
  const bodyPaddingRef = useRef('')
  const inertedRef = useRef<HTMLElement[]>([])
  const naturalRectRef = useRef<Rect | null>(null)
  const closeTimerRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      try {
        ;(targetRef.current as PopoverElement | null)?.hidePopover?.()
      } catch {
        // 卸载兜底
      }
      try {
        ;(twinRef.current as PopoverElement | null)?.hidePopover?.()
      } catch {
        // 卸载兜底
      }
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current)
      }
      if (lockBody) {
        document.body.style.overflow = bodyOverflowRef.current
        document.body.style.paddingRight = bodyPaddingRef.current
      }
      for (const element of inertedRef.current) {
        element.removeAttribute('inert')
      }
    }
  }, [lockBody])

  const finishClose = () => {
    closeTimerRef.current = null

    try {
      const target = targetRef.current as PopoverElement | null
      if (target?.matches(':popover-open')) {
        target.hidePopover?.()
      }
    } catch {
      // 已在关闭流程里时忽略
    }
    try {
      const twin = twinRef.current as PopoverElement | null
      if (twinVisible && twin?.matches(':popover-open')) {
        twin.hidePopover?.()
      }
    } catch {
      // 忽略
    }

    const cleanup = () => {
      const target = targetRef.current
      if (target) {
        target.classList.remove('ric-iso-popover-target--animating')
        clearTestGeometry(target)
      }
      if (lockBody) {
        document.body.style.overflow = bodyOverflowRef.current
        document.body.style.paddingRight = bodyPaddingRef.current
      }
      for (const element of inertedRef.current) {
        element.removeAttribute('inert')
      }
      inertedRef.current = []
      if (useScroller && scrollerRef.current) {
        scrollerRef.current.scrollTop = 0
      }
      rowRef.current?.querySelector<HTMLElement>('button')?.focus()
    }

    if (deferCleanup) {
      window.setTimeout(cleanup, 0)
    } else {
      cleanup()
    }
    setOpen(false)

    // 关闭后给 Safari 一次滚动扰动,验证能否强制状态栏重新采样。
    if (nudgeScroll) {
      window.setTimeout(() => {
        window.scrollBy(0, 4)
        window.setTimeout(() => window.scrollBy(0, -4), 50)
      }, 300)
    }
  }

  const toggle = () => {
    // FLIP 收起动画进行中,忽略连点。
    if (closeTimerRef.current !== null) return

    const target = targetRef.current as PopoverElement | null
    if (!target) return

    if (!target.matches(':popover-open')) {
      try {
        target.showPopover?.()
      } catch {
        // 不支持时按已开处理
      }
      if (twinVisible) {
        try {
          ;(twinRef.current as PopoverElement | null)?.showPopover?.()
        } catch {
          // 忽略
        }
      }

      if (animateGeometry) {
        // FLIP:先钉在自身矩形,强制回流后过渡到 dialog 矩形。
        const first = target.getBoundingClientRect()
        naturalRectRef.current = {
          top: first.top,
          left: first.left,
          width: first.width,
          height: first.height,
        }
        target.classList.remove('ric-iso-popover-target--animating')
        target.style.position = 'fixed'
        target.style.zIndex = '101'
        applyRect(target, naturalRectRef.current)
        void target.getBoundingClientRect()

        const duration = getFlipDuration()
        window.requestAnimationFrame(() => {
          const el = targetRef.current
          if (!el?.matches(':popover-open')) return
          if (duration > 0) {
            el.classList.add('ric-iso-popover-target--animating')
          }
          applyRect(el, getDialogRect())
        })
      } else if (useGeometry) {
        applyTestGeometry(target)
      }

      if (inertSiblings && rowRef.current) {
        inertedRef.current = inertSiblingsOf(rowRef.current)
      }
      if (lockBody) {
        bodyOverflowRef.current = document.body.style.overflow
        bodyPaddingRef.current = document.body.style.paddingRight
        document.body.style.overflow = 'hidden'
      }
      if (useScroller && scrollerRef.current) {
        scrollerRef.current.scrollTop = 160
      }
      if (editableFocus && editableRef.current) {
        editableRef.current.focus()
      }
      setOpen(true)
      return
    }

    if (animateGeometry && targetRef.current && naturalRectRef.current) {
      // 复刻卡片收起:仍在 top layer 时先过渡回槽位矩形,动画结束后退出。
      setOpen(false)
      const el = targetRef.current
      const duration = getFlipDuration()
      if (duration > 0) {
        el.classList.add('ric-iso-popover-target--animating')
      }
      applyRect(el, naturalRectRef.current)
      closeTimerRef.current = window.setTimeout(
        finishClose,
        duration + FLIP_DURATION_PAD,
      )
      return
    }

    finishClose()
  }

  return (
    <div className="ric-iso-row" ref={rowRef}>
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
      {/* 开启后的 fixed 矩形会盖住行首按钮,关闭按钮必须放在 popover 内部。 */}
      <div className="ric-iso-popover-target" popover="manual" ref={targetRef}>
        <span>{label}</span>
        {useScroller && (
          <div className="ric-iso-scroll-box" ref={scrollerRef}>
            <p>内部滚动容器:第一段。</p>
            <p>第二段,展开时会滚动到中部。</p>
            <p>第三段。</p>
            <p>第四段,关闭时回到顶部。</p>
            <p>第五段。</p>
            <p>第六段。</p>
          </div>
        )}
        {editableFocus && (
          <div className="ric-iso-editable" contentEditable ref={editableRef}>
            可编辑正文,展开时会聚焦并弹出软键盘
          </div>
        )}
        <TextButton onClick={toggle}>{open ? '关闭' : '开启'}</TextButton>
      </div>
      {twinVisible && (
        <div className="ric-iso-popover-target" popover="manual" ref={twinRef}>
          可见遮罩孪生元素(与主浮层一起进出 top layer)
        </div>
      )}
    </div>
  )
}

/* 卡片实际会同时把壳与遮罩两个元素送进 top layer(no-shadow 页的遮罩
 * display:none 但仍被提升),复刻双元素同 tick 依次退出的情形。 */
function TwinPopoverRow() {
  const [open, setOpen] = useState(false)
  const targetRef = useRef<HTMLDivElement | null>(null)
  const twinRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    return () => {
      for (const element of [targetRef.current, twinRef.current]) {
        try {
          ;(element as PopoverElement | null)?.hidePopover?.()
        } catch {
          // 卸载兜底
        }
      }
    }
  }, [])

  const toggle = () => {
    const target = targetRef.current as PopoverElement | null
    const twin = twinRef.current as PopoverElement | null
    if (!target) return

    if (!target.matches(':popover-open')) {
      try {
        target.showPopover?.()
      } catch {
        // 不支持时按已开处理
      }
      try {
        twin?.showPopover?.()
      } catch {
        // display:none 的孪生元素,失败忽略
      }
      setOpen(true)
      return
    }

    try {
      target.hidePopover?.()
    } catch {
      // 忽略
    }
    try {
      twin?.hidePopover?.()
    } catch {
      // 忽略
    }
    setOpen(false)
  }

  return (
    <div className="ric-iso-row">
      <div className="ric-iso-row__head">
        <strong>E3 双元素同 tick 退出</strong>
        <span className="ric-iso-row__note">
          壳 + 隐藏遮罩两个 popover 一起进出 top layer,无其他变更
        </span>
        <TextButton onClick={toggle}>{open ? '关闭' : '开启'}</TextButton>
        <span
          className="ric-iso-section__status"
          data-on={open ? 'true' : undefined}
        >
          {open ? '已开启' : '已关闭'}
        </span>
      </div>
      <div className="ric-iso-popover-target" popover="manual" ref={targetRef}>
        E3:可见 popover
      </div>
      <div
        className="ric-iso-popover-target ric-iso-popover-target--hidden"
        popover="manual"
        ref={twinRef}
      >
        E3:隐藏孪生元素
      </div>
    </div>
  )
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
        机制隔离诊断页(构建标记 iso-v4,看不到此标记说明未整页刷新)。
        基线(实验 A2/E1 实测):popover 开启期间状态栏脱掉系统磨砂(页面
        背景直透),关闭后恢复磨砂——这是健康表现,真正的 bug 是「关闭后
        未恢复」。请一次只操作一个实验,开合 3~5 次;关闭后未恢复才算复现。
        E/F 系列开启后的浮层是全覆盖矩形,请用浮层内部的按钮关闭。
      </p>

      <section className="ric-iso-section">
        <header className="ric-iso-section__header">
          <span className="ric-iso-section__badge">A</span>
          <span className="ric-iso-section__title">Popover API top layer 往返</span>
        </header>
        <p className="ric-iso-section__desc">
          复刻 showInTopLayer/hideFromTopLayer 的时序。A1 与卡片逐字一致
          (hidePopover 后同步 removeAttribute,已定罪:关闭后白带不恢复);
          A2 保留属性(关闭后恢复);A3 用原生 dialog 对照。判定:关闭后
          状态栏是否恢复透明。
        </p>
        <PopoverRoundTripRow
          keepAttribute={false}
          label="A1 hidePopover + removeAttribute"
          note="已定罪:关闭后白带不恢复"
        />
        <PopoverRoundTripRow
          keepAttribute
          label="A2 hidePopover 保留属性"
          note="基线:开=白带,关=恢复"
        />
        <NativeDialogRow />
      </section>

      <section className="ric-iso-section">
        <header className="ric-iso-section__header">
          <span className="ric-iso-section__badge">E</span>
          <span className="ric-iso-section__title">Popover 关闭路径变体</span>
        </header>
        <p className="ric-iso-section__desc">
          卡片关闭路径在 hidePopover 同一个 tick 里还有大量同步变更(清 fixed
          几何、解锁滚动、移除 inert、focus),本节验证哪类变更破坏恢复。
          E1/E2/E5 开启后的浮层是全覆盖矩形,会盖住行首按钮——请用浮层内部
          的按钮关闭。判定:关闭后状态栏是否恢复透明。
        </p>
        <ClosePathVariantRow
          deferCleanup={false}
          lockBody
          useGeometry
          label="E1 同步清理(复刻卡片关闭 tick)"
          note="hidePopover 同 tick 清几何+解锁+focus;开启后用浮层内按钮关闭"
        />
        <ClosePathVariantRow
          deferCleanup
          lockBody
          useGeometry
          label="E2 延迟清理"
          note="hidePopover 后 setTimeout(0) 再做同样清理"
        />
        <TwinPopoverRow />
        <ClosePathVariantRow
          deferCleanup={false}
          lockBody
          useGeometry={false}
          label="E4 仅滚动锁组合"
          note="hidePopover 同 tick 恢复 body,无几何无 focus"
        />
        <ClosePathVariantRow
          deferCleanup={false}
          lockBody
          nudgeScroll
          useGeometry
          label="E5 同步清理 + 关闭后滚动扰动"
          note="同 E1,关闭 300ms 后 scrollBy ±4px,验证能否强制恢复"
        />
      </section>

      <section className="ric-iso-section">
        <header className="ric-iso-section__header">
          <span className="ric-iso-section__badge">F</span>
          <span className="ric-iso-section__title">
            Popover + 单一卡片增量
          </span>
        </header>
        <p className="ric-iso-section__desc">
          E1 基线(同步清理+全覆盖几何+滚动锁,实测可恢复)之上,每次只加一个
          卡片特有的因素。开启后的浮层是全覆盖矩形,请用浮层内部的按钮关闭。
          判定:关闭后状态栏是否恢复系统磨砂态。
        </p>
        <ClosePathVariantRow
          inertSiblings
          lockBody
          useGeometry
          label="F1 + 批量 inert"
          note="开启期间祖先链兄弟 inert,关闭同 tick 移除"
        />
        <ClosePathVariantRow
          animateGeometry
          lockBody
          label="F2 + FLIP 过渡"
          note="几何带 320ms/移动端 1s 过渡,收起先动画回槽位再退 top layer"
        />
        <ClosePathVariantRow
          lockBody
          useGeometry
          useScroller
          label="F3 + 内部滚动容器"
          note="浮层内有 overflow 滚动区,开启滚到中部,关闭归零"
        />
        <ClosePathVariantRow
          lockBody
          twinVisible
          useGeometry
          label="F4 + 可见遮罩孪生"
          note="第二个可见 popover 与主浮层一起进出 top layer"
        />
        <ClosePathVariantRow
          editableFocus
          lockBody
          useGeometry
          label="F5 + contenteditable 聚焦"
          note="开启即聚焦可编辑区并弹出软键盘"
        />
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
