import type { PackageCatalog } from '../../types'

export const editorCatalog = {
  id: 'weimo-ui-editor',
  title: 'weimo-ui-editor',
  pages: [
    {
      id: 'wdf-card',
      name: 'WDF读写卡片',
      exportName: 'WdfCard',
      registryName: 'wdf-card',
      packageExport: './components/wdf-card',
    },
    {
      id: 'card-composer',
      name: '新建占位壳层',
      exportName: 'CardComposer',
      registryName: 'card-composer',
      packageExport: './components/card-composer',
    },
  ],
} as const satisfies PackageCatalog
