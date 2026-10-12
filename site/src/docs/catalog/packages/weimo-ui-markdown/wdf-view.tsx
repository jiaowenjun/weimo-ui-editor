import { useRef, useState } from 'react'
import { Bold, Eye, Heading1, List, Pencil, Quote } from 'lucide-react'

import { ComponentPreviewCard } from 'weimo-ui-core/components/component-preview-card'
import { GhostIconButton } from 'weimo-ui-core/components/ghost-icon-button'
import {
  WdfView,
  type WdfViewHandle,
  type WdfViewMode,
  type WdfDocument,
} from 'weimo-ui-markdown/components/wdf-view'
import type { RichEditorSelectionFormat } from 'weimo-ui-markdown/components/rich-editor'
import type { ComponentDefinition } from '../../component-docs'

import { wdfRenderSample } from '../../fixtures/wdf-sample'

function WdfViewDemo() {
  const [content, setContent] = useState<WdfDocument>(wdfRenderSample)
  const [mode, setMode] = useState<WdfViewMode>('view')
  const [selectionFormat, setSelectionFormat] =
    useState<RichEditorSelectionFormat | null>(null)
  const viewRef = useRef<WdfViewHandle | null>(null)
  const editing = mode === 'edit'

  return (
    <ComponentPreviewCard
      action={
        <GhostIconButton
          aria-label={editing ? '切换到阅读模式' : '切换到编辑模式'}
          onClick={() => setMode(editing ? 'view' : 'edit')}
          size="sm"
        >
          {editing ? <Eye /> : <Pencil />}
        </GhostIconButton>
      }
      footer={editing ? (
        <div className="rich-editor-docs-toolbar">
          <GhostIconButton
            active={selectionFormat?.bold === true}
            aria-label="切换粗体"
            disabled={!selectionFormat}
            onClick={() => viewRef.current?.toggleBold()}
            size="sm"
          >
            <Bold />
          </GhostIconButton>
          <GhostIconButton
            active={selectionFormat?.block === 'heading'}
            aria-label="切换标题"
            disabled={!selectionFormat}
            onClick={() => viewRef.current?.toggleBlockFormat('heading')}
            size="sm"
          >
            <Heading1 />
          </GhostIconButton>
          <GhostIconButton
            active={selectionFormat?.block === 'list'}
            aria-label="切换无序列表"
            disabled={!selectionFormat}
            onClick={() => viewRef.current?.toggleBlockFormat('list')}
            size="sm"
          >
            <List />
          </GhostIconButton>
          <GhostIconButton
            active={selectionFormat?.block === 'quote'}
            aria-label="切换引用"
            disabled={!selectionFormat}
            onClick={() => viewRef.current?.toggleBlockFormat('quote')}
            size="sm"
          >
            <Quote />
          </GhostIconButton>
        </div>
      ) : undefined}
      label={
        <>
          WDF读写视图 <code className="docs-component-class">wdf-view</code>
        </>
      }
    >
      <WdfView
        editorProps={{
          onSelectionFormatChange: setSelectionFormat,
          placeholder: '写点什么...',
        }}
        mode={mode}
        onChange={setContent}
        ref={viewRef}
        value={content}
      />
    </ComponentPreviewCard>
  )
}

export const wdfViewDefinition = {
  id: 'wdf-view',
  summary: 'WdfView 以一份 WDF 内容在渲染与编辑状态之间切换',
  status: 'Ready',
  frame: 'plain',
  preview: () => <WdfViewDemo />,
} satisfies ComponentDefinition
