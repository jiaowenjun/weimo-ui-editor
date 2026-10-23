import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type RefObject,
} from 'react'

import type { RichEditorFocusPosition, RichEditorHandle } from '../rich-editor/rich-editor'
import {
  applyRect,
  getDialogRect,
  getFocusableElements,
  getMorphDuration,
  MORPH_PAD,
} from '../mobile-wdf-view/card-shell'

import { ANIMATING_CLASS } from './card-morph'
import type { CardPhase } from './new-mobile-wdf-view'

const AUTO_FOCUS_RETRIES = 3
const AUTO_FOCUS_RETRY_DELAY = 50
const KEYBOARD_OPEN_THRESHOLD = 120

/**
 * Viewport & Focus(内部简化阶段四):视口与焦点面。
 *
 * 职责:滚动锁(body overflow + 滚动条补偿)、打开前 scrollY 保存与
 * settle 恢复、软键盘判定、visualViewport/resize 的对话框几何跟随
 * (opening/edit 态)、Esc/Tab 焦点陷阱与 focusin 拉回、编辑器自动
 * 聚焦重试。不推进业务编辑会话——Esc 经 requestCancelClose 回调交还
 * 协调器;几何跟随与 Card Morph 共用 applyRect 原语,按相位分时写入
 * (飞行为 opening/closing、跟随为 opening/edit),无并发写权。
 *
 * 行为与拆分前逐行等价:锁体/解锁、监听挂卸、守卫(session+phase)、
 * 聚焦重试链(编辑器 handle + 光标位置,非 DOM 聚焦)、卸载兜底
 * (body 样式还原)不变。
 */
export type ViewportAndFocus = {
  lockBody: () => void
  unlockBody: () => void
  saveScrollPosition: () => void
  restoreScrollPosition: () => void
  isKeyboardOpen: () => boolean
  /** 编辑器自动聚焦:带「已聚焦即停」守卫的重试兜底(会话隔离)。 */
  focusEditorWithRetries: (session: number) => void
}

export function useViewportAndFocus({
  shellRef,
  phase,
  phaseRef,
  sessionRef,
  editorRef,
  autoFocusPositionRef,
  isCurrentSession,
  requestCancelClose,
}: {
  shellRef: RefObject<HTMLDivElement | null>
  phase: CardPhase
  phaseRef: RefObject<CardPhase>
  sessionRef: RefObject<number>
  editorRef: RefObject<RichEditorHandle | null>
  autoFocusPositionRef: RefObject<RichEditorFocusPosition>
  isCurrentSession: (session: number) => boolean
  requestCancelClose: () => void
}): ViewportAndFocus {
  const savedScrollYRef = useRef(0)
  const bodyOverflowRef = useRef('')
  const bodyPaddingRightRef = useRef('')
  const lockedRef = useRef(false)

  const lockBody = useCallback(() => {
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
  }, [])

  const unlockBody = useCallback(() => {
    if (!lockedRef.current) return

    lockedRef.current = false
    document.body.style.overflow = bodyOverflowRef.current
    document.body.style.paddingRight = bodyPaddingRightRef.current
  }, [])

  const saveScrollPosition = useCallback(() => {
    savedScrollYRef.current = window.scrollY
  }, [])

  const restoreScrollPosition = useCallback(() => {
    if (window.scrollY !== savedScrollYRef.current) {
      window.scrollTo(0, savedScrollYRef.current)
    }
  }, [])

  const isKeyboardOpen = useCallback(() => {
    const viewport = window.visualViewport
    return (
      !!viewport &&
      window.innerHeight - viewport.height > KEYBOARD_OPEN_THRESHOLD
    )
  }, [])

  const focusEditorWithRetries = useCallback(
    (session: number) => {
      const tryFocusEditor = (attempts: number) => {
        if (!isCurrentSession(session)) return
        const content = shellRef.current?.querySelector<HTMLElement>(
          '.rich-editor__content',
        )
        if (content?.contains(document.activeElement)) return
        if (attempts <= 0) return

        editorRef.current?.focus(autoFocusPositionRef.current)
        window.setTimeout(
          () => tryFocusEditor(attempts - 1),
          AUTO_FOCUS_RETRY_DELAY,
        )
      }
      tryFocusEditor(AUTO_FOCUS_RETRIES)
    },
    [autoFocusPositionRef, editorRef, isCurrentSession, shellRef],
  )

  // 键盘避让:opening/edit 期间跟随 visualViewport 调整几何。
  useEffect(() => {
    if (phase !== 'opening' && phase !== 'edit') return

    const session = sessionRef.current

    const updateGeometry = () => {
      const shell = shellRef.current
      const currentPhase = phaseRef.current
      if (
        !shell ||
        !isCurrentSession(session) ||
        (currentPhase !== 'opening' && currentPhase !== 'edit')
      ) {
        return
      }

      if (currentPhase === 'opening') {
        applyRect(shell, getDialogRect())
        return
      }

      shell.classList.add(ANIMATING_CLASS)
      applyRect(shell, getDialogRect())
      window.setTimeout(() => {
        if (isCurrentSession(session) && phaseRef.current === 'edit') {
          shell.classList.remove(ANIMATING_CLASS)
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
  }, [isCurrentSession, phase, phaseRef, sessionRef, shellRef])

  // Esc 收起 + Tab 焦点陷阱 + focusin 拉回。
  useEffect(() => {
    if (phase !== 'edit') return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        requestCancelClose()
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
  }, [phase, phaseRef, requestCancelClose, shellRef])

  // 卸载兜底:还原 body 滚动样式(锁体残留防护)。
  useEffect(() => {
    return () => {
      document.body.style.overflow = bodyOverflowRef.current
      document.body.style.paddingRight = bodyPaddingRightRef.current
    }
  }, [])

  // 容器记忆化:保持引用稳定,避免协调器回调身份逐渲染漂移。
  return useMemo(
    () => ({
      lockBody,
      unlockBody,
      saveScrollPosition,
      restoreScrollPosition,
      isKeyboardOpen,
      focusEditorWithRetries,
    }),
    [
      focusEditorWithRetries,
      isKeyboardOpen,
      lockBody,
      restoreScrollPosition,
      saveScrollPosition,
      unlockBody,
    ],
  )
}
