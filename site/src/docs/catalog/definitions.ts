import { richEditorDefinition } from './packages/weimo-ui-editor/rich-editor'
import { richEditorCardDefinition } from './packages/weimo-ui-editor/rich-editor-card'
import { richEditorCardNoShadowDefinition } from './packages/weimo-ui-editor/rich-editor-card-no-shadow'
import { richEditorDialogDefinition } from './packages/weimo-ui-editor/rich-editor-dialog'
import { wdfRenderDefinition } from './packages/weimo-ui-editor/wdf-render'
import { wdfViewDefinition } from './packages/weimo-ui-editor/wdf-view'
import type { ComponentId } from './manifest'
import type { ComponentDefinition } from './types'

export const componentDefinitionsById = {
  'wdf-view': wdfViewDefinition,
  'wdf-render': wdfRenderDefinition,
  'rich-editor': richEditorDefinition,
  'rich-editor-dialog': richEditorDialogDefinition,
  'rich-editor-card': richEditorCardDefinition,
  'rich-editor-card-no-shadow': richEditorCardNoShadowDefinition,
} satisfies Record<ComponentId, ComponentDefinition>
