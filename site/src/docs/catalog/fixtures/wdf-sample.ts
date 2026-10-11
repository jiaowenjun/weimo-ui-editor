import type { WdfDocument } from 'weimo-ui-markdown/components/wdf-render'

export const wdfRenderSample = {
  schema: 'weimo.document',
  version: 1,
  root: {
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
          { type: 'text', text: '粗体', marks: [{ type: 'bold' }] },
          { type: 'text', text: ' 保持卡片阅读节奏。' },
        ],
      },
      {
        type: 'blockquote',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: '普通引用保持左对齐。' }],
          },
        ],
      },
      {
        type: 'bullet_list',
        content: [
          {
            type: 'list_item',
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: '第一条' }],
              },
            ],
          },
          {
            type: 'list_item',
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: '第二条' }],
              },
            ],
          },
        ],
      },
    ],
  },
} satisfies WdfDocument
