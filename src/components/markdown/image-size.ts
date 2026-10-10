type MarkdownImageSizeTarget = {
  naturalWidth: number
  style: {
    width: string
  }
}

const MARKDOWN_IMAGE_MAX_WIDTH = 300
const MARKDOWN_IMAGE_WIDTH_CACHE_LIMIT = 256
const markdownImageWidthCache = new Map<string, string>()

function rememberMarkdownImageWidth(src: string, width: string): void {
  markdownImageWidthCache.delete(src)
  markdownImageWidthCache.set(src, width)

  if (markdownImageWidthCache.size <= MARKDOWN_IMAGE_WIDTH_CACHE_LIMIT) return

  const oldestSrc = markdownImageWidthCache.keys().next().value
  if (oldestSrc !== undefined) markdownImageWidthCache.delete(oldestSrc)
}

export function getCachedMarkdownImageWidth(src: string): string | undefined {
  const width = markdownImageWidthCache.get(src)
  if (width === undefined) return undefined

  rememberMarkdownImageWidth(src, width)
  return width
}

export function setMarkdownImageHalfIntrinsicWidth(
  image: MarkdownImageSizeTarget,
  src?: string,
): string | undefined {
  if (!Number.isFinite(image.naturalWidth) || image.naturalWidth <= 0) return undefined

  const width = `${Math.min(image.naturalWidth / 2, MARKDOWN_IMAGE_MAX_WIDTH)}px`
  image.style.width = width
  if (src) rememberMarkdownImageWidth(src, width)
  return width
}
