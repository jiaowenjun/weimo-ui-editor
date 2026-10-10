import type { ReactNode } from 'react'

export type PackageComponent = {
  id: string
  name: string
  exportName?: string
  registryName: string
  packageExport: string
}

export type PackagePage = PackageComponent & {
  components?: readonly PackageComponent[]
}

export type PackageCatalog = {
  id: string
  title: string
  pages: readonly PackagePage[]
}

export type ComponentPreviewContext = {
  onOpenSidebar: () => void
}

export type ComponentDefinition = {
  id: string
  searchAliases?: readonly string[]
  summary?: string
  status: 'Ready' | 'Preview'
  frame?: 'stage' | 'plain'
  preview: (context: ComponentPreviewContext) => ReactNode
}
