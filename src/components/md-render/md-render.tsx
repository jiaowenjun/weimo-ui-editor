import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type MouseEvent,
} from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize from 'rehype-sanitize'
import remarkBreaks from 'remark-breaks'
import type { PluggableList } from 'unified'

import { cn } from 'weimo-ui-core/lib/utils'
import { markdownSanitizeSchema } from '../markdown/sanitize'

import 'weimo-ui-markdown/styles/markdown-content.css'

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
    hProperties?: Record<string, unknown>
  }
  type?: string
  value?: string
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
  remarkBreaks,
]
const simpleRehypePlugins: PluggableList = [rehypeRaw, [rehypeSanitize, markdownSanitizeSchema]]

const baseMarkdownComponents: Components = {
  blockquote({ children }) {
    return (
      <blockquote className="weimo-card-markdown__blockquote">
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

export type MdRenderProps = ComponentPropsWithoutRef<'div'> & {
  content: string
}

export const MdRender = forwardRef<HTMLDivElement, MdRenderProps>(function MdRender(
  {
    className,
    content,
    onMouseDown,
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

  return (
    <div
      ref={ref}
      className={cn('weimo-card-markdown weimo-markdown-content', className)}
      onMouseDown={handleMouseDown}
      {...props}
    >
      <ReactMarkdown
        components={baseMarkdownComponents}
        rehypePlugins={simpleRehypePlugins}
        remarkRehypeOptions={markdownRemarkRehypeOptions}
        remarkPlugins={simpleRemarkPlugins}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
})

MdRender.displayName = 'MdRender'
