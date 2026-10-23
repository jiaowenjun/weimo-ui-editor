import './new-wdf-view.css'

import { NewWdfView } from 'weimo-ui-editor/components/new-wdf-view'
import type { WdfDocument } from 'weimo-wdf'

import { wdfRenderSample } from '../../fixtures/wdf-sample'
import type { ComponentDefinition } from '../../types'

/*
 * NewWdfView 演示页(仅 site):同一文档三实例——auto(视口决定:
 * ≤640px 对话框 morph,宽屏行内)、强制对话框、强制行内。宽屏下
 * 可同时对照对话框与行内两种编辑形态;窄视口下 auto 与强制对话框
 * 行为一致。行内工具栏带过渡(band 配方)为内联轴默认行为。
 */

function NewWdfViewDemo() {
  const sample = wdfRenderSample as WdfDocument
  return (
    <div className="nwv-demo">
      <p className="nwv-demo__caption">auto(窄屏对话框 / 宽屏行内)</p>
      <NewWdfView defaultValue={sample} title="自适应编辑" />
      <p className="nwv-demo__caption">强制对话框(卡片 morph)</p>
      <NewWdfView defaultValue={sample} editStyle="dialog" title="对话框编辑" />
      <p className="nwv-demo__caption">强制行内(嵌入式编辑)</p>
      <NewWdfView defaultValue={sample} editStyle="inline" title="行内编辑" />
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
