import { markdownEditDefinition } from './packages/weimo-ui-markdown/markdown-edit'
import { markdownRenderDefinition } from './packages/weimo-ui-markdown/markdown-render'
import type { ComponentId } from './manifest'
import type { ComponentDefinition } from './types'

export const componentDefinitionsById = {
  'markdown-render': markdownRenderDefinition,
  'markdown-edit': markdownEditDefinition,
} satisfies Record<ComponentId, ComponentDefinition>
