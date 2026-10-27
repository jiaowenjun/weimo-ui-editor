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
      let frame = 0
      let fallbackTimer = 0

      function finishExitAnimation() {
        if (cancelled) return

        onExitAnimationEnd?.()
      }

      // 先等一帧再取动画列表,保证 data-state 切换的动画已注册到元素上。
      frame = window.requestAnimationFrame(() => {
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
      })

      return () => {
        cancelled = true
        window.cancelAnimationFrame(frame)
        window.clearTimeout(fallbackTimer)
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
