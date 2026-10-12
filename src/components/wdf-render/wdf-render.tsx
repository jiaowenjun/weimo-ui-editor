import {
  Fragment,
  forwardRef,
  type ComponentPropsWithoutRef,
  type MouseEvent,
  type ReactNode,
} from 'react'
import type {
  WdfBlock,
  WdfDocument,
  WdfListItem,
  WdfText,
} from 'weimo-wdf'

import { cn } from 'weimo-ui-core/lib/utils'

import 'weimo-ui-markdown/styles/markdown-content.css'

export type {
  WdfBlock,
  WdfDocument,
  WdfListItem,
  WdfMark,
  WdfParagraph,
  WdfText,
} from 'weimo-wdf'

function renderTextValue(value: string, keyPrefix: string): ReactNode {
  return value.split('\n').map((line, index) => (
    <Fragment key={`${keyPrefix}-line-${index}`}>
      {index > 0 ? <br /> : null}
      {line}
    </Fragment>
  ))
}

function renderInlineContent(content: WdfText[], keyPrefix: string): ReactNode {
  return content.map((text, index) => {
    const key = `${keyPrefix}-text-${index}`
    const value = renderTextValue(text.text, key)

    if (text.marks?.some((mark) => mark.type === 'bold')) {
      return (
        <strong className="weimo-card-markdown__strong" key={key}>
          {value}
        </strong>
      )
    }

    return <Fragment key={key}>{value}</Fragment>
  })
}

function headingTag(level: number) {
  switch (level) {
    case 1:
      return 'h1'
    case 2:
      return 'h2'
    case 3:
      return 'h3'
    case 4:
      return 'h4'
    case 5:
      return 'h5'
    case 6:
      return 'h6'
    default:
      throw new RangeError(`WDF heading level must be between 1 and 6; received ${level}`)
  }
}

function renderListItems(items: WdfListItem[], keyPrefix: string) {
  return items.map((item, index) => (
    <li className="weimo-card-markdown__list-item" key={`${keyPrefix}-item-${index}`}>
      {renderInlineContent(item.content[0].content, `${keyPrefix}-item-${index}`)}
    </li>
  ))
}

function renderBlock(block: WdfBlock, index: number): ReactNode {
  const keyPrefix = `block-${index}`

  switch (block.type) {
    case 'paragraph':
      return (
        <p className="weimo-card-markdown__p" key={keyPrefix}>
          {renderInlineContent(block.content, keyPrefix)}
        </p>
      )
    case 'heading': {
      const Heading = headingTag(block.attrs.level)

      return (
        <Heading
          className={`weimo-card-markdown__heading weimo-card-markdown__heading--h${block.attrs.level}`}
          key={keyPrefix}
        >
          {renderInlineContent(block.content, keyPrefix)}
        </Heading>
      )
    }
    case 'blockquote':
      return (
        <blockquote className="weimo-card-markdown__blockquote" key={keyPrefix}>
          {block.content.map((paragraph, paragraphIndex) => (
            <p
              className="weimo-card-markdown__p"
              key={`${keyPrefix}-paragraph-${paragraphIndex}`}
            >
              {renderInlineContent(
                paragraph.content,
                `${keyPrefix}-paragraph-${paragraphIndex}`,
              )}
            </p>
          ))}
        </blockquote>
      )
    case 'bullet_list':
      return (
        <ul
          className="weimo-card-markdown__list weimo-card-markdown__list--ul"
          key={keyPrefix}
        >
          {renderListItems(block.content, keyPrefix)}
        </ul>
      )
    case 'ordered_list':
      return (
        <ol
          className="weimo-card-markdown__list weimo-card-markdown__list--ol"
          key={keyPrefix}
          start={block.attrs.start}
        >
          {renderListItems(block.content, keyPrefix)}
        </ol>
      )
  }
}

export type WdfRenderProps = Omit<ComponentPropsWithoutRef<'div'>, 'content'> & {
  content: WdfDocument
}

export const WdfRender = forwardRef<HTMLDivElement, WdfRenderProps>(
  function WdfRender(
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
        className={cn(
          'weimo-card-markdown weimo-markdown-content weimo-wdf-render',
          className,
        )}
        onMouseDown={handleMouseDown}
        {...props}
      >
        {content.root.content.map(renderBlock)}
      </div>
    )
  },
)

WdfRender.displayName = 'WdfRender'
