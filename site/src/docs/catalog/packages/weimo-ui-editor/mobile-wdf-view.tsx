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
 * 移动卡片式视图演示页(仅 site):src 正式组件的薄壳。
 * 组件实现见 src/components/mobile-wdf-view/(方案与 iOS Safari 状态栏
 * 修复背景详见 docs/ios-safari-statusbar-toplayer.md)。
 * 查看态卡片由内容整体撑高(无上限);此前 300px 钳制实验版已移除。
 */

function MobileWdfViewDemo() {
  const [autoFocus, setAutoFocus] = useState(false)
  const [controlled, setControlled] = useState(false)
  const [mode, setMode] = useState<MobileWdfViewMode>('view')
  const [handleInfo, setHandleInfo] = useState<string | null>(null)
  const viewRef = useRef<MobileWdfViewHandle | null>(null)

  // 切换受控开关时重置外部 mode,避免把非受控会话的中间态带进受控模式
  // (mode='view' 会触发外部强制收起,组件自行闭环)。
  const toggleControlled = (checked: boolean) => {
    setControlled(checked)
    setMode('view')
  }

  return (
    <div className="mwv-demo">
      <p className="mwv-demo__note">
        MobileWdfView 演示页(构建标记 mwv-v8,看不到说明未整页刷新;组件
        为包导出 weimo-ui-editor/components/mobile-wdf-view)。查看态卡片
        由内容整体撑高、无上限。默认非受控:点右上角铅笔进入编辑(卡片
        本体不可点,对齐 WdfView)→ 点正文打字 → 取消(X/Esc/遮罩,丢弃
        草稿)或保存(Check,经 fromTiptap 提交;转换失败保留编辑会话)。
        受控模式开关验证 mode/onModeChange 契约与 handle 命令式 API。
        真机观察:收起后状态栏恢复磨砂、无闪烁、落位高度无跳变。
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
        title="移动卡片式视图 · mwv-v8"
      />
    </div>
  )
}

export const mobileWdfViewDefinition = {
  id: 'mobile-wdf-view',
  summary:
    'MobileWdfView:卡片式 WDF 读写视图(CardShell + WdfRender 衬底 + 按会话挂载 RichEditor + 内容撑高无上限 + iOS Safari 状态栏修复)',
  status: 'Preview',
  frame: 'plain',
  preview: () => <MobileWdfViewDemo />,
} satisfies ComponentDefinition
