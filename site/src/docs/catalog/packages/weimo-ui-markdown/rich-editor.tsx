import { useRef, useState } from 'react'
import { Bold, Heading1, List, Quote, RotateCcw } from 'lucide-react'

import { ComponentPreviewCard } from 'weimo-ui-core/components/component-preview-card'
import { GhostIconButton } from 'weimo-ui-core/components/ghost-icon-button'
import {
  RichEditor,
  type RichEditorContent,
  type RichEditorHandle,
  type RichEditorSelectionFormat,
} from 'weimo-ui-markdown/components/rich-editor'
import type { ComponentDefinition } from '../../component-docs'

import { RichEditorSelectionStylePreview } from './markdown-styles'

// 内容以 tiptap 原生 JSON 进出，编辑器不做任何 Markdown 解析与序列化。
const richEditorSample: RichEditorContent = {
  type: 'doc',
  content: [
    {
      type: 'heading',
      attrs: { level: 1 },
      content: [{ type: 'text', text: '一级标题' }],
    },
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: '正文 ' },
        { type: 'text', marks: [{ type: 'bold' }], text: '粗体' },
        { type: 'text', text: ' 保持卡片阅读节奏。' },
      ],
    },
    {
      type: 'blockquote',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: '普通引用保持左对齐。' }] },
      ],
    },
    {
      type: 'bulletList',
      content: [
        {
          type: 'listItem',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: '第一条' }] }],
        },
        {
          type: 'listItem',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: '第二条' }] }],
        },
      ],
    },
  ],
}

function RichEditorDemo() {
  const [content, setContent] = useState<RichEditorContent>(richEditorSample)
  const [selectionFormat, setSelectionFormat] =
    useState<RichEditorSelectionFormat | null>(null)
  const editorRef = useRef<RichEditorHandle | null>(null)

  return (
    <>
      <ComponentPreviewCard
        action={
          <div className="rich-editor-docs-toolbar">
            <GhostIconButton
              aria-label="重置内容"
              onClick={() => setContent(richEditorSample)}
              size="sm"
            >
              <RotateCcw />
            </GhostIconButton>
          </div>
        }
        footer={
          <div className="rich-editor-docs-toolbar">
            <GhostIconButton
              active={selectionFormat?.bold === true}
              aria-label="切换粗体"
              disabled={!selectionFormat}
              onClick={() => editorRef.current?.toggleBold()}
              size="sm"
            >
              <Bold />
            </GhostIconButton>
            <GhostIconButton
              active={selectionFormat?.block === 'heading'}
              aria-label="切换标题"
              disabled={!selectionFormat}
              onClick={() => editorRef.current?.toggleBlockFormat('heading')}
              size="sm"
            >
              <Heading1 />
            </GhostIconButton>
            <GhostIconButton
              active={selectionFormat?.block === 'list'}
              aria-label="切换无序列表"
              disabled={!selectionFormat}
              onClick={() => editorRef.current?.toggleBlockFormat('list')}
              size="sm"
            >
              <List />
            </GhostIconButton>
            <GhostIconButton
              active={selectionFormat?.block === 'quote'}
              aria-label="切换引用"
              disabled={!selectionFormat}
              onClick={() => editorRef.current?.toggleBlockFormat('quote')}
              size="sm"
            >
              <Quote />
            </GhostIconButton>
          </div>
        }
        label={
          <>
            富文本编辑器{' '}
            <code className="docs-component-class">rich-editor</code>
          </>
        }
      >
        <div className="rich-editor-docs-preview">
          <RichEditor
            onChange={setContent}
            onSelectionFormatChange={setSelectionFormat}
            placeholder="写点什么..."
            ref={editorRef}
            value={content}
          />
        </div>
      </ComponentPreviewCard>
      <RichEditorSelectionStylePreview />
    </>
  )
}

export const richEditorDefinition = {
  id: 'rich-editor',
  summary: 'RichEditor 编辑器，Tiptap JSON 内容进出，schema 与 WDF v0.1 对齐',
  status: 'Ready',
  frame: 'plain',
  preview: () => <RichEditorDemo />,
} satisfies ComponentDefinition
