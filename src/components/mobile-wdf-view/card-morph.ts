import { useCallback, useMemo, type RefObject } from 'react'

import {
  applyRect,
  getDialogRect,
  getMorphDuration,
  MORPH_PAD,
  type ShellRect,
} from './card-shell'

import type { CardPhase } from './mobile-wdf-view'

export const ANIMATING_CLASS = 'mobile-wdf-view__card--animating'

/**
 * Card Morph(内部简化阶段三):卡片几何动画面。
 *
 * 职责:折叠矩形的捕获与钉固、展开/收起飞行(FLIP)、收起目标高度
 * 测量(克隆探针)、动画完成通知(onArrive 回调交还协调器做相位转换)。
 * 全部经 card-shell 原语落地,不重新实现;不决定文档提交、不碰
 * Popover 提升与页面滚动(归属协调器/后续视口模块)。
 *
 * 行为与拆分前逐行等价:飞行的 rAF/定时器守卫(session + phase)与
 * 完成次序(先移除动画类,再通知到达)保持不变。
 */
export type CardMorph = {
  /** 捕获折叠矩形并钉住 slot 高度(openCard 步骤 5-6 几何面)。 */
  captureFoldedRect: () => ShellRect | null
  /** 清动画类 + 内联 fixed 基础几何 + 钉在折叠矩形(步骤 9-10)。 */
  fixShellAtFolded: (rect: ShellRect) => void
  /** 展开飞行:rAF 加动画类并飞向对话框矩形;到达回调(步骤 4-5)。 */
  flyToDialog: (session: number, onArrive: () => void) => void
  /** 收起飞行:克隆探针测新内容高 → 对齐钉高 → 飞回槽位;到达回调。 */
  flyToFolded: (session: number, onArrive: () => void) => void
  /** 「收起后的 view 态卡片高度」克隆探针测量(失败 null 回退钉高)。 */
  measureNextViewHeight: () => number | null
}

export function useCardMorph({
  shellRef,
  slotRef,
  phaseRef,
  isCurrentSession,
}: {
  shellRef: RefObject<HTMLDivElement | null>
  slotRef: RefObject<HTMLDivElement | null>
  phaseRef: RefObject<CardPhase>
  isCurrentSession: (session: number) => boolean
}): CardMorph {
  /**
   * 测量「收起后的 view 态卡片高度」:克隆衬底 DOM 到脱离会话布局的
   * 隐藏探针(定宽、高自动)读内容高度。不能直接读 render.scrollHeight
   * ——会话态衬底是 absolute inset:0,scrollHeight 下限是盒高(对话框
   * body 高),短内容会被抬高。测量失败返回 null,回退钉住矩形。
   */
  const measureNextViewHeight = useCallback((): number | null => {
    const shell = shellRef.current
    const slot = slotRef.current
    const render = shell?.querySelector<HTMLElement>('.mobile-wdf-view__render')
    const header = shell?.querySelector<HTMLElement>('.mobile-wdf-view__header')
    if (!shell || !slot || !render || !header) return null

    const shellStyle = getComputedStyle(shell)
    const borderWidth =
      parseFloat(shellStyle.borderTopWidth || '0') +
      parseFloat(shellStyle.borderBottomWidth || '0')

    // 真实内容高度:克隆衬底 DOM,脱离 inset 布局,与 view 态同宽。
    const contentProbe = render.cloneNode(true) as HTMLElement
    contentProbe.style.position = 'absolute'
    contentProbe.style.visibility = 'hidden'
    contentProbe.style.pointerEvents = 'none'
    contentProbe.style.inset = 'auto'
    contentProbe.style.width = `${slot.clientWidth - borderWidth}px`
    contentProbe.style.maxHeight = 'none'
    contentProbe.style.overflow = 'visible'
    slot.appendChild(contentProbe)
    const contentHeight = contentProbe.scrollHeight
    contentProbe.remove()
    if (!(contentHeight > 0)) return null

    const nextHeight = header.offsetHeight + contentHeight + borderWidth

    return nextHeight > 0 ? nextHeight : null
  }, [shellRef, slotRef])

  const captureFoldedRect = useCallback((): ShellRect | null => {
    const shell = shellRef.current
    const slot = slotRef.current
    if (!shell || !slot) return null

    const first = shell.getBoundingClientRect()
    slot.style.height = `${slot.getBoundingClientRect().height}px`
    return {
      top: first.top,
      left: first.left,
      width: first.width,
      height: first.height,
    }
  }, [shellRef, slotRef])

  const fixShellAtFolded = useCallback(
    (rect: ShellRect) => {
      const shell = shellRef.current
      if (!shell) return

      shell.classList.remove(ANIMATING_CLASS)
      shell.style.position = 'fixed'
      shell.style.zIndex = '101'
      shell.style.margin = '0'
      shell.style.right = 'auto'
      shell.style.bottom = 'auto'
      applyRect(shell, rect)
    },
    [shellRef],
  )

  const flyToDialog = useCallback(
    (session: number, onArrive: () => void) => {
      const shell = shellRef.current
      if (!shell) return

      // 落定出发布局(过渡 before-change 快照),再排 FLIP。
      void shell.getBoundingClientRect()
      const duration = getMorphDuration()
      window.requestAnimationFrame(() => {
        if (!isCurrentSession(session) || phaseRef.current !== 'opening') {
          return
        }
        if (duration > 0) {
          shell.classList.add(ANIMATING_CLASS)
        }
        applyRect(shell, getDialogRect())
      })
      window.setTimeout(() => {
        if (
          !isCurrentSession(session) ||
          phaseRef.current !== 'opening' ||
          !shell.isConnected
        ) {
          return
        }

        shell.classList.remove(ANIMATING_CLASS)
        onArrive()
      }, duration + MORPH_PAD)
    },
    [isCurrentSession, phaseRef, shellRef],
  )

  const flyToFolded = useCallback(
    (session: number, onArrive: () => void) => {
      const shell = shellRef.current
      const slot = slotRef.current
      if (!shell || !slot) return

      const duration = getMorphDuration()
      const target = slot.getBoundingClientRect()

      // 动画目标高度与槽位钉高都对齐「新内容下的 view 态高度」:页面
      // 下方唯一一次位移发生在动画期间(被飞行卡片掩盖),settle 释放
      // 钉高时 Δ=0,落位即终态。取消路径文档未变,测量值=旧钉高,两
      // 赋值皆 no-op。
      const nextHeight = measureNextViewHeight()
      if (nextHeight != null) {
        slot.style.height = `${nextHeight}px`
      }

      if (duration > 0) {
        shell.classList.add(ANIMATING_CLASS)
      }
      applyRect(shell, {
        top: target.top,
        left: target.left,
        width: target.width,
        height: nextHeight ?? target.height,
      })

      window.setTimeout(() => {
        if (
          !isCurrentSession(session) ||
          phaseRef.current !== 'closing' ||
          !shell.isConnected
        ) {
          return
        }
        onArrive()
      }, duration + MORPH_PAD)
    },
    [isCurrentSession, measureNextViewHeight, phaseRef, shellRef, slotRef],
  )

  // 容器记忆化:保持引用稳定,避免协调器回调身份逐渲染漂移。
  return useMemo(
    () => ({
      captureFoldedRect,
      fixShellAtFolded,
      flyToDialog,
      flyToFolded,
      measureNextViewHeight,
    }),
    [captureFoldedRect, fixShellAtFolded, flyToDialog, flyToFolded, measureNextViewHeight],
  )
}
