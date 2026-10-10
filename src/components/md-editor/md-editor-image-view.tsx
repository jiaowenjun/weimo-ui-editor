import { useState } from 'react'
import { NodeViewWrapper, type ReactNodeViewProps } from '@tiptap/react'

import {
  getCachedMarkdownImageWidth,
  setMarkdownImageHalfIntrinsicWidth,
} from '../markdown/image-size'
import type { MarkdownImageRenderProps } from '../markdown/image-renderer'
import type { MarkdownImageOptions } from './md-editor-image'

type ImageWidthState = {
  src: string | null
  width: string | null
}

function normalizeImageAttr(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value : null
}

function resolveImagePlaceholderLabel(alt: unknown) {
  const text = normalizeImageAttr(alt)

  return text ? `[图片: ${text}]` : '[图片]'
}

export function MdEditorImageView({ extension, node }: ReactNodeViewProps) {
  const options = extension.options as MarkdownImageOptions
  const src = normalizeImageAttr(node.attrs.src)
  const resolvedSrc = src ? options.resolveImageSrc?.(src) : undefined
  const cachedWidth = resolvedSrc
    ? getCachedMarkdownImageWidth(resolvedSrc) ?? null
    : null
  const [imageWidthState, setImageWidthState] = useState<ImageWidthState>(() => ({
    src: resolvedSrc ?? null,
    width: cachedWidth,
  }))

  if (!resolvedSrc || !options.renderImage) {
    return (
      <NodeViewWrapper
        className="md-editor__image-placeholder"
        contentEditable={false}
        data-type="image-placeholder"
        title={src ?? undefined}
      >
        {resolveImagePlaceholderLabel(node.attrs.alt)}
      </NodeViewWrapper>
    )
  }

  const width = imageWidthState.src === resolvedSrc
    ? imageWidthState.width
    : cachedWidth
  const imageProps: MarkdownImageRenderProps = {
    alt: normalizeImageAttr(node.attrs.alt) ?? '',
    className: 'md-editor__image',
    onError: () => {
      setImageWidthState({ src: resolvedSrc, width: 'auto' })
    },
    onLoad: (event) => {
      const nextWidth = setMarkdownImageHalfIntrinsicWidth(
        event.currentTarget,
        resolvedSrc,
      )

      if (nextWidth) {
        setImageWidthState({ src: resolvedSrc, width: nextWidth })
      }
    },
    src: resolvedSrc,
    style: {
      visibility: width ? 'visible' : 'hidden',
      width: width ?? undefined,
    },
    title: normalizeImageAttr(node.attrs.title) ?? undefined,
  }

  return (
    <NodeViewWrapper
      contentEditable={false}
    >
      {options.renderImage(imageProps)}
    </NodeViewWrapper>
  )
}
