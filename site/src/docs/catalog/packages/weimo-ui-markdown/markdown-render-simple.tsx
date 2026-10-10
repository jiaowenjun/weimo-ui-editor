import { ComponentPreviewCard } from 'weimo-ui-core/components/component-preview-card'
import { MdRenderSimple } from 'weimo-ui-markdown/components/md-render-simple'
import type { ComponentDefinition } from '../../component-docs'

import { mdRenderSimpleSample } from '../../fixtures/markdown-sample'
import { MarkdownSimpleStylePreview } from './markdown-styles'

function MdRenderSimplePreview() {
  return (
    <ComponentPreviewCard
      label={
        <>
          Markdown渲染{' '}
          <code className="docs-component-class">md-render</code>
        </>
      }
    >
      <MdRenderSimple aria-label="MdRenderSimple 预览" content={mdRenderSimpleSample} />
    </ComponentPreviewCard>
  )
}

function MarkdownRenderSimpleDemo() {
  return (
    <>
      <MdRenderSimplePreview />
      <MarkdownSimpleStylePreview />
    </>
  )
}

export const markdownRenderSimpleDefinition = {
  id: 'markdown-render-simple',
  summary: 'MdRenderSimple 简化渲染效果与常用 Markdown 样式 token 总览',
  status: 'Ready',
  frame: 'plain',
  preview: () => <MarkdownRenderSimpleDemo />,
} satisfies ComponentDefinition
