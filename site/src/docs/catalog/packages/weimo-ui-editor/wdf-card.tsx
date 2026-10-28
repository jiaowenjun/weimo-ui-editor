import { WdfCard } from 'weimo-ui-editor/components/wdf-card'
import type { WdfDocument } from 'weimo-wdf'

import { wdfRenderSample } from '../../fixtures/wdf-sample'
import type { ComponentDefinition } from '../../types'

/*
 * WdfCard 演示页(仅 site):单卡展示自适应编辑——窄屏(≤640px)
 * 卡片对话框 morph,宽屏行内编辑;编辑样式会话内冻结。
 * 内联工具栏进入时展开,退出时先淡出图标再同步收拢卡片高度。
 */

function WdfCardDemo() {
  const sample = wdfRenderSample as WdfDocument
  return (
    <WdfCard
      bottomBar={<div>示例标签一 · 示例标签二</div>}
      defaultValue={sample}
      title="WdfCard"
    />
  )
}

export const wdfCardDefinition = {
  id: 'wdf-card',
  summary:
    'WdfCard:自适应编辑样式——窄屏(≤640px)卡片对话框 morph,宽屏行内编辑;样式会话内冻结',
  status: 'Preview',
  frame: 'plain',
  preview: () => <WdfCardDemo />,
} satisfies ComponentDefinition
