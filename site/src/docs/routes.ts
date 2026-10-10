export const componentPathPrefix = '/components/'

export const routerBasename = import.meta.env.BASE_URL.replace(/\/$/, '')

export function componentPath(id: string) {
  return `${componentPathPrefix}${encodeURIComponent(id)}`
}

export function componentHref(id: string) {
  const path = componentPath(id)

  if (!routerBasename) {
    return path
  }

  return `${routerBasename}${path}`
}
