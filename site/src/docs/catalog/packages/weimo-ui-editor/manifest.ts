import type { PackageCatalog } from '../../types'

export const editorCatalog = {
  id: 'weimo-ui-editor',
  title: 'weimo-ui-editor',
  pages: [
    {
      id: 'new-mdf-view',
      name: '新版WDF读写视图',
      exportName: 'NewMdfView',
      registryName: 'new-mdf-view',
      packageExport: './components/new-mdf-view',
    },
    {
      id: 'wdf-view',
      name: 'WDF读写视图',
      exportName: 'WdfView',
      registryName: 'wdf-view',
      packageExport: './components/wdf-view',
    },
    {
      id: 'wdf-render',
      name: 'WDF渲染',
      exportName: 'WdfRender',
      registryName: 'wdf-render',
      packageExport: './components/wdf-render',
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
