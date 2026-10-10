import type { Editor } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { useEditorState } from '@tiptap/react'
import { AlignCenter, Heading1, List, Quote, SquareSigma, Type } from 'lucide-react'

import { Button } from 'weimo-ui-core/components/coss/button'
import { Toolbar, ToolbarButton, ToolbarGroup } from 'weimo-ui-core/components/coss/toolbar'
import { Tooltip, TooltipPopup, TooltipProvider, TooltipTrigger } from 'weimo-ui-core/components/coss/tooltip'
import { getFrostedSurfaceClassName } from 'weimo-ui-core/components/frosted-surface-model'
import { WEIMO_CENTERED_QUOTE_MARKER } from '../markdown/centered-quote'
import { formatEditorContent } from './md-editor-content-format'
import { convertSelectionToInlineMath, resolveInlineMathSelection } from './md-editor-math-conversion'

import 'weimo-ui-core/styles/frosted-surface.css'

type CenteredQuoteRange = {
  blockquoteFrom: number
  blockquoteTo: number
  markerFrom: number | null
  markerTo: number | null
  paragraphTextStart: number | null
}

type FormatAction = {
  id: 'heading' | 'list' | 'quote' | 'center'
  label: string
  icon: typeof Heading1
  run: (editor: Editor) => void
}

type ParagraphFormat = FormatAction['id']
type ToolbarActiveStates = Record<FormatAction['id'], boolean>

export type MdEditorToolbarProps = {
  editor: Editor
  disabled?: boolean
  formatMarkdown?: (markdown: string) => string
  showContentFormatButton?: boolean
  showCenteredQuoteButton?: boolean
  showHeadingButton?: boolean
  showInlineMathButton?: boolean
  showQuoteButton?: boolean
  suppressActiveBackground?: boolean
}

function findMarkerInBlockquote(
  blockquote: ProseMirrorNode,
  blockquoteFrom: number,
): Omit<CenteredQuoteRange, 'blockquoteFrom' | 'blockquoteTo'> {
  let markerFrom: number | null = null
  let markerTo: number | null = null
  let paragraphTextStart: number | null = null

  blockquote.descendants((node, position) => {
    if (node.type.name !== 'paragraph') return false

    let textPosition = blockquoteFrom + position + 2

    for (let index = 0; index < node.childCount; index += 1) {
      const child = node.child(index)

      if (child.isText) {
        if (paragraphTextStart === null) {
          paragraphTextStart = textPosition
        }

        const markerIndex = child.text?.indexOf(WEIMO_CENTERED_QUOTE_MARKER) ?? -1

        if (markerIndex >= 0) {
          markerFrom = textPosition + markerIndex
          markerTo = markerFrom + WEIMO_CENTERED_QUOTE_MARKER.length
          return false
        }
      }

      textPosition += child.nodeSize
    }

    return false
  })

  return {
    markerFrom,
    markerTo,
    paragraphTextStart,
  }
}

function findSelectedBlockquote(editor: Editor): CenteredQuoteRange | null {
  const { $from } = editor.state.selection

  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth)

    if (node.type.name !== 'blockquote') continue

    const blockquoteFrom = $from.before(depth)
    const marker = findMarkerInBlockquote(node, blockquoteFrom)

    return {
      blockquoteFrom,
      blockquoteTo: blockquoteFrom + node.nodeSize,
      ...marker,
    }
  }

  return null
}

function findActiveCenteredQuote(editor: Editor): CenteredQuoteRange | null {
  const selectedBlockquote = findSelectedBlockquote(editor)

  if (
    selectedBlockquote &&
    selectedBlockquote.markerFrom !== null &&
    selectedBlockquote.markerTo !== null
  ) {
    return selectedBlockquote
  }

  const { from, to } = editor.state.selection
  let activeRange: CenteredQuoteRange | null = null

  editor.state.doc.nodesBetween(from, to, (node, position) => {
    if (activeRange || node.type.name !== 'blockquote') return

    const marker = findMarkerInBlockquote(node, position)

    if (marker.markerFrom === null || marker.markerTo === null) return

    activeRange = {
      blockquoteFrom: position,
      blockquoteTo: position + node.nodeSize,
      ...marker,
    }
  })

  return activeRange
}

function resolveToolbarActiveStates(editor: Editor): ToolbarActiveStates {
  const headingActive = editor.isActive('heading', { level: 1 })
  const listActive = !headingActive && editor.isActive('bulletList')
  const centerQuoteActive = findActiveCenteredQuote(editor) !== null

  return {
    heading: headingActive,
    list: listActive,
    quote: !headingActive && !listActive && !centerQuoteActive && editor.isActive('blockquote'),
    center: !headingActive && !listActive && centerQuoteActive,
  }
}

function removeCenteredMarker(editor: Editor, range: CenteredQuoteRange) {
  if (range.markerFrom === null || range.markerTo === null) return false

  return editor
    .chain()
    .focus()
    .deleteRange({ from: range.markerFrom, to: range.markerTo })
    .run()
}

function addCenteredMarker(editor: Editor, range: CenteredQuoteRange | null) {
  if (range && range.markerFrom !== null && range.markerTo !== null) return true

  const insertAt = range?.paragraphTextStart

  if (insertAt === null || insertAt === undefined) {
    return editor.chain().focus().insertContent(WEIMO_CENTERED_QUOTE_MARKER).run()
  }

  return editor
    .chain()
    .focus()
    .insertContentAt(insertAt, WEIMO_CENTERED_QUOTE_MARKER)
    .run()
}

function clearMutuallyExclusiveParagraphFormats(
  editor: Editor,
  target?: ParagraphFormat,
) {
  if (target !== 'heading' && editor.isActive('heading', { level: 1 })) {
    editor.chain().focus().setParagraph().run()
  }

  if (target !== 'list' && editor.isActive('bulletList')) {
    editor.chain().focus().toggleBulletList().run()
  }

  if (target !== 'center') {
    const activeCenteredQuote = findActiveCenteredQuote(editor)

    if (activeCenteredQuote) {
      removeCenteredMarker(editor, activeCenteredQuote)
    }
  }

  if (target !== 'quote' && target !== 'center' && editor.isActive('blockquote')) {
    editor.chain().focus().unsetBlockquote().run()
  }
}

function toggleExclusiveParagraphFormat(editor: Editor, target: ParagraphFormat) {
  const activeStates = resolveToolbarActiveStates(editor)

  if (activeStates[target]) {
    clearMutuallyExclusiveParagraphFormats(editor)
    return
  }

  clearMutuallyExclusiveParagraphFormats(editor, target)

  if (target === 'heading') {
    editor.chain().focus().setHeading({ level: 1 }).run()
    return
  }

  if (target === 'list') {
    if (!editor.isActive('bulletList')) {
      editor.chain().focus().toggleBulletList().run()
    }
    return
  }

  if (target === 'quote') {
    if (!editor.isActive('blockquote')) {
      editor.chain().focus().toggleBlockquote().run()
    }
    return
  }

  if (!editor.isActive('blockquote')) {
    const wrapped = editor.chain().focus().toggleBlockquote().run()

    if (!wrapped) return
  }

  addCenteredMarker(editor, findSelectedBlockquote(editor))
}

function toggleCenteredQuote(editor: Editor) {
  toggleExclusiveParagraphFormat(editor, 'center')
}

const FORMAT_ACTIONS: FormatAction[] = [
  {
    id: 'heading',
    label: '标题',
    icon: Heading1,
    run: (editor) => {
      toggleExclusiveParagraphFormat(editor, 'heading')
    },
  },
  {
    id: 'list',
    label: '列表',
    icon: List,
    run: (editor) => {
      toggleExclusiveParagraphFormat(editor, 'list')
    },
  },
  {
    id: 'quote',
    label: '引用',
    icon: Quote,
    run: (editor) => {
      toggleExclusiveParagraphFormat(editor, 'quote')
    },
  },
  {
    id: 'center',
    label: '居中',
    icon: AlignCenter,
    run: toggleCenteredQuote,
  },
]

export function MdEditorToolbar({
  disabled = false,
  editor,
  formatMarkdown,
  showContentFormatButton = false,
  showCenteredQuoteButton = true,
  showHeadingButton = true,
  showInlineMathButton = false,
  showQuoteButton = true,
  suppressActiveBackground = false,
}: MdEditorToolbarProps) {
  const toolbarState = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => ({
      ...resolveToolbarActiveStates(currentEditor),
      canConvertSelectionToInlineMath: resolveInlineMathSelection(currentEditor) !== null,
      isEmpty: currentEditor.isEmpty,
    }),
  })
  const visibleFormatActions = FORMAT_ACTIONS.filter((action) => {
    if (action.id === 'heading') return showHeadingButton
    if (action.id === 'quote') return showQuoteButton
    if (action.id === 'center') return showCenteredQuoteButton

    return true
  })

  return (
    <Toolbar
      aria-label="Markdown 格式工具栏"
      className={getFrostedSurfaceClassName('md-editor__toolbar')}
    >
      <TooltipProvider delay={180}>
        <ToolbarGroup className="md-editor__toolbar-group">
          {visibleFormatActions.map((action) => {
            const Icon = action.icon
            const active = toolbarState[action.id]

            return (
              <Tooltip key={action.id}>
                <TooltipTrigger
                  render={
                    <ToolbarButton
                      aria-label={action.label}
                      aria-pressed={active}
                      className="md-editor__toolbar-button"
                      data-active={active && !suppressActiveBackground ? 'true' : 'false'}
                      disabled={disabled}
                      onClick={() => action.run(editor)}
                      onMouseDown={(event) => event.preventDefault()}
                      render={<Button variant="ghost" />}
                    >
                      <Icon aria-hidden="true" />
                    </ToolbarButton>
                  }
                />
                <TooltipPopup>{action.label}</TooltipPopup>
              </Tooltip>
            )
          })}
          {showInlineMathButton ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <ToolbarButton
                    aria-label="行内公式"
                    className="md-editor__toolbar-button"
                    disabled={disabled || !toolbarState.canConvertSelectionToInlineMath}
                    onClick={() => convertSelectionToInlineMath(editor)}
                    onMouseDown={(event) => event.preventDefault()}
                    render={<Button variant="ghost" />}
                  >
                    <SquareSigma aria-hidden="true" />
                  </ToolbarButton>
                }
              />
              <TooltipPopup>行内公式</TooltipPopup>
            </Tooltip>
          ) : null}
          {showContentFormatButton ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <ToolbarButton
                    aria-label="格式化内容"
                    className="md-editor__toolbar-button"
                    disabled={disabled || toolbarState.isEmpty}
                    onClick={() => formatEditorContent(editor, { formatMarkdown })}
                    onMouseDown={(event) => event.preventDefault()}
                    render={<Button variant="ghost" />}
                  >
                    <Type aria-hidden="true" />
                  </ToolbarButton>
                }
              />
              <TooltipPopup>格式化内容</TooltipPopup>
            </Tooltip>
          ) : null}
        </ToolbarGroup>
      </TooltipProvider>
    </Toolbar>
  )
}
