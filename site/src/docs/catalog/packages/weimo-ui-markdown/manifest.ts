import type { PackageCatalog } from '../../types'

export const markdownCatalog = {
  id: 'weimo-ui-markdown',
  title: 'weimo-ui-markdown',
  pages: [
    {
      id: 'markdown-render-simple',
      name: 'Markdown渲染',
      exportName: 'MdRenderSimple',
      registryName: 'md-render-simple',
      packageExport: './components/md-render-simple',
    },
    {
      id: 'markdown-edit-simple',
      name: 'Markdown编辑',
      exportName: 'MdEditorSimple',
      registryName: 'md-editor-simple',
      packageExport: './components/md-editor-simple',
    },
  ],
} as const satisfies PackageCatalog
