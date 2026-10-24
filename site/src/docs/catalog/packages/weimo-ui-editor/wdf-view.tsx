import { WdfView } from 'weimo-ui-editor/components/wdf-view'
import type { WdfDocument } from 'weimo-wdf'

import { wdfRenderSample } from '../../fixtures/wdf-sample'
import type { ComponentDefinition } from '../../types'

/*
 * WdfView 演示页(仅 site):单卡展示自适应编辑——窄屏(≤640px)
 * 卡片对话框 morph,宽屏行内编辑;编辑样式会话内冻结。
 * 内联工具栏进入时展开,退出时先淡出图标再同步收拢卡片高度。
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
