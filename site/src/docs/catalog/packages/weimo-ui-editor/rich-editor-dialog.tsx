import { useState } from 'react'
import { Pencil } from 'lucide-react'

import { ComponentPreviewCard } from 'weimo-ui-core/components/component-preview-card'
import { GhostIconButton } from 'weimo-ui-core/components/ghost-icon-button'
import {
  RichEditor,
  type RichEditorContent,
} from 'weimo-ui-editor/components/rich-editor'
import {
  RichEditorDialog,
} from 'weimo-ui-editor/components/rich-editor-dialog'
import type { ComponentDefinition } from '../../component-docs'

const dialogSample: RichEditorContent = {
  type: 'doc',
  content: [
    {
      type: 'heading',
      attrs: { level: 2 },
      content: [{ type: 'text', text: '移动端编辑会话' }],
    },
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: '点击右上角铅笔打开弹窗;工具栏位于对话框底部,' },
        { type: 'text', marks: [{ type: 'bold' }], text: '紧贴软键盘上方' },
        { type: 'text', text: '。' },
      ],
    },
    {
      type: 'bulletList',
      content: [
        {
          type: 'listItem',
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: '保存:提交草稿' }] },
          ],
        },
        {
          type: 'listItem',
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: '取消/Esc/遮罩:放弃草稿' }] },
          ],
        },
      ],
    },
  ],
}

function RichEditorDialogDemo() {
  const [content, setContent] = useState<RichEditorContent>(dialogSample)
  const [open, setOpen] = useState(false)
  const [lastAction, setLastAction] = useState<string | null>(null)

  const handleSave = (next: RichEditorContent) => {
    setContent(next)
    setLastAction('已保存草稿')
  }

  return (
    <ComponentPreviewCard
      action={
        <GhostIconButton
          aria-label="打开弹出式编辑器"
          onClick={() => setOpen(true)}
          size="sm"
        >
          <Pencil />
        </GhostIconButton>
      }
      footer={
        lastAction ? (
          <span className="rich-editor-dialog-docs-hint">{lastAction}</span>
        ) : undefined
      }
      label={
        <>
          弹出式编辑器{' '}
          <code className="docs-component-class">rich-editor-dialog</code>
        </>
      }
    >
      <div className="rich-editor-dialog-docs-preview">
        <RichEditor disabled value={content} />
      </div>
      <RichEditorDialog
        onCancel={() => setLastAction('已放弃草稿')}
        onOpenChange={setOpen}
        onSave={handleSave}
        open={open}
        title="编辑内容"
        value={content}
      />
    </ComponentPreviewCard>
  )
}

export const richEditorDialogDefinition = {
  id: 'rich-editor-dialog',
  summary:
    'RichEditorDialog 把 RichEditor 装进 coss 对话框,visualViewport 定尺寸,移动端键盘不遮挡工具栏',
  status: 'Ready',
  frame: 'plain',
  preview: () => <RichEditorDialogDemo />,
} satisfies ComponentDefinition
