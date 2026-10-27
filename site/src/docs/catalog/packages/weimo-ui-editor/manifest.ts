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
  ],
} as const satisfies PackageCatalog
