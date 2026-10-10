import { useEffect, useState } from 'react'
import { Menu, Monitor, Moon, Sun, X } from 'lucide-react'
import { Outlet, useMatch, useNavigate } from 'react-router'

import { TopBar } from 'weimo-ui-core/components/top-bar'
import { FrostedLabel } from 'weimo-ui-core/components/frosted-label'
import { FrostedIconButton } from 'weimo-ui-core/components/frosted-icon-button'
import { SideBar } from 'weimo-ui-core/components/sidebar'
import {
  componentDocPackages,
  componentDocs,
  type ComponentDocPackage,
} from '../catalog/component-docs'
import { type DocsOutletContext } from './docs-outlet-context'
import { componentHref, componentPath } from '../routes'

type Theme = 'light' | 'dark' | 'system'

type DocsSidebarItem = {
  active?: boolean
  href: string
  label: string
  onSelect: () => void
}

type DocsSidebarGroup = {
  items: DocsSidebarItem[]
  title: string
}

function buildSidebarGroups(options: {
  activeComponentId?: string
  docPackages: ComponentDocPackage[]
  onComponentSelect: (id: string) => void
}): DocsSidebarGroup[] {
  return options.docPackages.map((docPackage) => ({
    title: docPackage.title,
    items: docPackage.items.map((doc) => ({
      active: options.activeComponentId === doc.id,
      href: componentHref(doc.id),
      label: doc.name,
      onSelect: () => options.onComponentSelect(doc.id),
    })),
  }))
}

function DocsSidebarContent({ groups }: { groups: DocsSidebarGroup[] }) {
  return (
    <div className="docs-sidebar-nav" data-base-ui-swipe-ignore>
      <div className="docs-sidebar-nav__top">
        <strong>weimo-ui-markdown</strong>
      </div>

      {groups.map((group) => (
        <nav className="docs-sidebar-nav__group" key={group.title}>
          <p>{group.title}</p>
          {group.items.map((item) => (
            <a
              className={item.active ? 'active' : undefined}
              href={item.href}
              key={`${group.title}-${item.label}`}
              onClick={(event) => {
                event.preventDefault()
                item.onSelect()
              }}
            >
              <span>{item.label}</span>
            </a>
          ))}
        </nav>
      ))}
    </div>
  )
}

function nextTheme(current: Theme): Theme {
  switch (current) {
    case 'light':
      return 'dark'
    case 'dark':
      return 'system'
    case 'system':
      return 'light'
  }
}

export function DocsShell() {
  const [theme, setTheme] = useState<Theme>('system')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const navigate = useNavigate()
  const componentMatch = useMatch('/components/:componentId')
  const activeComponentId = componentMatch?.params.componentId
  const selected = activeComponentId
    ? componentDocs.find((doc) => doc.id === activeComponentId)
    : undefined
  const tokenPreview = selected
    ? ['text-tokens', 'background-tokens', 'border-tokens'].includes(selected.id)
    : false

  useEffect(() => {
    if (theme !== 'system') {
      document.documentElement.classList.toggle('dark', theme === 'dark')
      return
    }

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const syncSystemTheme = () => {
      document.documentElement.classList.toggle('dark', mediaQuery.matches)
    }

    syncSystemTheme()
    mediaQuery.addEventListener('change', syncSystemTheme)

    return () => mediaQuery.removeEventListener('change', syncSystemTheme)
  }, [theme])

  useEffect(() => {
    document.title = selected
      ? `${selected.name} - weimo-ui-markdown`
      : 'weimo-ui-markdown'
  }, [selected])

  function openComponent(id: string) {
    navigate(componentPath(id))
    setSidebarOpen(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const sidebarGroups = buildSidebarGroups({
    activeComponentId,
    docPackages: componentDocPackages,
    onComponentSelect: openComponent,
  })
  const topBarLeftSlot = (
    <div className="docs-top-bar__slot">
      <FrostedIconButton
        aria-label="打开侧边栏"
        className="docs-top-bar__sidebar-trigger"
        onClick={() => setSidebarOpen(true)}
      >
        <Menu />
      </FrostedIconButton>
      {selected ? (
        <FrostedLabel className="docs-top-bar__title" key={selected.name} size="lg">
          {selected.name}
        </FrostedLabel>
      ) : null}
    </div>
  )
  const topBarRightSlot = (
    <div className="docs-top-bar__slot">
      <FrostedIconButton
        aria-label={
          theme === 'light'
            ? '切换到深色主题'
            : theme === 'dark'
              ? '切换到跟随系统主题'
              : '切换到浅色主题'
        }
        onClick={() => setTheme((current) => nextTheme(current))}
      >
        {theme === 'system' ? <Monitor /> : theme === 'light' ? <Sun /> : <Moon />}
      </FrostedIconButton>
    </div>
  )
  const closeSidebar = () => setSidebarOpen(false)
  const outletContext: DocsOutletContext = { docs: componentDocs }

  return (
    <>
      <SideBar
        drawerAction={
          <FrostedIconButton aria-label="关闭侧边栏" onClick={closeSidebar}>
            <X />
          </FrostedIconButton>
        }
        open={sidebarOpen}
        onClose={closeSidebar}
      >
        <DocsSidebarContent groups={sidebarGroups} />
      </SideBar>
      <TopBar leftSlot={topBarLeftSlot} rightSlot={topBarRightSlot} />

      <main className="app-shell">
        <div className="app-shell__layout">
          <div aria-hidden="true" className="app-shell__sidebar-space" />
          <div
            className={
              tokenPreview
                ? 'app-shell__content app-shell__content--token-grid'
                : 'app-shell__content'
            }
            data-component-id={selected?.id}
          >
            <Outlet context={outletContext} />
          </div>
        </div>
      </main>
    </>
  )
}
