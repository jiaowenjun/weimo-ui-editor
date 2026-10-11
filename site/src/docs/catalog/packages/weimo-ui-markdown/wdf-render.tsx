import { ComponentPreviewCard } from 'weimo-ui-core/components/component-preview-card'
import { WdfRender } from 'weimo-ui-markdown/components/wdf-render'
import type { ComponentDefinition } from '../../component-docs'

import { wdfRenderSample } from '../../fixtures/wdf-sample'
import { WdfSimpleStylePreview } from './markdown-styles'

function WdfRenderPreview() {
  return (
    <ComponentPreviewCard
      label={
        <>
          WDF渲染 <code className="docs-component-class">wdf-render</code>
        </>
      }
    >
      <WdfRender aria-label="WdfRender 预览" content={wdfRenderSample} />
    </ComponentPreviewCard>
  )
}

function WdfRenderDemo() {
  return (
    <>
      <WdfRenderPreview />
      <WdfSimpleStylePreview />
    </>
  )
}

export const wdfRenderDefinition = {
  id: 'wdf-render',
  summary: 'WdfRender 直接渲染 WDF，并与 MdRender 共享排版样式 token',
  status: 'Ready',
  frame: 'plain',
  preview: () => <WdfRenderDemo />,
} satisfies ComponentDefinition
