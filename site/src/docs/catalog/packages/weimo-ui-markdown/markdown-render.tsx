import { ComponentPreviewCard } from 'weimo-ui-core/components/component-preview-card'
import { MdRender } from 'weimo-ui-markdown/components/md-render'
import type { ComponentDefinition } from '../../component-docs'

import { mdRenderSample } from '../../fixtures/markdown-sample'
import { MarkdownSimpleStylePreview } from './markdown-styles'

function MdRenderPreview() {
  return (
    <ComponentPreviewCard
      label={
        <>
          Markdown渲染{' '}
          <code className="docs-component-class">md-render</code>
        </>
      }
    >
      <MdRender aria-label="MdRender 预览" content={mdRenderSample} />
    </ComponentPreviewCard>
  )
}

function MarkdownRenderDemo() {
  return (
    <>
      <MdRenderPreview />
      <MarkdownSimpleStylePreview />
    </>
  )
}

export const markdownRenderDefinition = {
  id: 'markdown-render',
  summary: 'MdRender 渲染效果与常用 Markdown 样式 token 总览',
  status: 'Ready',
  frame: 'plain',
  preview: () => <MarkdownRenderDemo />,
} satisfies ComponentDefinition
