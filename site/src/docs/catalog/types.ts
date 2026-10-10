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

export type ComponentDefinition = {
  id: string
  summary?: string
  status: 'Ready' | 'Preview'
  frame?: 'stage' | 'plain'
  preview: () => ReactNode
}
