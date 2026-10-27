import { forwardRef, useEffect, useRef } from 'react'
import type { ComponentPropsWithoutRef, ReactNode } from 'react'

import { cn } from 'weimo-ui-core/lib/utils'

import 'weimo-ui-editor/styles/card-composer.css'

const COMPOSER_SHELL_TRANSITION_MS = 180

export type ComposerShellProps = Omit<
  ComponentPropsWithoutRef<'div'>,
  'children'
> & {
  children: ReactNode
  isClosing?: boolean
  onExitAnimationEnd?: () => void
}

/**
 * ComposerShell:「新建」占位的折叠壳层,与内容完全解耦(只认 children)。
 * 移植自 weimo-ui 的 ComposerShell;未移植其 onViewTransitionEnd——
 * WdfCard 的会话落点有 onModeChange/相位机回调,不依赖 CSS 事件。
 *
 * 退场协议:React 卸载没有退出动画钩子,由父级单向驱动——父置 isClosing,
 * 壳切 data-state='closing' 播收起动画并禁指针;等 wrapper.getAnimations()
 * 全部 finished 后回调 onExitAnimationEnd,父级才真正卸载。无动画
 * (reduced-motion/竞态)走固定时长兜底,保证回调必达。
 */
export const ComposerShell = forwardRef<HTMLDivElement, ComposerShellProps>(
  function ComposerShell(
    {
      children,
      className,
      isClosing = false,
      onExitAnimationEnd,
      ...props
    },
    forwardedRef,
  ) {
    const wrapperRef = useRef<HTMLDivElement | null>(null)

    function setWrapperNode(node: HTMLDivElement | null) {
      wrapperRef.current = node

      if (typeof forwardedRef === 'function') {
        forwardedRef(node)
        return
      }

      if (forwardedRef) {
        forwardedRef.current = node
      }
    }

    useEffect(() => {
      if (!isClosing) return

      let cancelled = false
      let observed = false
      let frame = 0
      let fallbackTimer = 0
      let settleTimer = 0

      function finishExitAnimation() {
        if (cancelled) return

        cancelled = true
        window.clearTimeout(fallbackTimer)
        window.clearTimeout(settleTimer)
        onExitAnimationEnd?.()
      }

      function observeExitAnimations() {
        if (observed || cancelled) return
        observed = true
        window.cancelAnimationFrame(frame)

        const animations = wrapperRef.current?.getAnimations() ?? []
        if (animations.length === 0) {
          fallbackTimer = window.setTimeout(
            finishExitAnimation,
            COMPOSER_SHELL_TRANSITION_MS,
          )
          return
        }

        void Promise.allSettled(
          animations.map((animation) =>
            animation.finished.then(() => undefined),
          ),
        ).then(finishExitAnimation)
        // 冻结环境(后台标签页/自动化节流)下 CSS 动画可能停摆不 finish,
        // 定时器竞速保证退场回调必达——父级靠它卸载,等不起。
        settleTimer = window.setTimeout(
          finishExitAnimation,
          COMPOSER_SHELL_TRANSITION_MS * 3,
        )
      }

      // 观察入口同样须竞速:rAF 本身可能挂起(同上),定时器兜底进入。
      frame = window.requestAnimationFrame(observeExitAnimations)
      fallbackTimer = window.setTimeout(
        observeExitAnimations,
        COMPOSER_SHELL_TRANSITION_MS * 2,
      )

      return () => {
        cancelled = true
        window.cancelAnimationFrame(frame)
        window.clearTimeout(fallbackTimer)
        window.clearTimeout(settleTimer)
      }
    }, [isClosing, onExitAnimationEnd])

    return (
      <div
        {...props}
        className={cn('wdf-card-composer', className)}
        data-state={isClosing ? 'closing' : undefined}
        ref={setWrapperNode}
      >
        <div className="wdf-card-composer__frame">
          {children}
        </div>
      </div>
    )
  },
)
