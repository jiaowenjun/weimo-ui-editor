import { useOutletContext } from 'react-router'

import { type ComponentDoc } from '../catalog/component-docs'

export type DocsOutletContext = {
  docs: ComponentDoc[]
}

export function useDocsOutletContext() {
  return useOutletContext<DocsOutletContext>()
}
