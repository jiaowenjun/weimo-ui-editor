import { Outlet, useMatch, useNavigate } from 'react-router'

import {
  SiteTemplate,
  type SiteNavigationGroup,
  type SiteNavigationItem,
} from 'weimo-ui-template/components/site-template'
import {
  componentDocPackages,
  componentDocs,
} from '../catalog/component-docs'
import { componentHref, componentPath } from '../routes'
import { type DocsOutletContext } from './docs-outlet-context'

const navigationGroups: SiteNavigationGroup[] = componentDocPackages.map(
  (docPackage) => ({
    id: docPackage.id,
    title: docPackage.title,
    items: docPackage.items.map((doc) => ({
      id: doc.id,
      href: componentHref(doc.id),
      label: doc.name,
    })),
  }),
)

export function DocsShell() {
  const navigate = useNavigate()
  const componentMatch = useMatch('/components/:componentId')
  const activeComponentId = componentMatch?.params.componentId
  const selected = activeComponentId
    ? componentDocs.find((doc) => doc.id === activeComponentId)
    : undefined
  const outletContext: DocsOutletContext = { docs: componentDocs }
  const openComponent = (item: SiteNavigationItem) => {
    navigate(componentPath(item.id))
  }

  return (
    <SiteTemplate
      activeItemId={activeComponentId}
      navigationGroups={navigationGroups}
      onNavigate={openComponent}
      pageTitle={selected?.name}
      siteName="weimo-ui-markdown"
    >
      <Outlet context={outletContext} />
    </SiteTemplate>
  )
}
