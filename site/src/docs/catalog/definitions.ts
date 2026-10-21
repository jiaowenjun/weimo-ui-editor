import { richEditorDefinition } from './packages/weimo-ui-editor/rich-editor'
import { richEditorCardDefinition } from './packages/weimo-ui-editor/rich-editor-card'
import { richEditorCardIsolationDefinition } from './packages/weimo-ui-editor/rich-editor-card-isolation'
import { richEditorCardNoShadowDefinition } from './packages/weimo-ui-editor/rich-editor-card-no-shadow'
import { richEditorCardSubtractDefinition } from './packages/weimo-ui-editor/rich-editor-card-subtract'
import { richEditorCardStepwiseDefinition } from './packages/weimo-ui-editor/rich-editor-card-stepwise'
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
  'rich-editor-card-isolation': richEditorCardIsolationDefinition,
  'rich-editor-card-subtract': richEditorCardSubtractDefinition,
  'rich-editor-card-stepwise': richEditorCardStepwiseDefinition,
} satisfies Record<ComponentId, ComponentDefinition>
