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
      id: 'mobile-wdf-view',
      name: '移动卡片式视图',
      exportName: 'WdfView',
      registryName: 'wdf-view',
      packageExport: './components/wdf-view',
    },
    {
      id: 'new-mobile-wdf-view',
      name: '移动卡片式视图(新·对照)',
      exportName: 'NewMobileWdfView',
      registryName: 'new-mobile-wdf-view',
      packageExport: './components/new-mobile-wdf-view',
    },
  ],
} as const satisfies PackageCatalog
