import { markdownCatalog } from './packages/weimo-ui-markdown/manifest'

const packageCatalogs = [markdownCatalog] as const

export type ComponentPackageName = (typeof packageCatalogs)[number]['id']
export type ComponentId = (typeof packageCatalogs)[number]['pages'][number]['id']

export type ComponentManifestItem = {
  id: string
  name: string
  exportName?: string
  registryName: string
  packageExport: string
  packageName: ComponentPackageName
  page: ComponentId
  docs: boolean
  registry: true
}

export const componentPackages = packageCatalogs.map(({ id, title }) => ({ id, title }))

export const componentManifest: ComponentManifestItem[] = packageCatalogs.flatMap(
  (packageCatalog) => packageCatalog.pages.map((page) => ({
    id: page.id,
    name: page.name,
    exportName: page.exportName,
    registryName: page.registryName,
    packageExport: page.packageExport,
    packageName: packageCatalog.id,
    page: page.id,
    docs: true,
    registry: true as const,
  })),
)
