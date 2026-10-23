import { WdfView } from 'weimo-ui-editor/components/wdf-view'
import type { WdfDocument } from 'weimo-wdf'

import { wdfRenderSample } from '../../fixtures/wdf-sample'
import type { ComponentDefinition } from '../../types'

/*
 * WdfView 演示页(仅 site):单卡展示自适应编辑——窄屏(≤640px)
 * 卡片对话框 morph,宽屏行内编辑;编辑样式会话内冻结。内联工具栏
 * 进入动画展开、退出瞬收(方案E,滚动锚定闪跳定案,见组件注释)。
 */

function WdfViewDemo() {
  const sample = wdfRenderSample as WdfDocument
  return (
    <WdfView
      defaultValue={sample}
      title={
        <>
          自适应编辑 <code className="docs-component-class">wdf-view</code>
        </>
      }
    />
  )
}

export const wdfViewDefinition = {
  id: 'wdf-view',
  summary:
    'WdfView:自适应编辑样式——窄屏(≤640px)卡片对话框 morph,宽屏行内编辑;样式会话内冻结',
  status: 'Preview',
  frame: 'plain',
  preview: () => <WdfViewDemo />,
} satisfies ComponentDefinition
