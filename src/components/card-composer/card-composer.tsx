import { X } from 'lucide-react'
import { useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'

import { GhostIconButton } from 'weimo-ui-core/components/ghost-icon-button'
import { WdfDocument } from 'weimo-wdf'

import { WdfCard } from '../wdf-card/wdf-card'
import type { WdfCardMode, WdfCardProps } from '../wdf-card/wdf-card'
import { ComposerShell } from './composer-shell'

import 'weimo-ui-editor/styles/card-composer.css'

/**
 * CardComposer:列表内「新建」占位,编排 WdfCard 的会话与壳层生命周期。
 *
 * - 壳层(ComposerShell)只负责占位卡在列表中的出现/收起(0fr 折叠);
 *   编辑全权交给 WdfCard——窄屏弹对话框,宽屏行内,壳留原地作锚点。
 * - 打开即编辑(autoEnterEdit,默认开):经 WdfCard defaultMode 挂载即进入
 *   编辑态,无 view 中间态——壳层 0fr→1fr 进场首帧不可见,挂载效应里
 *   openCard 已启动(窄屏量到的折叠矩形是 slot 自然高度,不受 0fr 裁切
 *   影响)。
 * - 保存即落位:有内容保存时更新受控文档,落定后卡片原地变形为展示该
 *   笔记的查看态并常驻列表(后续铅笔可再编辑,取消则回到上次保存的
 *   内容);空内容退出(取消/空保存)仍整体收走。落定分流依据=当前
 *   受控文档是否为空,保存与落定之间必然隔一段变形动画,无闭包过期。
 * - 不自动聚焦:编辑器亮着等用户点进去(autoFocus 恒 false)。
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
  /** 透传 WdfCard 底部插槽(标签栏等常驻卡内附加行)。 */
  bottomBar?: WdfCardProps['bottomBar']
  /** 透传 WdfCard 顶栏操作插槽。 */
  actionSlot?: WdfCardProps['actionSlot']
  /** 透传 WdfCard 隐藏查看态铅笔入口开关。 */
  hideEditEntry?: WdfCardProps['hideEditEntry']
  /** WdfCard 模式变化冒泡;落定 view 常被消费方用作过渡完成信号。 */
  onModeChange?: WdfCardProps['onModeChange']
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
  actionSlot,
  autoEnterEdit = true,
  hideEditEntry = false,
  bottomBar,
  cancelLabel = '收起新建',
  clientId,
  className,
  editorProps,
  isClosing = false,
  onCancel,
  onConversionError,
  onExitAnimationEnd,
  onModeChange,
  onSave,
  renderProps,
  style,
  title = '新建笔记',
}: CardComposerProps) {
  const shellRef = useRef<HTMLDivElement | null>(null)
  // 占位卡的会话态:编辑期隐藏叠加 ✕(此时 WdfCard 自带 取消/保存 组,
  // 叠加的 ✕ 会与其自身取消钮重合)。初始值镜像 defaultMode——挂载即
  // 编辑时 onModeChange('edit') 不会发声。落回 view 后叠加 ✕ 仅在
  // 受控文档仍为空(空占位)时渲染;已保存落位的笔记卡是普通卡片,
  // 只留铅笔编辑入口。
  const [cardMode, setCardMode] = useState<WdfCardMode>(
    autoEnterEdit ? 'edit' : 'view',
  )
  // 受控文档:从空文档开始,保存有效内容后更新——落定的卡面即笔记,
  // composer 由此常驻列表。会话期间的外部更新不会覆盖草稿(WdfCard
  // 契约),落定时才采用。
  const [cardDocument, setCardDocument] = useState<WdfDocument>(() =>
    WdfDocument.empty(),
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

  // 落定 view 时分流:已有笔记(保存过)→ 原地常驻;仍是空文档(取消/
  // 空保存)→ 收起整个 composer。保存与落定之间隔着 WdfCard 的变形
  // 动画,handleModeChange 每次渲染重建,读到的是最新受控文档。
  function handleModeChange(nextMode: WdfCardMode) {
    setCardMode(nextMode)
    onModeChange?.(nextMode)

    if (nextMode === 'edit' || isClosing) return
    if (!isWdfDocumentEmpty(cardDocument)) return

    blurCardFocus()
    onCancel?.()
  }

  function handleCardChange(nextDocument: WdfDocument) {
    if (isWdfDocumentEmpty(nextDocument)) return

    setCardDocument(nextDocument)
    onSave?.(nextDocument)
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
        {cardMode === 'view' && isWdfDocumentEmpty(cardDocument) ? (
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
          actionSlot={actionSlot}
          bottomBar={bottomBar}
          defaultMode={autoEnterEdit ? 'edit' : 'view'}
          hideEditEntry={hideEditEntry}
          editorProps={editorProps}
          onChange={handleCardChange}
          onConversionError={onConversionError}
          onModeChange={handleModeChange}
          renderProps={renderProps}
          title={title}
          value={cardDocument}
        />
      </div>
    </ComposerShell>
  )
}
