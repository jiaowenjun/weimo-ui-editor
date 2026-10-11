import { richEditorDefinition } from './packages/weimo-ui-markdown/rich-editor'
import { markdownRenderDefinition } from './packages/weimo-ui-markdown/markdown-render'
import type { ComponentId } from './manifest'
import type { ComponentDefinition } from './types'

export const componentDefinitionsById = {
  'markdown-render': markdownRenderDefinition,
  'rich-editor': richEditorDefinition,
} satisfies Record<ComponentId, ComponentDefinition>
