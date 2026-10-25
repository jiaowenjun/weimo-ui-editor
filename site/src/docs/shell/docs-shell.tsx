import { Outlet, useMatch } from 'react-router'

import { MiniSiteTemplate } from 'weimo-ui-template/components/mini-site-template'
import { componentDocs } from '../catalog/component-docs'
import { DebugOutlineToggle } from './debug-outline-toggle'
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
      headline="点开即写,收起即读"
      pageTitle={selected?.name}
      siteName="weimo-ui-editor"
      subheadline="一份 WDF 数据同时驱动阅读与编辑:窄屏自动起飞为对话框,宽屏原地切换,保存等待与失败重试全部内置。"
    >
      <Outlet context={outletContext} />
      <DebugOutlineToggle />
    </MiniSiteTemplate>
  )
}
