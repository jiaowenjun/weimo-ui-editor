import { X } from 'lucide-react'
import { useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'

import { GhostIconButton } from 'weimo-ui-core/components/ghost-icon-button'
import { WdfDocument } from 'weimo-wdf'

import { WdfCard } from '../wdf-card/wdf-card'
import type { WdfCardMode, WdfCardProps } from '../wdf-card/wdf-card'
import { ComposerShell } from './composer-shell'

import 'weimo-ui-editor/styles/card-composer.css'

const EMPTY_DOCUMENT = WdfDocument.empty()

/**
 * CardComposer:列表内「新建」占位,编排 WdfCard 的会话与壳层生命周期。
 *
 * - 壳层(ComposerShell)只负责占位卡在列表中的出现/收起(0fr 折叠);
 *   编辑全权交给 WdfCard——窄屏弹对话框,宽屏行内,壳留原地作锚点。
 * - 打开即编辑(autoEnterEdit,默认开):经 WdfCard defaultMode 挂载即进入
 *   编辑态,无 view 中间态——壳层 0fr→1fr 进场首帧不可见,挂载效应里
 *   openCard 已启动(窄屏量到的折叠矩形是 slot 自然高度,不受 0fr 裁切
 *   影响)。
 * - 会话落定 view(取消/空保存/有内容保存)即收起整个 composer(onCancel
 *   → 父级 isClosing → 退场动画 → onExitAnimationEnd → 卸载);保存的
 *   笔记经 onSave 上抛由父级落列表,占位卡不遗留。
 * - 不自动聚焦:编辑器亮着等用户点进去(autoFocus 恒 false)。
 * - WdfCard 以受控 value=空文档常量挂载:会话草稿始终从空文档开始。
 * - 空内容(单空段落)的保存/取消视为丢弃,不上抛 onSave。
 */
export type CardComposerProps = {
  /** 列表内唯一标识;落在壳层 data-client-id,供多实例调试与键控。 */
  clientId: string
  /** 打开即进入编辑态(经 WdfCard defaultMode 挂载即开),默认开。 */
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
  // 占位卡的会话态:编辑期隐藏 ✕(此时 WdfCard 自带 取消/保存 组,
  // 叠加的 ✕ 会与其自身取消钮重合),落回 view 后恢复。初始值镜像
  // defaultMode——挂载即编辑时 onModeChange('edit') 不会发声。
  const [cardMode, setCardMode] = useState<WdfCardMode>(
    autoEnterEdit ? 'edit' : 'view',
  )
  function blurCardFocus() {
    const activeElement = document.activeElement
    if (
      activeElement instanceof HTMLElement &&
      shellRef.current?.contains(activeElement)
    ) {
      activeElement.blur()
    }
  }

  // 任何会话落定 view(取消/空保存/有内容保存)都收起整个 composer:
  // 保存的笔记经 onChange 上抛由父级落列表,占位卡没有继续存在的理由。
  function handleModeChange(nextMode: WdfCardMode) {
    setCardMode(nextMode)

    if (nextMode === 'edit' || isClosing) return

    blurCardFocus()
    onCancel?.()
  }

  function handleCardChange(document: WdfDocument) {
    if (isWdfDocumentEmpty(document)) return

    onSave?.(document)
  }

  function handleClose() {
    if (isClosing || cardMode !== 'view') return

    blurCardFocus()
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
          defaultMode={autoEnterEdit ? 'edit' : 'view'}
          editorProps={editorProps}
          onChange={handleCardChange}
          onConversionError={onConversionError}
          onModeChange={handleModeChange}
          renderProps={renderProps}
          title={title}
          value={EMPTY_DOCUMENT}
        />
      </div>
    </ComposerShell>
  )
}
