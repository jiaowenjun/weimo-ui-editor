import { markdownEditSimpleDefinition } from './packages/weimo-ui-markdown/markdown-edit-simple'
import { markdownRenderSimpleDefinition } from './packages/weimo-ui-markdown/markdown-render-simple'
import type { ComponentId } from './manifest'
import type { ComponentDefinition } from './types'

export const componentDefinitionsById = {
  'markdown-render-simple': markdownRenderSimpleDefinition,
  'markdown-edit-simple': markdownEditSimpleDefinition,
} satisfies Record<ComponentId, ComponentDefinition>
