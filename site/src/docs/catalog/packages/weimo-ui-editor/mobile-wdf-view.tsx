import './mobile-wdf-view.css'
import { useState } from 'react'

import { LabeledSwitch } from 'weimo-ui-core/components/labeled-switch'
import { MobileWdfView } from 'weimo-ui-editor/components/mobile-wdf-view'
import type { WdfDocument } from 'weimo-wdf'

import { wdfRenderSample } from '../../fixtures/wdf-sample'
import type { ComponentDefinition } from '../../types'

/*
 * MobileWdfView 演示页(仅 site):src 正式组件的薄壳。
 * 组件实现见 src/components/mobile-wdf-view/(方案与 iOS Safari 状态栏
 * 修复背景详见 docs/ios-safari-statusbar-toplayer.md)。
 */

function MobileWdfViewDemo() {
  const [autoFocus, setAutoFocus] = useState(false)

  return (
    <div className="mwv-demo">
      <p className="mwv-demo__note">
        MobileWdfView 演示页(构建标记 mwv-v4,看不到说明未整页刷新;组件
        已下沉为包导出 weimo-ui-editor/components/mobile-wdf-view)。
        验证点:点卡片展开(编辑器 onReady 后才启动动画,无空白首帧)→
        点正文打字 → X 或 Esc 收起(草稿经 fromTiptap 提交回 WdfRender;
        转换失败保留编辑会话)。真机观察:收起后状态栏恢复磨砂、无闪烁
        无跳动、滚动位置保持;自动聚焦开关(默认关)观察各平台键盘行为。
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

      <MobileWdfView
        autoFocus={autoFocus}
        defaultValue={wdfRenderSample as WdfDocument}
        title="移动卡片式视图 · mwv-v4"
      />
    </div>
  )
}

export const mobileWdfViewDefinition = {
  id: 'mobile-wdf-view',
  summary:
    'MobileWdfView:卡片式 WDF 读写视图(CardShell + WdfRender 衬底 + 按会话挂载 RichEditor + iOS Safari 状态栏修复)',
  status: 'Preview',
  frame: 'plain',
  preview: () => <MobileWdfViewDemo />,
} satisfies ComponentDefinition
