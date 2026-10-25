import { Outlet, useMatch } from 'react-router'
import { ChevronLeft } from 'lucide-react'

import { FrostedIconButton } from 'weimo-ui-core/components/frosted-icon-button'
import { MiniSiteTemplate } from 'weimo-ui-template/components/mini-site-template'
import { componentDocs } from '../catalog/component-docs'
import { DebugOutlineToggle } from './debug-outline-toggle'
import { type DocsOutletContext } from './docs-outlet-context'

const homePageUrl = 'https://jiaowenjun.github.io'

export function DocsShell() {
  const componentMatch = useMatch('/components/:componentId')
  const activeComponentId = componentMatch?.params.componentId
  const selected = activeComponentId
    ? componentDocs.find((doc) => doc.id === activeComponentId)
    : undefined
  const outletContext: DocsOutletContext = { docs: componentDocs }

  return (
    <MiniSiteTemplate
      headline="点开即写，收起即读"
      pageTitle={selected?.name}
      siteName="weimo-ui-editor"
      subheadline="一份 WDF 数据同时驱动阅读与编辑：窄屏起飞为对话框，宽屏原地切换。"
      topBarLeading={
        <FrostedIconButton
          aria-label="返回主页"
          onClick={() => window.location.assign(homePageUrl)}
        >
          <ChevronLeft />
        </FrostedIconButton>
      }
    >
      <Outlet context={outletContext} />
      <DebugOutlineToggle />
    </MiniSiteTemplate>
  )
}
