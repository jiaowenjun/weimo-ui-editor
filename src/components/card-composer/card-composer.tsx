import { X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'

import { GhostIconButton } from 'weimo-ui-core/components/ghost-icon-button'
import { WdfDocument } from 'weimo-wdf'

import { WdfCard } from '../wdf-card/wdf-card'
import type { WdfCardHandle, WdfCardMode, WdfCardProps } from '../wdf-card/wdf-card'
import { COMPOSER_SHELL_TRANSITION_MS, ComposerShell } from './composer-shell'

import 'weimo-ui-editor/styles/card-composer.css'

const EMPTY_DOCUMENT = WdfDocument.empty()
/** rAF/动画在挂起环境(后台标签页、自动化)可能停滞,超过该时长直接放行
 * 自动进入编辑(等待只为让壳层进场动画先落地,不承担正确性)。 */
const AUTO_ENTER_EDIT_SETTLE_TIMEOUT_MS = 600

type AutoEnterEditState = {
  clientId: string
  ready: boolean
}

/**
 * CardComposer:列表内「新建」占位,编排 WdfCard 的会话与壳层生命周期。
 *
 * - 壳层(ComposerShell)只负责占位卡在列表中的出现/收起(0fr 折叠);
 *   编辑全权交给 WdfCard——窄屏弹对话框,宽屏行内,壳留原地作锚点。
 * - 壳层进场动画结束后自动进入编辑态(autoEnterEdit,默认开;每 clientId
 * 一次),用户无需手点铅笔;取消/保存落回占位后不再自动重开。
 * - 不自动聚焦:编辑器亮着等用户点进去(autoFocus 恒 false)。
 * - WdfCard 以受控 value=空文档常量挂载:保存落定后自动复位为空占位。
 * - 空内容(单空段落)的保存/取消视为丢弃,不上抛 onSave。
 */
export type CardComposerProps = {
  /** 列表内唯一标识;落在壳层 data-client-id,供多实例调试与键控。 */
  clientId: string
  /** 打开后自动进入编辑态(壳层进场动画结束后触发),默认开。 */
  autoEnterEdit?: boolean
  /** 退场动画播放中;true 时壳层收起、交互禁用。 */
  isClosing?: boolean
  /** 退场动画结束(含定时器兜底路径)后回调;父级据此真正卸载。 */
  onExitAnimationEnd?: () => void
  /** 点 ✕ 请求关闭时触发(已先失焦);父级通常置 isClosing 走退场。 */
  onCancel?: () => void
  /** 编辑落定且内容非空时上抛;空内容保存/取消不上抛。 */
  onSave?: (document: WdfDocument) => void
  /** 占位卡标题,默认「新建笔记」。 */
  title?: ReactNode
  /** ✕ 钮可访问名称,默认「收起新建」。 */
  cancelLabel?: string
  /** 透传 WdfCard 查看态渲染。 */
  renderProps?: WdfCardProps['renderProps']
  /** 透传 WdfCard 编辑器。 */
  editorProps?: WdfCardProps['editorProps']
  /** 透传 WdfCard 转换失败上报。 */
  onConversionError?: WdfCardProps['onConversionError']
  className?: string
  style?: CSSProperties
}

/** 空判定:0 块,或仅一个无有效文字的段落(WdfDocument.empty 与
 * fromTiptap 空草稿的规范形态;纯空白文本同样视为空)。 */
export function isWdfDocumentEmpty(document: WdfDocument): boolean {
  const { content } = document.root
  if (content.length === 0) return true
  if (content.length > 1) return false

  const [block] = content
  return (
    block.type === 'paragraph' &&
    block.content.every((run) => run.text.trim() === '')
  )
}

export function CardComposer({
  autoEnterEdit = true,
  cancelLabel = '收起新建',
  clientId,
  className,
  editorProps,
  isClosing = false,
  onCancel,
  onConversionError,
  onExitAnimationEnd,
  onSave,
  renderProps,
  style,
  title = '新建笔记',
}: CardComposerProps) {
  const shellRef = useRef<HTMLDivElement | null>(null)
  const wdfCardRef = useRef<WdfCardHandle | null>(null)
  // 占位卡的会话态:编辑期隐藏 ✕(此时 WdfCard 自带 取消/保存 组,
  // 叠加的 ✕ 会与其自身取消钮重合),落回 view 后恢复。
  const [cardMode, setCardMode] = useState<WdfCardMode>('view')
  const [autoEnterState, setAutoEnterState] = useState<AutoEnterEditState>(
    () => ({ clientId, ready: false }),
  )
  const autoEnterEditFiredForRef = useRef<string | null>(null)

  // 壳层进场动画落地后才自动进入编辑:立即打开会在半展开几何上测量
  // (窄屏对话框的飞行 First 矩形、宽屏卡高的换挡),动画期测量不可信。
  useEffect(() => {
    let done = false
    let frame = 0
    let fallbackTimer = 0
    let settleTimer = 0

    function allowAutoEnterEdit() {
      if (done) return
      done = true
      window.clearTimeout(fallbackTimer)
      window.clearTimeout(settleTimer)
      setAutoEnterState({ clientId, ready: true })
    }

    function observeShellAnimations() {
      if (done) return

      const animations = shellRef.current?.getAnimations() ?? []
      if (animations.length === 0) {
        allowAutoEnterEdit()
        return
      }

      void Promise.allSettled(
        animations.map((animation) =>
          animation.finished.then(() => undefined),
        ),
      ).then(allowAutoEnterEdit)
      settleTimer = window.setTimeout(
        allowAutoEnterEdit,
        AUTO_ENTER_EDIT_SETTLE_TIMEOUT_MS,
      )
    }

    frame = window.requestAnimationFrame(observeShellAnimations)
    fallbackTimer = window.setTimeout(
      observeShellAnimations,
      COMPOSER_SHELL_TRANSITION_MS * 2,
    )

    return () => {
      done = true
      window.cancelAnimationFrame(frame)
      window.clearTimeout(fallbackTimer)
      window.clearTimeout(settleTimer)
    }
  }, [clientId])

  // 每个 clientId 只自动进入一次;保存/取消落回 view 后不重开。
  useEffect(() => {
    if (!autoEnterEdit) return
    if (isClosing) return
    if (autoEnterState.clientId !== clientId || !autoEnterState.ready) return
    if (autoEnterEditFiredForRef.current === clientId) return

    autoEnterEditFiredForRef.current = clientId
    wdfCardRef.current?.open()
  }, [autoEnterEdit, autoEnterState, clientId, isClosing])

  function handleModeChange(nextMode: WdfCardMode) {
    setCardMode(nextMode)
  }

  function handleCardChange(document: WdfDocument) {
    if (isWdfDocumentEmpty(document)) return

    onSave?.(document)
  }

  function handleClose() {
    if (isClosing || cardMode !== 'view') return

    const activeElement = document.activeElement
    if (
      activeElement instanceof HTMLElement &&
      shellRef.current?.contains(activeElement)
    ) {
      activeElement.blur()
    }
    onCancel?.()
  }

  return (
    <ComposerShell
      className={className}
      data-client-id={clientId}
      isClosing={isClosing}
      onExitAnimationEnd={onExitAnimationEnd}
      ref={shellRef}
      style={style}
    >
      <div className="wdf-card-composer__inner">
        {cardMode === 'view' ? (
          <GhostIconButton
            aria-label={cancelLabel}
            className="wdf-card-composer__close"
            disabled={isClosing}
            onClick={handleClose}
            size="sm"
          >
            <X />
          </GhostIconButton>
        ) : null}
        <WdfCard
          editorProps={editorProps}
          onChange={handleCardChange}
          onConversionError={onConversionError}
          onModeChange={handleModeChange}
          ref={wdfCardRef}
          renderProps={renderProps}
          title={title}
          value={EMPTY_DOCUMENT}
        />
      </div>
    </ComposerShell>
  )
}
