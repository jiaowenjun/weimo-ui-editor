import type { ComponentPropsWithoutRef, ReactNode } from 'react'

export type MarkdownImageSrcResolver = (
  src: string,
) => string | null | undefined

export type MarkdownImageRenderProps =
  Omit<ComponentPropsWithoutRef<'img'>, 'src'> & {
    src: string
  }

export type MarkdownImageRenderer = (
  props: MarkdownImageRenderProps,
) => ReactNode
