import type { ComponentDoc } from './component-docs'

function normalizeSearchValue(value: string) {
  return value.trim().toLowerCase()
}

function compactSearchValue(value: string) {
  return normalizeSearchValue(value).replace(/[\s._/-]+/gu, '')
}

export function searchComponentDocs(
  docs: readonly ComponentDoc[],
  query: string,
) {
  const normalizedQuery = normalizeSearchValue(query)

  if (!normalizedQuery) {
    return [...docs]
  }

  const compactQuery = compactSearchValue(query)

  return docs.filter((doc) => {
    const values = [
      doc.name,
      doc.exportName,
      doc.summary,
      doc.id,
      doc.registryName,
      doc.packageExport,
      ...doc.searchAliases,
    ]

    return values.some((value) => {
      if (!value) return false

      return (
        normalizeSearchValue(value).includes(normalizedQuery) ||
        (compactQuery.length > 0 && compactSearchValue(value).includes(compactQuery))
      )
    })
  })
}
