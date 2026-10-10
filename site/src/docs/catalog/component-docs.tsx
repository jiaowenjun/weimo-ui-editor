import { componentDefinitionsById } from './definitions'
import {
  componentPackages,
  componentManifest,
  type ComponentId,
  type ComponentManifestItem,
  type ComponentPackageName,
} from './manifest'
import type { ComponentDefinition as CatalogComponentDefinition } from './types'

export type ComponentDefinition = CatalogComponentDefinition

export type ComponentDoc = {
  id: ComponentId
  name: string
  exportName: string
  packageName: ComponentPackageName
  registryName: string
  packageExport: string
  summary?: string
  status: 'Ready' | 'Preview'
  frame?: 'stage' | 'plain'
  preview: ComponentDefinition['preview']
}

export type ComponentDocPackage = {
  id: ComponentPackageName
  title: string
  items: ComponentDoc[]
}

function isDocsPage(
  item: ComponentManifestItem,
): item is ComponentManifestItem & { id: ComponentId; docs: true } {
  return item.docs
}

export const componentDocs: ComponentDoc[] = componentManifest
  .filter(isDocsPage)
  .map((item) => {
    const definition: ComponentDefinition = componentDefinitionsById[item.id]

    if (!definition || definition.id !== item.id) {
      throw new Error(`Missing component definition for ${item.id}`)
    }

    return {
      id: item.id,
      name: item.name,
      exportName: ('exportName' in item ? item.exportName : undefined) ?? item.name,
      packageName: item.packageName,
      registryName: item.registryName,
      packageExport: item.packageExport,
      summary: definition.summary,
      status: definition.status,
      frame: definition.frame,
      preview: definition.preview,
    }
  })

export const componentDocPackages: ComponentDocPackage[] = componentPackages
  .map((packageItem) => ({
    id: packageItem.id,
    title: packageItem.title,
    items: componentDocs.filter((doc) => doc.packageName === packageItem.id),
  }))
  .filter((packageItem) => packageItem.items.length > 0)
