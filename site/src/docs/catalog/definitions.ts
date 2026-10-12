import { richEditorDefinition } from './packages/weimo-ui-markdown/rich-editor'
import { wdfRenderDefinition } from './packages/weimo-ui-markdown/wdf-render'
import { wdfViewDefinition } from './packages/weimo-ui-markdown/wdf-view'
import type { ComponentId } from './manifest'
import type { ComponentDefinition } from './types'

export const componentDefinitionsById = {
  'wdf-view': wdfViewDefinition,
  'wdf-render': wdfRenderDefinition,
  'rich-editor': richEditorDefinition,
} satisfies Record<ComponentId, ComponentDefinition>
