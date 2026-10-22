import { richEditorDefinition } from './packages/weimo-ui-editor/rich-editor'
import { richEditorCardDefinition } from './packages/weimo-ui-editor/rich-editor-card'
import { mobileWdfViewDefinition } from './packages/weimo-ui-editor/mobile-wdf-view'
import { wdfRenderDefinition } from './packages/weimo-ui-editor/wdf-render'
import { wdfViewDefinition } from './packages/weimo-ui-editor/wdf-view'
import type { ComponentId } from './manifest'
import type { ComponentDefinition } from './types'

export const componentDefinitionsById = {
  'wdf-view': wdfViewDefinition,
  'wdf-render': wdfRenderDefinition,
  'rich-editor': richEditorDefinition,
  'rich-editor-card': richEditorCardDefinition,
  'mobile-wdf-view': mobileWdfViewDefinition,
} satisfies Record<ComponentId, ComponentDefinition>
