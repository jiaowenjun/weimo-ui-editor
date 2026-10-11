import type { PackageCatalog } from '../../types'

export const markdownCatalog = {
  id: 'weimo-ui-markdown',
  title: 'weimo-ui-markdown',
  pages: [
    {
      id: 'markdown-render',
      name: 'Markdown渲染',
      exportName: 'MdRender',
      registryName: 'md-render',
      packageExport: './components/md-render',
    },
    {
      id: 'rich-editor',
      name: '富文本编辑',
      exportName: 'RichEditor',
      registryName: 'rich-editor',
      packageExport: './components/rich-editor',
    },
  ],
} as const satisfies PackageCatalog
