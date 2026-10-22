import './mobile-wdf-view.css'
import { useRef, useState } from 'react'

import { LabeledSwitch } from 'weimo-ui-core/components/labeled-switch'
import { TextButton } from 'weimo-ui-core/components/text-button'
import {
  MobileWdfView,
  type MobileWdfViewHandle,
  type MobileWdfViewMode,
} from 'weimo-ui-editor/components/mobile-wdf-view'
import type { WdfDocument } from 'weimo-wdf'

import { wdfRenderSample } from '../../fixtures/wdf-sample'
import type { ComponentDefinition } from '../../types'

/*
 * 移动卡片式视图(无高度上限)演示页(仅 site):与「移动卡片式视图」页
 * 相同,仅 viewMaxHeight='none'——查看态卡片由内容整体撑高,不设 300px
 * 上限、无卡内滚动(实验对照页,观察长文档下的卡片形态与开合动画)。
 * 组件实现见 src/components/mobile-wdf-view/。
 */

function MobileWdfViewUnboundedDemo() {
  const [autoFocus, setAutoFocus] = useState(false)
  const [controlled, setControlled] = useState(false)
  const [mode, setMode] = useState<MobileWdfViewMode>('view')
  const [handleInfo, setHandleInfo] = useState<string | null>(null)
  const viewRef = useRef<MobileWdfViewHandle | null>(null)

  const toggleControlled = (checked: boolean) => {
    setControlled(checked)
    setMode('view')
  }

  return (
    <div className="mwv-demo">
      <p className="mwv-demo__note">
        移动卡片式视图·无高度上限实验页(构建标记 mwv-v7,看不到说明未
        整页刷新)。与「移动卡片式视图」页唯一差异:viewMaxHeight='none',
        查看态卡片由内容整体撑高、不设 300px 上限、无卡内滚动。交互与
        该页一致:铅笔进入编辑,取消(X/Esc/遮罩)丢弃草稿,保存(Check)
        经转换提交。观察点:长文档下卡片撑高超出视口的形态、展开/收起
        动画(起点为全高卡片)、编辑后落位高度、状态栏与滚动表现。
      </p>

      <div className="mwv-demo__switch">
        <LabeledSwitch
          ariaLabel="展开后自动聚焦"
          checked={autoFocus}
          labelOff="展开后不聚焦(点正文唤起键盘)"
          labelOn="展开后自动聚焦(观察各平台软键盘行为)"
          onCheckedChange={setAutoFocus}
        />
      </div>

      <div className="mwv-demo__switch">
        <LabeledSwitch
          ariaLabel="受控模式"
          checked={controlled}
          labelOff="非受控(组件自管理 mode)"
          labelOn={`受控(外部 mode=${mode},onModeChange 回写)`}
          onCheckedChange={toggleControlled}
        />
      </div>

      {controlled && (
        <div aria-label="受控模式操作" className="mwv-demo__controlled" role="group">
          <TextButton onClick={() => setMode('edit')}>mode='edit'</TextButton>
          <TextButton onClick={() => setMode('view')}>mode='view'</TextButton>
          <TextButton onClick={() => viewRef.current?.open()}>handle.open()</TextButton>
          <TextButton onClick={() => viewRef.current?.close()}>handle.close()</TextButton>
          <TextButton
            onClick={() => {
              const doc = viewRef.current?.getContent()
              setHandleInfo(
                doc ? `${JSON.stringify(doc).slice(0, 100)}…` : '(null)',
              )
            }}
          >
            handle.getContent()
          </TextButton>
          {handleInfo && <p className="mwv-demo__info">{handleInfo}</p>}
        </div>
      )}

      <MobileWdfView
        autoFocus={autoFocus}
        defaultValue={wdfRenderSample as WdfDocument}
        mode={controlled ? mode : undefined}
        onModeChange={controlled ? setMode : undefined}
        ref={viewRef}
        title="移动卡片式视图 · mwv-v7"
        viewMaxHeight="none"
      />
    </div>
  )
}

export const mobileWdfViewUnboundedDefinition = {
  id: 'mobile-wdf-view-unbounded',
  summary:
    '移动卡片式视图无高度上限实验页:viewMaxHeight=none,内容整体撑高(对照 300px 钳制版)',
  status: 'Preview',
  frame: 'plain',
  preview: () => <MobileWdfViewUnboundedDemo />,
} satisfies ComponentDefinition
