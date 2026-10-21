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
      id: 'rich-editor-dialog',
      name: '弹出式编辑',
      exportName: 'RichEditorDialog',
      registryName: 'rich-editor-dialog',
      packageExport: './components/rich-editor-dialog',
    },
    {
      id: 'rich-editor-card',
      name: '卡片式编辑',
      exportName: 'RichEditorCard',
      registryName: 'rich-editor-card',
      packageExport: './components/rich-editor-card',
    },
    {
      id: 'rich-editor-card-no-shadow',
      name: '卡片式编辑（无阴影/遮罩）',
      exportName: 'RichEditorCard',
      registryName: 'rich-editor-card',
      packageExport: './components/rich-editor-card',
    },
  ],
} as const satisfies PackageCatalog
