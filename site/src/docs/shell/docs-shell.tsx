import { Outlet, useMatch } from 'react-router'

import { MiniSiteTemplate } from 'weimo-ui-template/components/mini-site-template'
import { componentDocs } from '../catalog/component-docs'
import { type DocsOutletContext } from './docs-outlet-context'

export function DocsShell() {
  const componentMatch = useMatch('/components/:componentId')
  const activeComponentId = componentMatch?.params.componentId
  const selected = activeComponentId
    ? componentDocs.find((doc) => doc.id === activeComponentId)
    : undefined
  const outletContext: DocsOutletContext = { docs: componentDocs }

  return (
    <MiniSiteTemplate
      pageTitle={selected?.name}
      siteName="weimo-ui-editor"
    >
      <Outlet context={outletContext} />
    </MiniSiteTemplate>
  )
}
