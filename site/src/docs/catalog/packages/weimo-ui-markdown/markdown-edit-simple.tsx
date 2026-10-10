import { useLayoutEffect, useRef, useState } from 'react'
import { Bold, Heading1, List, Quote } from 'lucide-react'

import { ComponentPreviewCard } from 'weimo-ui-core/components/component-preview-card'
import { GhostIconButton } from 'weimo-ui-core/components/ghost-icon-button'
import {
  MdEditorSimple,
  type MdEditorSimpleContent,
  type MdEditorSimpleHandle,
  type MdEditorSimpleSelectionFormat,
} from 'weimo-ui-markdown/components/md-editor-simple'
import type { ComponentDefinition } from '../../component-docs'

import { MarkdownEditSelectionStylePreview } from './markdown-styles'

// 内容以 tiptap 原生 JSON 进出，编辑器不做任何 Markdown 解析与序列化。
const mdEditorSimpleSample: MdEditorSimpleContent = {
  type: 'doc',
  content: [
    {
      type: 'heading',
      attrs: { level: 1 },
      content: [{ type: 'text', text: '春夜' }],
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

function MdEditorSimpleDemo() {
  const [content, setContent] = useState<MdEditorSimpleContent>(mdEditorSimpleSample)
  const [selectionFormat, setSelectionFormat] =
    useState<MdEditorSimpleSelectionFormat | null>(null)
  const editorRef = useRef<MdEditorSimpleHandle | null>(null)
  const previewRef = useRef<HTMLDivElement | null>(null)
  // null 表示尚未测量,容器保持自适应高度,避免首帧从 0 闪跳
  const [previewHeight, setPreviewHeight] = useState<number | null>(null)

  useLayoutEffect(() => {
    const preview = previewRef.current
    const editorRoot = preview?.querySelector<HTMLElement>(':scope > .md-editor')

    if (!preview || !editorRoot) return

    const observedEditorRoot: HTMLElement = editorRoot

    function syncPreviewHeight() {
      setPreviewHeight(observedEditorRoot.getBoundingClientRect().height)
    }

    syncPreviewHeight()

    if (typeof ResizeObserver === 'undefined') return

    const editorResizeObserver = new ResizeObserver(syncPreviewHeight)
    editorResizeObserver.observe(editorRoot)

    return () => editorResizeObserver.disconnect()
  }, [])

  return (
    <>
      <ComponentPreviewCard
        footer={
          <div className="md-editor-docs-toolbar">
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
        label="简化Markdown编辑器"
      >
        <div
          className="md-editor-docs-preview"
          ref={previewRef}
          style={previewHeight === null ? undefined : { height: previewHeight }}
        >
          <MdEditorSimple
            onChange={setContent}
            onSelectionFormatChange={setSelectionFormat}
            placeholder="写点什么..."
            ref={editorRef}
            value={content}
          />
        </div>
      </ComponentPreviewCard>
      <MarkdownEditSelectionStylePreview />
    </>
  )
}

export const markdownEditSimpleDefinition = {
  id: 'markdown-edit-simple',
  summary: 'MdEditorSimple 简化编辑器，tiptap JSON 内容进出，仅四种格式',
  status: 'Ready',
  frame: 'plain',
  preview: () => <MdEditorSimpleDemo />,
} satisfies ComponentDefinition
