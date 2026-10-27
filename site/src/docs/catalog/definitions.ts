import { cardComposerDefinition } from './packages/weimo-ui-editor/card-composer'
import { wdfCardDefinition } from './packages/weimo-ui-editor/wdf-card'
import type { ComponentId } from './manifest'
import type { ComponentDefinition } from './types'

export const componentDefinitionsById = {
  'wdf-card': wdfCardDefinition,
  'card-composer': cardComposerDefinition,
} satisfies Record<ComponentId, ComponentDefinition>
