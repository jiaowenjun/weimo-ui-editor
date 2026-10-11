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
      id: 'markdown-edit',
      name: 'Markdown编辑',
      exportName: 'MdEditor',
      registryName: 'md-editor',
      packageExport: './components/md-editor',
    },
  ],
} as const satisfies PackageCatalog
