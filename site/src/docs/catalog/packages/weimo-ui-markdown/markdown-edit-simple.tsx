import { Bold, Heading1, List, Quote, Trash2 } from 'lucide-react'
import { useRef, useState } from 'react'

import { ComponentPreviewCard } from 'weimo-ui-core/components/component-preview-card'
import { GhostIconButton } from 'weimo-ui-core/components/ghost-icon-button'
import { LabeledSwitch } from 'weimo-ui-core/components/labeled-switch'
import { TextButton } from 'weimo-ui-core/components/text-button'
import {
  MdEditorSimple,
  type MdEditorSimpleContent,
  type MdEditorSimpleHandle,
  type MdEditorSimpleSelectionFormat,
} from 'weimo-ui-markdown/components/md-editor-simple'
import type { ComponentDefinition } from '../../component-docs'

const sampleDocument: MdEditorSimpleContent = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: '春夜' }] },
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

function MarkdownEditSimpleDemo() {
  const [content, setContent] = useState<MdEditorSimpleContent>(sampleDocument)
  const [disabled, setDisabled] = useState(false)
  const [message, setMessage] = useState('可使用 Mod+S 触发保存')
  const [selectionFormat, setSelectionFormat] =
    useState<MdEditorSimpleSelectionFormat | null>(null)
  const editorRef = useRef<MdEditorSimpleHandle | null>(null)

  return (
    <div className="docs-page">
      <header className="docs-page__intro">
        <p className="docs-page__eyebrow">weimo-ui-markdown/components/md-editor-simple</p>
        <h1>简单 Markdown 编辑</h1>
        <p>以 Tiptap JSON 作为输入输出，只开放一级标题、粗体、引用和无序列表。</p>
      </header>

      <div className="docs-page__grid">
        <ComponentPreviewCard
          action={
            <LabeledSwitch
              ariaLabel="切换编辑器禁用状态"
              checked={!disabled}
              labelOff="只读"
              labelOn="编辑"
              onCheckedChange={(editable) => setDisabled(!editable)}
            />
          }
          className="markdown-preview-card markdown-preview-card--editor"
          label="JSON 内容编辑器"
          footer={
            <div className="docs-card-footer">
              <span className="docs-card-footer__result">{message}</span>
              <TextButton
                onClick={() => {
                  setContent(sampleDocument)
                  setMessage('已恢复示例内容')
                }}
                variant="ghost"
              >
                恢复示例
              </TextButton>
            </div>
          }
        >
          <div className="markdown-editor-shell">
            <div aria-label="编辑器格式工具栏" className="markdown-editor-toolbar" role="toolbar">
              <GhostIconButton
                active={selectionFormat?.block === 'heading'}
                aria-label="切换一级标题"
                disabled={disabled || !selectionFormat}
                onClick={() => editorRef.current?.toggleBlockFormat('heading')}
                size="sm"
              >
                <Heading1 aria-hidden="true" />
              </GhostIconButton>
              <GhostIconButton
                active={selectionFormat?.bold}
                aria-label="切换粗体"
                disabled={disabled || !selectionFormat}
                onClick={() => editorRef.current?.toggleBold()}
                size="sm"
              >
                <Bold aria-hidden="true" />
              </GhostIconButton>
              <GhostIconButton
                active={selectionFormat?.block === 'list'}
                aria-label="切换无序列表"
                disabled={disabled || !selectionFormat}
                onClick={() => editorRef.current?.toggleBlockFormat('list')}
                size="sm"
              >
                <List aria-hidden="true" />
              </GhostIconButton>
              <GhostIconButton
                active={selectionFormat?.block === 'quote'}
                aria-label="切换引用"
                disabled={disabled || !selectionFormat}
                onClick={() => editorRef.current?.toggleBlockFormat('quote')}
                size="sm"
              >
                <Quote aria-hidden="true" />
              </GhostIconButton>
              <span aria-hidden="true" className="markdown-editor-toolbar__divider" />
              <GhostIconButton
                aria-label="清空编辑器"
                disabled={disabled}
                onClick={() => editorRef.current?.clear()}
                size="sm"
              >
                <Trash2 aria-hidden="true" />
              </GhostIconButton>
            </div>

            <div className="markdown-editor-viewport">
              <MdEditorSimple
                disabled={disabled}
                onCancel={() => setMessage('已触发取消快捷键')}
                onChange={setContent}
                onSave={() => setMessage('已通过 Mod+S 保存当前 JSON 内容')}
                onSelectionFormatChange={setSelectionFormat}
                placeholder="写点什么……"
                ref={editorRef}
                value={content}
              />
            </div>
          </div>
        </ComponentPreviewCard>

        <ComponentPreviewCard className="markdown-preview-card" label="当前 JSON">
          <pre className="markdown-editor-json">{JSON.stringify(content, null, 2)}</pre>
        </ComponentPreviewCard>
      </div>
    </div>
  )
}

export const markdownEditSimpleDefinition = {
  id: 'markdown-edit-simple',
  summary: '以 Tiptap JSON 进出的受限格式富文本编辑器',
  status: 'Ready',
  frame: 'plain',
  searchAliases: [
    'MdEditorSimple',
    'Tiptap JSON',
    'Markdown 编辑',
    '简单 Markdown 编辑器',
  ],
  preview: () => <MarkdownEditSimpleDemo />,
} satisfies ComponentDefinition
