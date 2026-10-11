import type { ReactNode } from 'react'
import { ComponentPreviewCard } from 'weimo-ui-core/components/component-preview-card'
import { MdRender } from 'weimo-ui-markdown/components/md-render'
import {
  WdfRender,
  type WdfBlock,
  type WdfDocument,
} from 'weimo-ui-markdown/components/wdf-render'

type MarkdownStyleToken = {
  token: string
  value: string | { light: string; dark: string }
}

const markdownStyleTokens = [
  {
    token: '--md-color',
    value: { light: 'hsl(0 0% 9%)', dark: 'hsl(0 0% 98%)' },
  },
  { token: '--md-font-size', value: '16px' },
  { token: '--md-line-height', value: '1.6' },
  {
    token: '--md-paragraph-color',
    value: { light: 'hsl(0 0% 9%)', dark: 'hsl(0 0% 98%)' },
  },
  {
    token: '--md-h1-color',
    value: { light: 'hsl(0 0% 9%)', dark: 'hsl(0 0% 98%)' },
  },
  { token: '--md-h1-font-size', value: '16px' },
  { token: '--md-h1-line-height', value: '1.6' },
  {
    token: '--md-quote-color',
    value: { light: 'hsl(0 0% 28%)', dark: 'hsl(0 0% 64%)' },
  },
  { token: '--md-quote-pad-inline', value: '20px' },
  { token: '--md-list-indent', value: '1.35em' },
  {
    token: '--md-selection-bg',
    value: { light: 'hsl(0 0% 15% / 0.2)', dark: 'hsl(0 0% 96% / 0.2)' },
  },
] satisfies readonly MarkdownStyleToken[]

type MarkdownStyleTokenName = (typeof markdownStyleTokens)[number]['token']
type MarkdownStyleTokenGroup = (typeof markdownStyleTokenGroups)[number]

const markdownStyleTokenGroups = [
  {
    label: '内容容器',
    tokens: ['--md-color', '--md-font-size', '--md-line-height'],
  },
  { label: '段落', tokens: ['--md-paragraph-color'] },
  {
    label: '标题',
    tokens: ['--md-h1-color', '--md-h1-font-size', '--md-h1-line-height'],
  },
  {
    label: '引用块',
    tokens: ['--md-quote-color', '--md-quote-pad-inline'],
  },
  { label: '列表', tokens: ['--md-list-indent'] },
] satisfies readonly {
  label: string
  tokens: readonly MarkdownStyleTokenName[]
}[]

function getMarkdownStyleToken(token: MarkdownStyleTokenName) {
  const item = markdownStyleTokens.find((candidate) => candidate.token === token)

  if (!item) {
    throw new Error(`Unknown Markdown style token: ${token}`)
  }

  return item
}

function renderMarkdownTokenGroupPreview(group: MarkdownStyleTokenGroup) {
  switch (group.label) {
    case '内容容器':
      return (
        <MdRender
          content={'<span>Markdown 内容容器<br />承载默认字色、字号和行高。</span>'}
        />
      )
    case '段落':
      return <MdRender content="这是一段用于预览正文颜色的 Markdown 文本。" />
    case '标题':
      return <MdRender content="# 一级标题" />
    case '引用块':
      return <MdRender content="> 引用块使用独立字色与横向内边距。" />
    case '列表':
      return <MdRender content="- 普通列表" />
    case '编辑选区':
      return (
        <p className="md-style-preview__selection-sample">
          <span className="md-style-preview__selection-copy">
            在编辑器里
            <span className="md-style-preview__selection-highlight">选中一段文字</span>
            时，会铺上这层柔和的强调底色；也可以直接拖选这段话试试。
          </span>
        </p>
      )
    default:
      return null
  }
}

function wdfDocument(...content: WdfBlock[]): WdfDocument {
  return {
    schema: 'weimo.document',
    version: 1,
    root: { type: 'doc', content },
  }
}

function renderWdfTokenGroupPreview(group: MarkdownStyleTokenGroup) {
  switch (group.label) {
    case '内容容器':
      return (
        <WdfRender
          content={wdfDocument({
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'WDF 内容容器\n承载默认字色、字号和行高。',
              },
            ],
          })}
        />
      )
    case '段落':
      return (
        <WdfRender
          content={wdfDocument({
            type: 'paragraph',
            content: [{ type: 'text', text: '这是一段用于预览正文颜色的 WDF 文本。' }],
          })}
        />
      )
    case '标题':
      return (
        <WdfRender
          content={wdfDocument({
            type: 'heading',
            attrs: { level: 1 },
            content: [{ type: 'text', text: '一级标题' }],
          })}
        />
      )
    case '引用块':
      return (
        <WdfRender
          content={wdfDocument({
            type: 'blockquote',
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: '引用块使用独立字色与横向内边距。' }],
              },
            ],
          })}
        />
      )
    case '列表':
      return (
        <WdfRender
          content={wdfDocument({
            type: 'bullet_list',
            content: [
              {
                type: 'list_item',
                content: [
                  {
                    type: 'paragraph',
                    content: [{ type: 'text', text: '普通列表' }],
                  },
                ],
              },
            ],
          })}
        />
      )
    default:
      return null
  }
}

function renderMarkdownStyleGroupCard(
  group: MarkdownStyleTokenGroup,
  renderPreview: (group: MarkdownStyleTokenGroup) => ReactNode,
) {
  return (
    <ComponentPreviewCard
      items={group.tokens.map((token) => {
        const item = getMarkdownStyleToken(token)

        return {
          darkValue: typeof item.value === 'string' ? undefined : item.value.dark,
          token: item.token,
          value: typeof item.value === 'string' ? item.value : item.value.light,
        }
      })}
      key={group.label}
      label={group.label}
    >
      <div className="md-style-preview__group-effect">
        <div className="md-style-preview__content-wrapper">
          {renderPreview(group)}
        </div>
      </div>
    </ComponentPreviewCard>
  )
}

export function MarkdownSimpleStylePreview() {
  return markdownStyleTokenGroups.map((group) =>
    renderMarkdownStyleGroupCard(group, renderMarkdownTokenGroupPreview),
  )
}

export function WdfSimpleStylePreview() {
  return markdownStyleTokenGroups.map((group) =>
    renderMarkdownStyleGroupCard(group, renderWdfTokenGroupPreview),
  )
}

const richEditorSelectionStyleTokenGroup = {
  label: '编辑选区',
  tokens: ['--md-selection-bg'],
} satisfies MarkdownStyleTokenGroup

export function RichEditorSelectionStylePreview() {
  return renderMarkdownStyleGroupCard(
    richEditorSelectionStyleTokenGroup,
    renderMarkdownTokenGroupPreview,
  )
}
