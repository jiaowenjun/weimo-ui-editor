import type { PackageCatalog } from '../../types'

export const editorCatalog = {
  id: 'weimo-ui-editor',
  title: 'weimo-ui-editor',
  pages: [
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
    {
      id: 'new-wdf-view',
      name: '自适应读写视图',
      exportName: 'NewWdfView',
      registryName: 'new-wdf-view',
      packageExport: './components/new-wdf-view',
    },
    {
      id: 'mobile-wdf-view',
      name: '移动卡片式视图',
      exportName: 'WdfView',
      registryName: 'wdf-view',
      packageExport: './components/wdf-view',
    },
  ],
} as const satisfies PackageCatalog
