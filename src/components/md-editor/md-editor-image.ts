import { mergeAttributes, Node } from '@tiptap/core'
import type {
  MarkdownParseHelpers,
  MarkdownParseResult,
  MarkdownToken,
} from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'

import {
  getCachedMarkdownImageWidth,
  setMarkdownImageHalfIntrinsicWidth,
} from '../markdown/image-size'
import type {
  MarkdownImageRenderer,
  MarkdownImageSrcResolver,
} from '../markdown/image-renderer'
import { MdEditorImageView } from './md-editor-image-view'

export type MdEditorImageSrcResolver = MarkdownImageSrcResolver

export type MarkdownImageOptions = {
  renderImage?: MarkdownImageRenderer
  resolveImageSrc?: MarkdownImageSrcResolver
}

type MarkdownImageNode = {
  attrs?: {
    alt?: string | null
    src?: string | null
    title?: string | null
  }
}

function normalizeImageAttr(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value : null
}

function escapeMarkdownImageAlt(alt: string) {
  return alt
    .replace(/[\r\n]+/g, ' ')
    .replaceAll('[', '\\[')
    .replaceAll(']', '\\]')
}

function escapeMarkdownImageTitle(title: string) {
  return title.replaceAll('\\', '\\\\').replaceAll('"', '\\"')
}

function resolveImagePlaceholderLabel(alt: unknown) {
  const text = normalizeImageAttr(alt)

  return text ? `[图片: ${text}]` : '[图片]'
}

export const MarkdownImagePlaceholder = Node.create<MarkdownImageOptions>({
  name: 'image',
  group: 'block',
  atom: true,

  addOptions() {
    return {
      renderImage: undefined,
      resolveImageSrc: undefined,
    }
  },

  addAttributes() {
    return {
      alt: {
        default: null,
        parseHTML: (element) => normalizeImageAttr(element.getAttribute('alt')),
      },
      src: {
        default: null,
        parseHTML: (element) => normalizeImageAttr(element.getAttribute('src')),
      },
      title: {
        default: null,
        parseHTML: (element) => normalizeImageAttr(element.getAttribute('title')),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'img[src]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'image-placeholder',
        class: 'md-editor__image-placeholder',
      }),
    ]
  },

  markdownTokenName: 'image',

  parseMarkdown: (
    token: MarkdownToken,
    helpers: MarkdownParseHelpers,
  ): MarkdownParseResult => {
    if (token.type !== 'image') {
      return []
    }

    return helpers.createNode('image', {
      alt: normalizeImageAttr(token.text),
      src: normalizeImageAttr(token.href),
      title: normalizeImageAttr(token.title),
    })
  },

  renderMarkdown: (node: MarkdownImageNode) => {
    const src = normalizeImageAttr(node.attrs?.src) ?? ''
    const alt = escapeMarkdownImageAlt(normalizeImageAttr(node.attrs?.alt) ?? '')
    const title = normalizeImageAttr(node.attrs?.title)
    const titleSuffix = title ? ` "${escapeMarkdownImageTitle(title)}"` : ''

    return `![${alt}](${src}${titleSuffix})`
  },

  addNodeView() {
    if (this.options.renderImage) {
      return ReactNodeViewRenderer(MdEditorImageView, {
        as: 'figure',
        attrs: { 'data-type': 'image' },
        className: 'md-editor__image-frame',
      })
    }

    return ({ node }) => {
      const src = normalizeImageAttr(node.attrs.src)
      const resolvedSrc = src ? this.options.resolveImageSrc?.(src) : undefined

      if (resolvedSrc) {
        const imageSrc = resolvedSrc
        const frame = document.createElement('figure')
        const image = document.createElement('img')
        const alt = normalizeImageAttr(node.attrs.alt) ?? ''
        const title = normalizeImageAttr(node.attrs.title)
        const cachedWidth = getCachedMarkdownImageWidth(imageSrc)

        function handleImageLoad() {
          const width = setMarkdownImageHalfIntrinsicWidth(image, imageSrc)
          if (width) image.style.visibility = 'visible'
        }

        function handleImageError() {
          image.style.visibility = 'visible'
        }

        frame.className = 'md-editor__image-frame'
        frame.dataset.type = 'image'
        image.className = 'md-editor__image'
        image.alt = alt
        if (cachedWidth) image.style.width = cachedWidth
        image.style.visibility = cachedWidth ? 'visible' : 'hidden'
        image.addEventListener('load', handleImageLoad, { once: true })
        image.addEventListener('error', handleImageError, { once: true })

        if (title) {
          image.title = title
        }

        image.src = imageSrc
        if (image.complete && image.naturalWidth > 0) {
          image.removeEventListener('load', handleImageLoad)
          handleImageLoad()
        }
        frame.append(image)

        return {
          dom: frame,
          destroy() {
            image.removeEventListener('load', handleImageLoad)
            image.removeEventListener('error', handleImageError)
          },
        }
      }

      const wrapper = document.createElement('div')

      wrapper.className = 'md-editor__image-placeholder'
      wrapper.dataset.type = 'image-placeholder'
      wrapper.textContent = resolveImagePlaceholderLabel(node.attrs.alt)

      if (src) {
        wrapper.title = src
      }

      return {
        dom: wrapper,
      }
    }
  },
})
