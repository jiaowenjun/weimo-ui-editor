import './new-mobile-wdf-view.css'

import { MobileWdfView } from 'weimo-ui-editor/components/mobile-wdf-view'
import { NewMobileWdfView } from 'weimo-ui-editor/components/new-mobile-wdf-view'
import type { WdfDocument } from 'weimo-wdf'

import { wdfRenderSample } from '../../fixtures/wdf-sample'
import type { ComponentDefinition } from '../../types'

/*
 * NewMobileWdfView 并排对照页(仅 site):同一文档下新旧组件上下排列,
 * 供同设备/同视口逐项行为对照(基线 docs/new-mobile-wdf-view-baseline.md
 * §6)。旧组件保持原样,新组件为并行重构实验件,首轮为行为忠实移植。
 */

function NewMobileWdfViewCompareDemo() {
  return (
    <div className="nmwv-compare">
      <p className="nmwv-compare__caption">旧 MobileWdfView(行为基线)</p>
      <MobileWdfView
        defaultValue={wdfRenderSample as WdfDocument}
        title="移动卡片式视图 · 旧"
      />
      <p className="nmwv-compare__caption">新 NewMobileWdfView(重构实验)</p>
      <NewMobileWdfView
        defaultValue={wdfRenderSample as WdfDocument}
        title="移动卡片式视图 · 新"
      />
    </div>
  )
}

export const newMobileWdfViewDefinition = {
  id: 'new-mobile-wdf-view',
  summary:
    'NewMobileWdfView:MobileWdfView 并行重构实验件(行为忠实移植 + 具名编排 + 显式「已提交可测量」协作点;基线契约见 docs/new-mobile-wdf-view-baseline.md)',
  status: 'Preview',
  frame: 'plain',
  preview: () => <NewMobileWdfViewCompareDemo />,
} satisfies ComponentDefinition
