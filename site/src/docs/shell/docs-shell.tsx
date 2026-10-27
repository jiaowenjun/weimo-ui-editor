import { Outlet, useMatch } from 'react-router'
import { ChevronLeft } from 'lucide-react'
import { useState } from 'react'

import { FrostedIconButton } from 'weimo-ui-core/components/frosted-icon-button'
import { MiniSiteTemplate } from 'weimo-ui-template/components/mini-site-template'
import { componentDocs } from '../catalog/component-docs'
import { DebugOutlineToggle } from './debug-outline-toggle'
import {
  type DocsOutletContext,
  type DocsTopBarAction,
} from './docs-outlet-context'

const homePageUrl = 'https://jiaowenjun.github.io'
const repoUrl = 'https://github.com/jiaowenjun/weimo-ui-editor'

/** lucide-react 1.x 已移除品牌图标,GitHub 标记内联为 SVG */
function GitHubIcon() {
  return (
    <svg
      fill="currentColor"
      height="24"
      viewBox="0 0 24 24"
      width="24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M12 .297c-6.63 0-12 5.373-12 12c0 5.303 3.438 9.8 8.205 11.385c.6.113.82-.258.82-.577c0-.285-.01-1.04-.015-2.04c-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729c1.205.084 1.838 1.236 1.838 1.236c1.07 1.835 2.809 1.305 3.495.998c.108-.776.417-1.305.76-1.605c-2.665-.3-5.466-1.332-5.466-5.93c0-1.31.465-2.38 1.235-3.22c-.135-.303-.54-1.523.105-3.176c0 0 1.005-.322 3.3 1.23c.96-.267 1.98-.399 3-.405c1.02.006 2.04.138 3 .405c2.28-1.552 3.285-1.23 3.285-1.23c.645 1.653.24 2.873.12 3.176c.765.84 1.23 1.91 1.23 3.22c0 4.61-2.805 5.625-5.475 5.92c.42.36.81 1.096.81 2.22c0 1.606-.015 2.896-.015 3.286c0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  )
}

export function DocsShell() {
  const componentMatch = useMatch('/components/:componentId')
  const activeComponentId = componentMatch?.params.componentId
  const selected = activeComponentId
    ? componentDocs.find((doc) => doc.id === activeComponentId)
    : undefined
  const [topBarAction, setTopBarAction] = useState<DocsTopBarAction | null>(null)
  const outletContext: DocsOutletContext = {
    docs: componentDocs,
    setTopBarAction,
  }

  return (
    <MiniSiteTemplate
      headline="点开即写，收起即读"
      pageTitle={selected?.name}
      showThemeToggle={false}
      siteName="weimo-ui-editor"
      subheadline="把富文本编辑器做进一张卡片"
      topBarActions={
        <>
          {topBarAction ? (
            <FrostedIconButton
              aria-label={topBarAction.ariaLabel}
              onClick={topBarAction.onClick}
            >
              {topBarAction.icon}
            </FrostedIconButton>
          ) : null}
          <FrostedIconButton
            aria-label="GitHub 仓库"
            onClick={() => window.open(repoUrl, '_blank', 'noopener,noreferrer')}
          >
            <GitHubIcon />
          </FrostedIconButton>
        </>
      }
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
