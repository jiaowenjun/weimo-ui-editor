import { useEffect, useMemo, useRef, useState } from 'react'
import { X } from 'lucide-react'

import { GhostIconButton } from 'weimo-ui-core/components/ghost-icon-button'
import { RichEditor, type RichEditorContent, type RichEditorHandle } from 'weimo-ui-editor/components/rich-editor'
import { WdfRender } from 'weimo-ui-editor/components/wdf-render'
import { fromTiptap, toTiptap, type WdfDocument } from 'weimo-wdf'

import { wdfRenderSample } from '../../fixtures/wdf-sample'
import type { ComponentDefinition } from '../../types'

import './mobile-wdf-view.css'

/*
 * 最小可验证演示页(仅 site):MobileWdfView 方案原型。
 *
 * 验证目标(方案 §7 的最小子集):
 * - 双子组件会话模型:查看态只有 WdfRender;进入编辑态按会话挂载 RichEditor
 *   (WdfRender 常驻衬底,编辑器就绪前不可见,避免空白首帧)。
 * - CardShell 稳定容器承载 popover top layer 与 FLIP 动画。
 * - fix-v3 收起清理(属性常驻/滚动恢复/克隆替身 + 1 帧隐藏)在新架构下
 *   是否同样修复 iOS Safari 状态栏白带与落位闪烁。
 *
 * 最小化裁剪(后续再补):无 Esc/焦点陷阱、无 inert、无 visualViewport 键盘
 * 避让、聚焦不自动弹键盘(用户点正文由原生手势聚焦)、转换失败保旧值并
 * console.warn(不阻断收起)。
 */

const EDITOR_READY_TIMEOUT = 800
const KEYBOARD_CLOSE_WAIT = 180
const MORPH_DURATION = 320
const MOBILE_MORPH_DURATION = 500
const MORPH_PAD = 24
const MOBILE_VIEWPORT_QUERY = '(max-width: 640px)'
const DIALOG_MARGIN = 12

type CardPhase = 'view' | 'prepare' | 'opening' | 'edit' | 'closing'

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

/*
 * 复刻 wdf-view 的 toWdfEditorContent(该模块未从包导出):
 * ProseMirror 会省略空 content 数组,镜像该线上形态,避免受控值形状抖动。
 */
function toEditorContent(document: WdfDocument): RichEditorContent {
  return JSON.parse(
    JSON.stringify(toTiptap(document), (_key, value: unknown) =>
      Array.isArray(value) && value.length === 0 ? undefined : value,
    ),
  )
}

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

/* iOS Safari:属性必须常驻,removeAttribute 会让状态栏回退白带(A1/G 系列)。 */
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

function MobileWdfViewCard() {
  const [phase, setPhase] = useState<CardPhase>('view')
  const [editorReady, setEditorReady] = useState(false)
  const [wdf, setWdf] = useState<WdfDocument>(
    () => wdfRenderSample as WdfDocument,
  )

  const slotRef = useRef<HTMLDivElement | null>(null)
  const shellRef = useRef<HTMLDivElement | null>(null)
  const backdropRef = useRef<HTMLDivElement | null>(null)
  const editorRef = useRef<RichEditorHandle | null>(null)
  const phaseRef = useRef<CardPhase>('view')
  const timerRef = useRef<number | null>(null)
  const savedScrollYRef = useRef(0)
  const bodyOverflowRef = useRef('')
  const bodyPaddingRightRef = useRef('')
  const lockedRef = useRef(false)

  phaseRef.current = phase

  // 会话内容快照:进入编辑时从当前 WDF 转换,编辑期间不随外部变化。
  const sessionContent = useMemo(
    () => (phase === 'view' ? null : toEditorContent(wdf)),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅在挂载会话时重算
    [phase !== 'view'],
  )

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current)
      }
      hideFromTopLayer(shellRef.current)
      hideFromTopLayer(backdropRef.current)
      document.body.style.overflow = bodyOverflowRef.current
      document.body.style.paddingRight = bodyPaddingRightRef.current
    }
  }, [])

  const lockBody = () => {
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
  }

  const unlockBody = () => {
    if (!lockedRef.current) return

    lockedRef.current = false
    document.body.style.overflow = bodyOverflowRef.current
    document.body.style.paddingRight = bodyPaddingRightRef.current
  }

  const openCard = () => {
    if (phaseRef.current !== 'view') return

    const shell = shellRef.current
    const slot = slotRef.current
    if (!shell || !slot) return

    phaseRef.current = 'prepare'
    savedScrollYRef.current = window.scrollY
    lockBody()

    const first = shell.getBoundingClientRect()
    slot.style.height = `${slot.getBoundingClientRect().height}px`

    showInTopLayer(backdropRef.current)
    showInTopLayer(shell)

    shell.classList.remove('mwv-card--animating')
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
    // 挂载编辑器层(未就绪不可见,WdfRender 衬底),就绪后再启动展开动画。
    setPhase('prepare')

    const deadline = performance.now() + EDITOR_READY_TIMEOUT
    const poll = () => {
      const ready =
        shell.querySelector('.rich-editor__content') != null ||
        performance.now() >= deadline
      if (!ready) {
        window.setTimeout(poll, 50)
        return
      }
      if (phaseRef.current !== 'prepare' || !shell.isConnected) return

      setEditorReady(true)
      phaseRef.current = 'opening'
      setPhase('opening')

      void shell.getBoundingClientRect()
      const duration = getMorphDuration()
      window.requestAnimationFrame(() => {
        if (phaseRef.current !== 'opening') return
        if (duration > 0) {
          shell.classList.add('mwv-card--animating')
        }
        applyRect(shell, getDialogRect())
      })
      timerRef.current = window.setTimeout(() => {
        if (phaseRef.current !== 'opening' || !shell.isConnected) return

        shell.classList.remove('mwv-card--animating')
        phaseRef.current = 'edit'
        setPhase('edit')
      }, duration + MORPH_PAD)
    }
    window.setTimeout(poll, 50)
  }

  const closeCard = () => {
    if (phaseRef.current !== 'edit') return

    phaseRef.current = 'closing'
    setPhase('closing')

    // 读取最终草稿,fromTiptap 成功才提交;失败保旧值(最小版不阻断收起)。
    const draft = editorRef.current?.getContent()
    if (draft) {
      const result = fromTiptap(draft)
      if (result.ok) {
        setWdf(result.value)
      } else {
        console.warn('[mobile-wdf-view] fromTiptap 转换失败,保留旧文档', result.diagnostics)
      }
    }

    // 先失焦收键盘;键盘收起会改变 visualViewport,等一拍再测几何。
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur()
    }
    const viewport = window.visualViewport
    const keyboardOpen =
      !!viewport && window.innerHeight - viewport.height > 120

    const runClose = () => {
      const shell = shellRef.current
      const slot = slotRef.current
      if (!shell || !slot) return

      const duration = getMorphDuration()
      const target = slot.getBoundingClientRect()

      if (duration > 0) {
        shell.classList.add('mwv-card--animating')
      }
      applyRect(shell, target)

      timerRef.current = window.setTimeout(() => {
        if (phaseRef.current !== 'closing' || !shell.isConnected) return

        // ---- fix-v3 收起清理(顺序与真机验证过的实现一致) ----
        hideFromTopLayer(shell)
        hideFromTopLayer(backdropRef.current)
        shell.classList.remove('mwv-card--animating')
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

        unlockBody()
        if (window.scrollY !== savedScrollYRef.current) {
          window.scrollTo(0, savedScrollYRef.current)
        }

        // Ghost 替身 + 1 帧隐藏:唤回状态栏重采样,像素连续消除闪烁。
        const ghost = shell.cloneNode(true) as HTMLElement
        ghost.setAttribute('aria-hidden', 'true')
        ghost.removeAttribute('id')
        ghost.querySelectorAll('[id]').forEach((node) => {
          node.removeAttribute('id')
        })
        ghost.style.position = 'absolute'
        ghost.style.inset = '0'
        ghost.style.pointerEvents = 'none'
        slot.appendChild(ghost)
        shell.style.visibility = 'hidden'
        const restore = () => {
          if (shellRef.current === shell) {
            shell.style.visibility = ''
          }
          ghost.remove()
          if (phaseRef.current === 'closing') {
            phaseRef.current = 'view'
            setPhase('view')
            setEditorReady(false)
          }
        }
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(restore)
        })
        window.setTimeout(restore, 64)
      }, duration + MORPH_PAD)
    }

    if (keyboardOpen) {
      timerRef.current = window.setTimeout(runClose, KEYBOARD_CLOSE_WAIT)
      return
    }
    runClose()
  }

  const editing = phase !== 'view'

  return (
    <div className="mwv-slot" ref={slotRef}>
      <div
        aria-hidden="true"
        className="mwv-backdrop"
        data-visible={phase === 'opening' || phase === 'edit' ? 'true' : undefined}
        onClick={closeCard}
        ref={backdropRef}
      />

      <div
        aria-label="移动卡片式视图"
        className="mwv-card"
        data-phase={phase}
        onClick={phase === 'view' ? openCard : undefined}
        ref={shellRef}
        role={editing ? 'dialog' : undefined}
        tabIndex={-1}
      >
        <header className="mwv-card__header">
          <span className="mwv-card__title">移动卡片式视图 · mwv-v1</span>
          <GhostIconButton
            aria-label="收起"
            disabled={phase !== 'edit'}
            onClick={closeCard}
            size="sm"
          >
            <X />
          </GhostIconButton>
        </header>

        <div className="mwv-card__body">
          {/* WdfRender 常驻衬底:查看态内容 + 展开准备期的视觉底。 */}
          <div className="mwv-card__render">
            <WdfRender content={wdf} />
          </div>
          {sessionContent && (
            <div
              className="mwv-card__editor-layer"
              data-ready={editorReady ? 'true' : undefined}
            >
              <RichEditor
                autoFocus={false}
                defaultValue={sessionContent}
                placeholder="写点什么…"
                ref={editorRef}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function MobileWdfViewDemo() {
  return (
    <div className="mwv-demo">
      <p className="mwv-demo__note">
        最小可验证演示页(构建标记 mwv-v1,看不到说明未整页刷新)。验证点:
        点卡片展开(编辑器就绪后才开始动画,无空白首帧)→ 点正文可打字 →
        X 收起(草稿经 fromTiptap 提交回 WdfRender)。真机观察:收起后状态栏
        恢复磨砂、落位无闪烁无跳动、页面滚动位置保持。最小版已知裁剪:
        无键盘避让/焦点陷阱,键盘需点正文唤起。
      </p>
      <MobileWdfViewCard />
    </div>
  )
}

export const mobileWdfViewDefinition = {
  id: 'mobile-wdf-view',
  summary:
    'MobileWdfView 最小原型:稳定 CardShell + WdfRender 衬底 + 按会话挂载 RichEditor + fix-v3 收起清理',
  status: 'Preview',
  frame: 'plain',
  preview: () => <MobileWdfViewDemo />,
} satisfies ComponentDefinition
