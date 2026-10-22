import { richEditorDefinition } from './packages/weimo-ui-editor/rich-editor'
import { mobileWdfViewDefinition } from './packages/weimo-ui-editor/mobile-wdf-view'
import { mobileWdfViewUnboundedDefinition } from './packages/weimo-ui-editor/mobile-wdf-view-unbounded'
import { wdfRenderDefinition } from './packages/weimo-ui-editor/wdf-render'
import { wdfViewDefinition } from './packages/weimo-ui-editor/wdf-view'
import type { ComponentId } from './manifest'
import type { ComponentDefinition } from './types'

export const componentDefinitionsById = {
  'wdf-view': wdfViewDefinition,
  'wdf-render': wdfRenderDefinition,
  'rich-editor': richEditorDefinition,
  'mobile-wdf-view': mobileWdfViewDefinition,
  'mobile-wdf-view-unbounded': mobileWdfViewUnboundedDefinition,
} satisfies Record<ComponentId, ComponentDefinition>
