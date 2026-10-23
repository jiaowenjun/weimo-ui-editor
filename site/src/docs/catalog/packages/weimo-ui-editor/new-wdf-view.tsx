import './new-wdf-view.css'

import { NewWdfView } from 'weimo-ui-editor/components/new-wdf-view'
import type { WdfDocument } from 'weimo-wdf'

import { wdfRenderSample } from '../../fixtures/wdf-sample'
import type { ComponentDefinition } from '../../types'

/*
 * NewWdfView 演示页(仅 site):内联轴工具栏过渡 A/B 对照——对话框
 * 对照卡 + 三个内联变体(instant 瞬进瞬收 / delayed 延迟带过渡 /
 * css-delay 纯 CSS 固定延迟),宽屏下逐卡进入/退出编辑实机对比。
 */

function NewWdfViewDemo() {
  const sample = wdfRenderSample as WdfDocument
  return (
    <div className="nwv-demo">
      <p className="nwv-demo__caption">对话框对照(卡片 morph,过渡不变)</p>
      <NewWdfView defaultValue={sample} editStyle="dialog" title="对话框编辑" />
      <p className="nwv-demo__caption">行内 · 延迟带过渡(delayed)</p>
      <NewWdfView
        defaultValue={sample}
        editStyle="inline"
        inlineToolbarTransition="delayed"
        title="行内·延迟带"
      />
      <p className="nwv-demo__caption">行内 · 纯CSS延迟(css-delay)</p>
      <NewWdfView
        defaultValue={sample}
        editStyle="inline"
        inlineToolbarTransition="css-delay"
        title="行内·CSS延迟"
      />
      <p className="nwv-demo__caption">行内 · 对照(方案C 瞬进瞬收)</p>
      <NewWdfView
        defaultValue={sample}
        editStyle="inline"
        title="行内·瞬进"
      />
    </div>
  )
}

export const newWdfViewDefinition = {
  id: 'new-wdf-view',
  summary:
    'NewWdfView:自适应编辑样式——窄屏(≤640px)卡片对话框 morph(同 MobileWdfView),宽屏 WdfView 式行内编辑;样式会话内冻结;复用 MobileWdfView 模块架构',
  status: 'Preview',
  frame: 'plain',
  preview: () => <NewWdfViewDemo />,
} satisfies ComponentDefinition
