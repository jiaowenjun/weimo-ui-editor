import { RotateCcw } from 'lucide-react'
import { useState } from 'react'

import { ComponentPreviewCard } from 'weimo-ui-core/components/component-preview-card'
import { GhostIconButton } from 'weimo-ui-core/components/ghost-icon-button'
import { MdRenderSimple } from 'weimo-ui-markdown/components/md-render-simple'
import type { ComponentDefinition } from '../../component-docs'

const sampleMarkdown = `# 春夜

正文 **粗体** 保持卡片阅读节奏。

>= 居中引用
>= 适合署名、短诗和提醒

> 普通引用保持左对齐。

- 第一条
- 第二条

A. 选项甲
B. 选项乙

[访问 Weimo](https://weimo.ink)

![未解析图片](missing-image)`

function MarkdownRenderSimpleDemo() {
  const [markdown, setMarkdown] = useState(sampleMarkdown)

  return (
    <div className="docs-page">
      <header className="docs-page__intro">
        <p className="docs-page__eyebrow">weimo-ui-markdown/components/md-render-simple</p>
        <h1>简单 Markdown 渲染</h1>
        <p>渲染基础 Markdown、扩展列表和居中引用；链接与原始 HTML 会经过安全过滤。</p>
      </header>

      <div className="docs-page__grid">
        <ComponentPreviewCard
          action={
            <GhostIconButton
              aria-label="恢复示例源码"
              onClick={() => setMarkdown(sampleMarkdown)}
              size="sm"
            >
              <RotateCcw aria-hidden="true" />
            </GhostIconButton>
          }
          className="markdown-preview-card"
          label="Markdown 源码"
        >
          <textarea
            aria-label="Markdown 源码"
            className="markdown-source"
            onChange={(event) => setMarkdown(event.target.value)}
            spellCheck={false}
            value={markdown}
          />
        </ComponentPreviewCard>

        <ComponentPreviewCard
          className="markdown-preview-card"
          label="实时渲染"
          footer={
            <div className="docs-card-footer">
              <span className="docs-card-footer__result">{markdown.length} 个源码字符</span>
            </div>
          }
        >
          <div className="markdown-render-stage">
            <MdRenderSimple content={markdown} />
          </div>
        </ComponentPreviewCard>
      </div>
    </div>
  )
}

export const markdownRenderSimpleDefinition = {
  id: 'markdown-render-simple',
  summary: '安全渲染基础 Markdown、扩展列表与居中引用',
  status: 'Ready',
  frame: 'plain',
  preview: () => <MarkdownRenderSimpleDemo />,
} satisfies ComponentDefinition
