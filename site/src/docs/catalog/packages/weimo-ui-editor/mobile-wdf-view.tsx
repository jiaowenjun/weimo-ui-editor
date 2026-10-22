import { useCallback, useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'

import { GhostIconButton } from 'weimo-ui-core/components/ghost-icon-button'
import { RichEditor, type RichEditorContent, type RichEditorHandle } from 'weimo-ui-editor/components/rich-editor'
import { WdfRender } from 'weimo-ui-editor/components/wdf-render'
import { fromTiptap, toTiptap, type WdfDocument } from 'weimo-wdf'

import { wdfRenderSample } from '../../fixtures/wdf-sample'
import type { ComponentDefinition } from '../../types'

import './mobile-wdf-view.css'

/*
 * MobileWdfView 演示页(仅 site):方案完整版原型(mwv-v2)。
 *
 * 架构(方案 §2):稳定 CardShell 承载 popover top layer 与 FLIP 动画;
 * WdfRender 常驻衬底;RichEditor 按会话挂载(onReady 后才启动展开动画);
 * fix-v3 收起清理(属性常驻/滚动恢复/克隆替身 + 1 帧隐藏)。
 *
 * 完整版补齐(相对 mwv-v1):
 * - RichEditor onReady API 替代 DOM 轮询,800ms 看门狗兜底。
 * - visualViewport/resize 跟随(键盘避让):opening 重定向目标,edit 平滑过渡。
 * - 转换失败保留会话:fromTiptap 失败不收起、不清草稿,卡片内提示后重试。
 * - Esc 关闭 + Tab 焦点陷阱 + focusin 拉回;批量 inert 兄弟节点。
 *
 * 交互决策:键盘策略 = 点正文原生唤起(会话挂载使手势内同步聚焦不可行,
 * 已验证可行);autoFocus=false,不在就绪后做程序聚焦。
 */

const EDITOR_READY_TIMEOUT = 800
const KEYBOARD_CLOSE_WAIT = 180
const CONVERSION_ERROR_RESET = 3000
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

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]',
].join(',')

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

function getFocusableElements(root: HTMLElement) {
  return Array.from(
    root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  ).filter(
    (element) =>
      element.getClientRects().length > 0 && !element.hasAttribute('inert'),
  )
}

/* 批量 inert:锚点祖先链的兄弟节点(跳过遮罩),收起时全部移除。 */
function inertSiblingsOf(anchor: HTMLElement, skip: HTMLElement | null) {
  const inerted: HTMLElement[] = []
  let node: HTMLElement | null = anchor

  while (node && node !== document.body) {
    const parentElement: HTMLElement | null = node.parentElement
    if (!parentElement) break

    for (const sibling of Array.from(parentElement.children)) {
      if (sibling === node || sibling === skip) continue
      if (sibling instanceof HTMLElement && !sibling.hasAttribute('inert')) {
        sibling.setAttribute('inert', '')
        inerted.push(sibling)
      }
    }

    node = parentElement
  }

  return inerted
}

function MobileWdfViewCard() {
  const [phase, setPhase] = useState<CardPhase>('view')
  const [editorReady, setEditorReady] = useState(false)
  const [conversionError, setConversionError] = useState(false)
  const [wdf, setWdf] = useState<WdfDocument>(
    () => wdfRenderSample as WdfDocument,
  )

  const slotRef = useRef<HTMLDivElement | null>(null)
  const shellRef = useRef<HTMLDivElement | null>(null)
  const backdropRef = useRef<HTMLDivElement | null>(null)
  const editorRef = useRef<RichEditorHandle | null>(null)
  const phaseRef = useRef<CardPhase>('view')
  const timerRef = useRef<number | null>(null)
  const readyTimerRef = useRef<number | null>(null)
  const errorTimerRef = useRef<number | null>(null)
  const savedScrollYRef = useRef(0)
  const bodyOverflowRef = useRef('')
  const bodyPaddingRightRef = useRef('')
  const inertedRef = useRef<HTMLElement[]>([])
  const lockedRef = useRef(false)

  phaseRef.current = phase

  // 会话内容快照:进入编辑时从当前 WDF 转换,编辑期间不随外部变化;
  // 收起回 view 时清空(卸载编辑器)。
  const [sessionContent, setSessionContent] = useState<RichEditorContent | null>(
    null,
  )

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current)
      }
      if (readyTimerRef.current !== null) {
        window.clearTimeout(readyTimerRef.current)
      }
      if (errorTimerRef.current !== null) {
        window.clearTimeout(errorTimerRef.current)
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

  // 编辑器就绪(onReady)后启动展开动画;幂等,phaseRef 守卫重复触发。
  const startOpening = useCallback(() => {
    const shell = shellRef.current
    if (!shell || phaseRef.current !== 'prepare') return

    if (readyTimerRef.current !== null) {
      window.clearTimeout(readyTimerRef.current)
      readyTimerRef.current = null
    }

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
  }, [])

  const handleEditorReady = useCallback(() => {
    if (phaseRef.current !== 'prepare') return

    // 等一拍让首帧内容真正上屏,避免动画起点拍到骨架屏。
    readyTimerRef.current = window.setTimeout(startOpening, 50)
  }, [startOpening])

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

    if (inertedRef.current.length === 0) {
      inertedRef.current = inertSiblingsOf(shell, backdropRef.current)
    }

    const topLayerSupported = showInTopLayer(backdropRef.current)
    showInTopLayer(shell)
    if (!topLayerSupported) {
      // 降级:无 popover API 的浏览器继续走 fixed+zIndex,可能被祖先
      // overflow/transform 裁剪(演示站文档列场景);现代浏览器均支持,
      // 此路径仅为兜底,产品化需评估降级布局。
      console.warn('[mobile-wdf-view] Popover API 不可用,降级为 fixed 覆盖层')
    }

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
    // 挂载编辑器层(未就绪不可见,WdfRender 衬底);onReady 启动动画,
    // 看门狗兜底编辑器异常挂载失败的情形(仍处 prepare 则直接展开)。
    setEditorReady(false)
    setSessionContent(toEditorContent(wdf))
    setPhase('prepare')
    readyTimerRef.current = window.setTimeout(() => {
      if (phaseRef.current === 'prepare') {
        console.warn('[mobile-wdf-view] editor ready 超时,直接展开')
        startOpening()
      }
    }, EDITOR_READY_TIMEOUT)
  }

  const closeCard = () => {
    if (phaseRef.current !== 'edit') return

    // 先转换;失败保留编辑会话(方案 §3):不收起、不清草稿。
    const draft = editorRef.current?.getContent()
    if (draft) {
      const result = fromTiptap(draft)
      if (!result.ok) {
        console.warn('[mobile-wdf-view] fromTiptap 转换失败,保留编辑会话', result.diagnostics)
        setConversionError(true)
        if (errorTimerRef.current !== null) {
          window.clearTimeout(errorTimerRef.current)
        }
        errorTimerRef.current = window.setTimeout(
          () => setConversionError(false),
          CONVERSION_ERROR_RESET,
        )
        return
      }
      setWdf(result.value)
    }

    phaseRef.current = 'closing'
    setPhase('closing')

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
        for (const element of inertedRef.current) {
          element.removeAttribute('inert')
        }
        inertedRef.current = []
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
            setSessionContent(null)
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

  // 键盘避让(方案 §3):opening/opening 期间跟随 visualViewport 调整几何。
  useEffect(() => {
    if (phase !== 'opening' && phase !== 'edit') return

    const updateGeometry = () => {
      const shell = shellRef.current
      const currentPhase = phaseRef.current
      if (!shell || (currentPhase !== 'opening' && currentPhase !== 'edit')) {
        return
      }

      if (currentPhase === 'opening') {
        applyRect(shell, getDialogRect())
        return
      }

      shell.classList.add('mwv-card--animating')
      applyRect(shell, getDialogRect())
      window.setTimeout(() => {
        if (phaseRef.current === 'edit') {
          shell.classList.remove('mwv-card--animating')
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
  }, [phase])

  // Esc 关闭 + Tab 焦点陷阱 + focusin 拉回(方案 §3 modal 行为)。
  useEffect(() => {
    if (phase !== 'edit') return

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
      if (phaseRef.current !== 'edit') return

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
  }, [closeCard, phase])

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
          <span className="mwv-card__title">移动卡片式视图 · mwv-v2</span>
          <GhostIconButton
            aria-label="收起"
            disabled={phase !== 'edit'}
            onClick={closeCard}
            size="sm"
          >
            <X />
          </GhostIconButton>
        </header>

        {conversionError && (
          <p className="mwv-card__error" role="alert">
            草稿转换失败,已保留编辑内容;请调整格式后重试收起。
          </p>
        )}

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
                onReady={handleEditorReady}
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
        MobileWdfView 完整版演示页(构建标记 mwv-v2,看不到说明未整页刷新)。
        验证点:点卡片展开(编辑器 onReady 后才启动动画,无空白首帧)→ 点正文
        打字(键盘原生唤起;弹出时对话框会避让收进可见视口)→ X 或 Esc 收起
        (草稿经 fromTiptap 提交回 WdfRender;转换失败会保留编辑会话并提示)。
        真机观察:收起后状态栏恢复磨砂、无闪烁无跳动、滚动位置保持。
      </p>
      <MobileWdfViewCard />
    </div>
  )
}

export const mobileWdfViewDefinition = {
  id: 'mobile-wdf-view',
  summary:
    'MobileWdfView 完整版原型:CardShell + WdfRender 衬底 + 按会话挂载 RichEditor(onReady) + vv 键盘避让 + fix-v3 收起清理',
  status: 'Preview',
  frame: 'plain',
  preview: () => <MobileWdfViewDemo />,
} satisfies ComponentDefinition
