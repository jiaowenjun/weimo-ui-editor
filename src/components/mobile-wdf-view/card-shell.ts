/*
 * CardShell 纯函数集:MobileWdfView 的几何、popover top layer、
 * fix-v3 收起清理与页面锁定工具。无 React 依赖,便于独立演进与测试。
 *
 * 背景知识(详见 docs/ios-safari-statusbar-toplayer.md):
 * - iOS Safari 中 top layer 元素关闭后若仍可见,状态栏安全区着色不会
 *   重新采样(白带);需经历一次不可见绘制(visibility:hidden 1 帧)恢复。
 * - 隐藏窗口内用克隆替身盖住同一几何,像素连续消除落位闪烁。
 * - popover 属性必须常驻,hidePopover 后同步 removeAttribute 亦会触发白带。
 */

export const MORPH_DURATION = 320
export const MOBILE_MORPH_DURATION = 500
export const MORPH_PAD = 24
export const KEYBOARD_CLOSE_WAIT = 180
export const MOBILE_VIEWPORT_QUERY = '(max-width: 640px)'
export const DIALOG_MARGIN = 12

type PopoverElement = HTMLElement & {
  hidePopover?: () => void
  showPopover?: () => void
}

export type ShellRect = {
  height: number
  left: number
  top: number
  width: number
}

export function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function getMorphDuration() {
  if (prefersReducedMotion()) return 0

  return window.matchMedia(MOBILE_VIEWPORT_QUERY).matches
    ? MOBILE_MORPH_DURATION
    : MORPH_DURATION
}

/** 展开态对话框矩形:跟随 visualViewport,移动端顶部对齐、桌面居中。 */
export function getDialogRect(options?: {
  maxHeight?: number
  maxWidth?: number
}): ShellRect {
  const viewport = window.visualViewport
  const viewportWidth = viewport?.width ?? window.innerWidth
  const viewportHeight = viewport?.height ?? window.innerHeight
  const offsetLeft = viewport?.offsetLeft ?? 0
  const offsetTop = viewport?.offsetTop ?? 0
  const maxWidth = options?.maxWidth ?? 720
  const maxHeight = options?.maxHeight ?? 620
  const width = Math.min(maxWidth, Math.max(280, viewportWidth - DIALOG_MARGIN * 2))
  const height = Math.min(
    maxHeight,
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

export function applyRect(element: HTMLElement, rect: ShellRect) {
  element.style.top = `${rect.top}px`
  element.style.left = `${rect.left}px`
  element.style.width = `${rect.width}px`
  element.style.height = `${rect.height}px`
}

export function showInTopLayer(element: HTMLElement | null) {
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

/**
 * 退出 top layer 但保留 popover 属性(iOS Safari 白带修复之一:
 * 同步 removeAttribute 会让状态栏着色不恢复)。
 */
export function hideFromTopLayer(element: HTMLElement | null) {
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

export function clearShellGeometry(shell: HTMLElement, animatingClass: string) {
  shell.classList.remove(animatingClass)
  shell.style.position = ''
  shell.style.zIndex = ''
  shell.style.margin = ''
  shell.style.right = ''
  shell.style.bottom = ''
  shell.style.top = ''
  shell.style.left = ''
  shell.style.width = ''
  shell.style.height = ''
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

export function getFocusableElements(root: HTMLElement) {
  return Array.from(
    root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  ).filter(
    (element) =>
      element.getClientRects().length > 0 && !element.hasAttribute('inert'),
  )
}

/** 批量 inert 锚点祖先链的兄弟节点(跳过遮罩);返回待还原节点列表。 */
export function inertSiblingsOf(
  anchor: HTMLElement,
  skip: HTMLElement | null,
) {
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

/**
 * fix-v3 视觉交接(iOS Safari 白带修复之三):在最终几何位置克隆壳作为
 * 一次性替身,真实壳短暂 visibility:hidden 约一帧后恢复并移除替身。
 * 返回恢复函数(幂等),rAF 挂起环境由调用方 setTimeout 兜底。
 */
export function stageVisibilityHandoff(shell: HTMLElement, slot: HTMLElement) {
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

  let restored = false
  const restore = () => {
    if (restored) return
    restored = true
    shell.style.visibility = ''
    ghost.remove()
  }

  return restore
}
