import { richEditorDefinition } from './packages/weimo-ui-editor/rich-editor'
import { newWdfViewDefinition } from './packages/weimo-ui-editor/new-wdf-view'
import { mobileWdfViewDefinition } from './packages/weimo-ui-editor/mobile-wdf-view'
import { wdfRenderDefinition } from './packages/weimo-ui-editor/wdf-render'
import { wdfViewDefinition } from './packages/weimo-ui-editor/wdf-view'
import type { ComponentId } from './manifest'
import type { ComponentDefinition } from './types'

export const componentDefinitionsById = {
  'wdf-view': wdfViewDefinition,
  'wdf-render': wdfRenderDefinition,
  'rich-editor': richEditorDefinition,
  'new-wdf-view': newWdfViewDefinition,
  'mobile-wdf-view': mobileWdfViewDefinition,
} satisfies Record<ComponentId, ComponentDefinition>
