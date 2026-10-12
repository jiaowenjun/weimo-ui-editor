import { useRef, useState } from 'react'
import { Bold, Check, Heading1, List, Pencil, Quote, X } from 'lucide-react'

import { ComponentPreviewCard } from 'weimo-ui-core/components/component-preview-card'
import { GhostIconButton } from 'weimo-ui-core/components/ghost-icon-button'
import {
  WdfView,
  type WdfViewHandle,
  type WdfViewMode,
  type WdfDocument,
} from 'weimo-ui-editor/components/wdf-view'
import type { RichEditorSelectionFormat } from 'weimo-ui-editor/components/rich-editor'
import type { ComponentDefinition } from '../../component-docs'

import { wdfRenderSample } from '../../fixtures/wdf-sample'

function WdfViewDemo() {
  const [content, setContent] = useState<WdfDocument>(wdfRenderSample)
  const [mode, setMode] = useState<WdfViewMode>('view')
  const [selectionFormat, setSelectionFormat] =
    useState<RichEditorSelectionFormat | null>(null)
  const [editingSession, setEditingSession] = useState(0)
  const viewRef = useRef<WdfViewHandle | null>(null)
  const editing = mode === 'edit'

  const cancelEditing = () => {
    // WdfView normally commits its local draft on edit -> view. Replacing this
    // docs-demo instance skips that transition and restores the committed value.
    setEditingSession((current) => current + 1)
    setMode('view')
  }

  const saveEditing = () => setMode('view')

  return (
    <ComponentPreviewCard
      action={
        editing ? (
          <div aria-label="编辑操作" className="wdf-view-docs-actions" role="group">
            <GhostIconButton
              aria-label="取消编辑"
              onClick={cancelEditing}
              size="sm"
            >
              <X />
            </GhostIconButton>
            <GhostIconButton
              aria-label="保存编辑"
              onClick={saveEditing}
              size="sm"
            >
              <Check />
            </GhostIconButton>
          </div>
        ) : (
          <GhostIconButton
            aria-label="切换到编辑模式"
            onClick={() => setMode('edit')}
            size="sm"
          >
            <Pencil />
          </GhostIconButton>
        )
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
        key={editingSession}
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
  summary: 'WdfView 以会话草稿编辑 WDF，并在退出编辑态时一次提交',
  status: 'Ready',
  frame: 'plain',
  preview: () => <WdfViewDemo />,
} satisfies ComponentDefinition
