import { wdfCardDefinition } from './packages/weimo-ui-editor/wdf-card'
import type { ComponentId } from './manifest'
import type { ComponentDefinition } from './types'

export const componentDefinitionsById = {
  'wdf-card': wdfCardDefinition,
} satisfies Record<ComponentId, ComponentDefinition>
