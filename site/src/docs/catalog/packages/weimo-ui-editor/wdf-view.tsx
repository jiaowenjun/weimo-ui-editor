import { useCallback, useRef, useState } from 'react'
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

import './wdf-view.css'

/**
 * 底部工具栏带过渡(实机 A/B 择定方案固化):
 * - footer 常驻 + grid-rows 0fr↔1fr 收展(复刻 base-card__meta-region
 *   模式,收展的内容即动画主体,无空带窗口);
 * - 展开延迟到编辑器 onReady 后两帧(绕开首绘延迟对过渡前段的压缩);
 * - 内容 Δ 归零(编辑器 viewport 14px 底距归零,两列 ±0,卡高唯一
 *   增量=工具栏带);
 * - 模式换挡窗口豁免滚动锚定(Safari 27 对卡高变化的静默补偿)。
 */

/** 滚动锚定豁免(演示页本地版,机制同组件内 3e85ce2 的助手)。 */
function suppressScrollAnchoring(durationMs: number) {
  const { style } = document.documentElement
  style.overflowAnchor = 'none'
  window.setTimeout(() => {
    if (style.overflowAnchor === 'none') style.overflowAnchor = ''
  }, durationMs)
}

/** rAF + 定时器竞速(rAF 在后台标签页下可能挂起,幂等)。 */
function nextFrame(callback: () => void) {
  let called = false
  const run = () => {
    if (called) return
    called = true
    callback()
  }
  requestAnimationFrame(run)
  window.setTimeout(run, 80)
}

function WdfViewDemo() {
  const [content, setContent] = useState<WdfDocument>(wdfRenderSample)
  const [mode, setMode] = useState<WdfViewMode>('view')
  const [selectionFormat, setSelectionFormat] =
    useState<RichEditorSelectionFormat | null>(null)
  const [editingSession, setEditingSession] = useState(0)
  const [bandOpen, setBandOpen] = useState(false)
  const viewRef = useRef<WdfViewHandle | null>(null)
  const modeRef = useRef(mode)
  modeRef.current = mode
  const editing = mode === 'edit'

  /** 编辑器就绪后两帧再展开带:确保首绘已完成,过渡时钟不被首绘
   * 延迟压缩前段;modeRef 守卫防止延迟链落在退出之后时在 view 态
   * 重开带。 */
  const handleEditorReady = useCallback(() => {
    nextFrame(() => {
      nextFrame(() => {
        if (modeRef.current === 'edit') setBandOpen(true)
      })
    })
  }, [])

  const enterEdit = () => {
    suppressScrollAnchoring(700)
    setMode('edit')
  }

  const exitEditing = (intent: 'cancel' | 'save') => {
    suppressScrollAnchoring(700)
    setBandOpen(false)
    if (intent === 'cancel') {
      // WdfView normally commits its local draft on edit -> view. Replacing
      // this docs-demo instance skips that transition and restores the
      // committed value.
      setEditingSession((current) => current + 1)
    }
    setMode('view')
  }

  return (
    <ComponentPreviewCard
      action={
        editing ? (
          <div aria-label="编辑操作" className="wdf-view-docs-actions" role="group">
            <GhostIconButton
              aria-label="取消编辑"
              onClick={() => exitEditing('cancel')}
              size="sm"
            >
              <X />
            </GhostIconButton>
            <GhostIconButton
              aria-label="保存编辑"
              onClick={() => exitEditing('save')}
              size="sm"
            >
              <Check />
            </GhostIconButton>
          </div>
        ) : (
          <GhostIconButton
            aria-label="切换到编辑模式"
            onClick={enterEdit}
            size="sm"
          >
            <Pencil />
          </GhostIconButton>
        )
      }
      className="wdf-view-demo"
      footer={
        <div className="wdf-toolbar-band" data-open={bandOpen}>
          <div className="wdf-toolbar-band__inner">
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
                onClick={() =>
                  viewRef.current?.toggleBlockFormat('heading')
                }
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
          </div>
        </div>
      }
      label={
        <>
          WDF读写视图 <code className="docs-component-class">wdf-view</code>
        </>
      }
    >
      <WdfView
        editorProps={{
          onReady: handleEditorReady,
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
