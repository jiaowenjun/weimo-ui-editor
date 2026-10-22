import './mobile-wdf-view.css'

import { MobileWdfView } from 'weimo-ui-editor/components/mobile-wdf-view'
import type { WdfDocument } from 'weimo-wdf'

import { wdfRenderSample } from '../../fixtures/wdf-sample'
import type { ComponentDefinition } from '../../types'

/*
 * 移动卡片式视图演示页(仅 site):src 正式组件的薄壳,无附加控制。
 * 组件实现见 src/components/mobile-wdf-view/(方案与 iOS Safari 状态栏
 * 修复背景详见 docs/ios-safari-statusbar-toplayer.md)。
 */

function MobileWdfViewDemo() {
  return (
    <div className="mwv-demo">
      <MobileWdfView
        defaultValue={wdfRenderSample as WdfDocument}
        editorProps={{ placeholder: '写点什么...' }}
        title={
          <>
            移动卡片式视图 <code className="docs-component-class">mobile-wdf-view</code>
          </>
        }
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
