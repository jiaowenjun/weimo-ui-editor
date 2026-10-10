import {
  forwardRef,
  useState,
  type ComponentPropsWithoutRef,
  type CSSProperties,
  type MouseEvent,
} from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize from 'rehype-sanitize'
import remarkBreaks from 'remark-breaks'
import type { PluggableList } from 'unified'

import { cn } from 'weimo-ui-core/lib/utils'
import {
  normalizeCenteredQuoteSyntax,
  WEIMO_CENTERED_QUOTE_MARKER,
} from '../markdown/centered-quote'
import {
  getCachedMarkdownImageWidth,
  setMarkdownImageHalfIntrinsicWidth,
} from '../markdown/image-size'
import type {
  MarkdownImageRenderer,
  MarkdownImageRenderProps,
  MarkdownImageSrcResolver,
} from '../markdown/image-renderer'
import { markdownSanitizeSchema } from '../markdown/sanitize'

import 'weimo-ui-markdown/styles/markdown-content.css'

const SAFE_MARKDOWN_HREF_RE = /^(https?:|mailto:)/i
const markdownRemarkRehypeOptions = {
  handlers: {
    break(state, node) {
      const result = {
        type: 'element' as const,
        tagName: 'br',
        properties: {},
        children: [],
      }

      state.patch(node, result)
      return state.applyData(node, result)
    },
  },
} satisfies NonNullable<Parameters<typeof ReactMarkdown>[0]['remarkRehypeOptions']>

type MarkdownAstNode = {
  children?: MarkdownAstNode[]
  data?: {
    hName?: string
    hProperties?: Record<string, unknown>
  }
  ordered?: boolean
  type?: string
  value?: string
}

type TableCellAlign = ComponentPropsWithoutRef<'td'>['align']

function sanitizeMarkdownHref(href?: string): string | undefined {
  if (!href) return undefined

  const trimmed = href.trim()

  return SAFE_MARKDOWN_HREF_RE.test(trimmed) ? trimmed : undefined
}

function tableCellStyle(align: TableCellAlign): CSSProperties | undefined {
  return align ? { textAlign: align as CSSProperties['textAlign'] } : undefined
}

function trailingOrderedListImageRemarkPlugin() {
  return (tree: MarkdownAstNode) => {
    const children = tree.children

    if (!children || children.length < 2) return

    const orderedList = children.at(-2)
    const imageParagraph = children.at(-1)
    const image = imageParagraph?.children?.[0]

    if (
      orderedList?.type !== 'list' ||
      orderedList.ordered !== true ||
      imageParagraph?.type !== 'paragraph' ||
      imageParagraph.children?.length !== 1 ||
      image?.type !== 'image'
    ) {
      return
    }

    children.splice(-2, 2, {
      type: 'listImagePair',
      children: [orderedList, imageParagraph],
      data: {
        hName: 'div',
        hProperties: {
          className: ['weimo-card-markdown__list-image-pair'],
        },
      },
    })
  }
}

function MarkdownOrderedList({ children, start }: ComponentPropsWithoutRef<'ol'>) {
  return (
    <ol
      className="weimo-card-markdown__list weimo-card-markdown__list--ol"
      start={start}
    >
      {children}
    </ol>
  )
}

function stripCenteredQuoteMarker(paragraph: MarkdownAstNode): boolean {
  const children = paragraph.children

  if (!children) return false

  let didStrip = false
  const nextChildren: MarkdownAstNode[] = []

  for (const child of children) {
    if (!didStrip && child.type === 'text' && typeof child.value === 'string') {
      const markerIndex = child.value.indexOf(WEIMO_CENTERED_QUOTE_MARKER)

      if (markerIndex >= 0) {
        const nextValue = `${child.value.slice(0, markerIndex)}${child.value.slice(
          markerIndex + WEIMO_CENTERED_QUOTE_MARKER.length,
        )}`.replace(/^\s+/, '')

        didStrip = true

        if (nextValue) {
          nextChildren.push({ ...child, value: nextValue })
        }

        continue
      }
    }

    nextChildren.push(child)
  }

  if (didStrip) {
    paragraph.children = nextChildren
  }

  return didStrip
}

function visitMarkdownAst(node: MarkdownAstNode): void {
  if (node.type === 'blockquote' && node.children) {
    const firstParagraph = node.children.find((child) => child.type === 'paragraph')

    if (firstParagraph && stripCenteredQuoteMarker(firstParagraph)) {
      node.data = {
        ...node.data,
        hProperties: {
          ...node.data?.hProperties,
          'data-weimo-centered': 'true',
        },
      }

      if (firstParagraph.children?.length === 0) {
        node.children = node.children.filter((child) => child !== firstParagraph)
      }
    }
  }

  for (const child of node.children ?? []) {
    visitMarkdownAst(child)
  }
}

function markCenteredBlockquotes() {
  return (tree: MarkdownAstNode) => {
    visitMarkdownAst(tree)
  }
}

function unwrapInlineCodeNodes(node: MarkdownAstNode): void {
  for (const child of node.children ?? []) {
    if (child.type === 'inlineCode') {
      child.type = 'text'
    } else {
      unwrapInlineCodeNodes(child)
    }
  }
}

function unwrapInlineCodeRemarkPlugin() {
  return (tree: MarkdownAstNode) => {
    unwrapInlineCodeNodes(tree)
  }
}

const simpleRemarkPlugins: PluggableList = [
  unwrapInlineCodeRemarkPlugin,
  trailingOrderedListImageRemarkPlugin,
  markCenteredBlockquotes,
  remarkBreaks,
]
const simpleRehypePlugins: PluggableList = [rehypeRaw, [rehypeSanitize, markdownSanitizeSchema]]

const baseMarkdownComponents: Components = {
  a({ children, href, title }) {
    const safeHref = sanitizeMarkdownHref(href)

    if (!safeHref) {
      return <span className="weimo-card-markdown__link-text">{children}</span>
    }

    return (
      <a className="weimo-card-markdown__link" href={safeHref} title={title}>
        {children}
      </a>
    )
  },
  blockquote({ children, node }) {
    const centered =
      (node?.properties?.['data-weimo-centered'] ??
        node?.properties?.dataWeimoCentered) === 'true'

    return (
      <blockquote
        className={cn(
          'weimo-card-markdown__blockquote',
          centered && 'weimo-card-markdown__blockquote--centered',
        )}
      >
        {children}
      </blockquote>
    )
  },
  code({ children, className }) {
    return (
      <code className={cn('weimo-card-markdown__code', className)}>
        {children}
      </code>
    )
  },
  del({ children }) {
    return <del className="weimo-card-markdown__del">{children}</del>
  },
  em({ children }) {
    return <em className="weimo-card-markdown__em">{children}</em>
  },
  h1({ children }) {
    return (
      <h1 className="weimo-card-markdown__heading weimo-card-markdown__heading--h1">
        {children}
      </h1>
    )
  },
  h2({ children }) {
    return (
      <h2 className="weimo-card-markdown__heading weimo-card-markdown__heading--h2">
        {children}
      </h2>
    )
  },
  h3({ children }) {
    return (
      <h3 className="weimo-card-markdown__heading weimo-card-markdown__heading--h3">
        {children}
      </h3>
    )
  },
  h4({ children }) {
    return (
      <h4 className="weimo-card-markdown__heading weimo-card-markdown__heading--h4">
        {children}
      </h4>
    )
  },
  h5({ children }) {
    return (
      <h5 className="weimo-card-markdown__heading weimo-card-markdown__heading--h5">
        {children}
      </h5>
    )
  },
  h6({ children }) {
    return (
      <h6 className="weimo-card-markdown__heading weimo-card-markdown__heading--h6">
        {children}
      </h6>
    )
  },
  hr() {
    return <hr className="weimo-card-markdown__hr" />
  },
  img({ alt }) {
    const label = alt ? `[图片: ${alt}]` : '[图片]'

    return <span className="weimo-card-markdown__image-placeholder">{label}</span>
  },
  li({ children }) {
    return <li className="weimo-card-markdown__list-item">{children}</li>
  },
  ol: MarkdownOrderedList,
  p({ children }) {
    return <p className="weimo-card-markdown__p">{children}</p>
  },
  pre({ children }) {
    return <pre className="weimo-card-markdown__pre">{children}</pre>
  },
  strong({ children }) {
    return <strong className="weimo-card-markdown__strong">{children}</strong>
  },
  table({ children }) {
    return (
      <div
        className="weimo-card-markdown__scroll-block"
        data-markdown-table-scroll="true"
      >
        <table className="weimo-card-markdown__table">{children}</table>
      </div>
    )
  },
  tbody({ children }) {
    return <tbody className="weimo-card-markdown__table-body">{children}</tbody>
  },
  td({ children, align }) {
    return (
      <td className="weimo-card-markdown__table-cell" style={tableCellStyle(align)}>
        {children}
      </td>
    )
  },
  th({ children, align }) {
    return (
      <th
        className="weimo-card-markdown__table-cell weimo-card-markdown__table-cell--header"
        style={tableCellStyle(align)}
      >
        {children}
      </th>
    )
  },
  thead({ children }) {
    return <thead className="weimo-card-markdown__table-head">{children}</thead>
  },
  tr({ children }) {
    return <tr className="weimo-card-markdown__table-row">{children}</tr>
  },
  ul({ children, className }) {
    return (
      <ul
        className={cn(
          'weimo-card-markdown__list weimo-card-markdown__list--ul',
          className,
        )}
      >
        {children}
      </ul>
    )
  },
}

export type MdRenderSimpleImageRenderProps = MarkdownImageRenderProps
export type MdRenderSimpleImageRenderer = MarkdownImageRenderer
export type MdRenderSimpleImageSrcResolver = MarkdownImageSrcResolver

type MarkdownImageProps = Pick<ComponentPropsWithoutRef<'img'>, 'alt' | 'title'> & {
  renderImage?: MdRenderSimpleImageRenderer
  resolvedSrc: string
}

function MarkdownImage({ alt, renderImage, resolvedSrc, title }: MarkdownImageProps) {
  const [width, setWidth] = useState<string | null>(
    () => getCachedMarkdownImageWidth(resolvedSrc) ?? null,
  )

  const imageProps: MdRenderSimpleImageRenderProps = {
    alt: alt ?? '',
    className: 'weimo-card-markdown__image',
    onError: () => setWidth('auto'),
    onLoad: (event) => {
      const nextWidth = setMarkdownImageHalfIntrinsicWidth(
        event.currentTarget,
        resolvedSrc,
      )
      if (nextWidth) setWidth(nextWidth)
    },
    src: resolvedSrc,
    style: {
      visibility: width ? 'visible' : 'hidden',
      width: width ?? undefined,
    },
    title,
  }

  return renderImage ? renderImage(imageProps) : <img {...imageProps} />
}

export type MdRenderSimpleProps = ComponentPropsWithoutRef<'div'> & {
  content: string
  renderImage?: MdRenderSimpleImageRenderer
  resolveImageSrc?: MdRenderSimpleImageSrcResolver
}

export const MdRenderSimple = forwardRef<HTMLDivElement, MdRenderSimpleProps>(function MdRenderSimple(
  {
    className,
    content,
    onMouseDown,
    renderImage,
    resolveImageSrc,
    ...props
  },
  ref,
) {
  function handleMouseDown(event: MouseEvent<HTMLDivElement>) {
    if (event.detail > 1) {
      event.preventDefault()
    }

    onMouseDown?.(event)
  }

  const markdownComponents: Components = {
    ...baseMarkdownComponents,
    img({ alt, src, title }) {
      const resolvedSrc = src ? resolveImageSrc?.(src) : undefined

      if (!resolvedSrc) {
        const label = alt ? `[图片: ${alt}]` : '[图片]'

        return <span className="weimo-card-markdown__image-placeholder">{label}</span>
      }

      return (
        <MarkdownImage
          alt={alt ?? ''}
          key={resolvedSrc}
          renderImage={renderImage}
          resolvedSrc={resolvedSrc}
          title={title}
        />
      )
    },
  }

  return (
    <div
      ref={ref}
      className={cn('weimo-card-markdown weimo-markdown-content', className)}
      onMouseDown={handleMouseDown}
      {...props}
    >
      <ReactMarkdown
        components={markdownComponents}
        rehypePlugins={simpleRehypePlugins}
        remarkRehypeOptions={markdownRemarkRehypeOptions}
        remarkPlugins={simpleRemarkPlugins}
      >
        {normalizeCenteredQuoteSyntax(content)}
      </ReactMarkdown>
    </div>
  )
})

MdRenderSimple.displayName = 'MdRenderSimple'
