import { Extension } from '@tiptap/core'
import Placeholder from '@tiptap/extension-placeholder'
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'
import TableRow from '@tiptap/extension-table-row'
import TaskItem from '@tiptap/extension-task-item'
import TaskList from '@tiptap/extension-task-list'
import { Markdown } from '@tiptap/markdown'
import StarterKit from '@tiptap/starter-kit'

import type {
  MarkdownImageRenderer,
  MarkdownImageSrcResolver,
} from '../markdown/image-renderer'
import { CenteredQuote } from './md-editor-centered-quote'
import { MdEditorBlockMath } from './md-editor-block-math'
import { MarkdownImagePlaceholder } from './md-editor-image'
import { MdEditorInlineMath } from './md-editor-inline-math'
import { MdEditorListImageLayout } from './md-editor-list-image-layout'
import { MdEditorOptionGrid } from './md-editor-option-grid'
import { MdEditorTable } from './md-editor-table'
import {
  MdEditorListItem,
  MdEditorOrderedList,
  ParenthesizedOrderedListTokenizer,
} from './md-editor-ordered-list'
import { SaveKeymap, type MdEditorInteractionContext } from './md-editor-save-keymap'

const AlphabeticOrderedListMarker = Extension.create({
  name: 'alphabeticOrderedListMarker',

  addGlobalAttributes() {
    return [
      {
        types: ['orderedList'],
        attributes: {
          alphabeticMarker: {
            default: null,
            parseHTML: () => null,
            renderHTML: (attributes) => {
              const markerType = attributes.type

              return markerType === 'A' || markerType === 'a'
                ? { 'data-marker-type': markerType }
                : {}
            },
          },
        },
      },
    ]
  },
})

export type MdEditorMathClickPayload = {
  kind: 'inline' | 'block'
  latex: string
  pos: number
}

export function createMdEditorExtensions(options: {
  placeholder?: string
  renderImage?: MarkdownImageRenderer
  resolveImageSrc?: MarkdownImageSrcResolver
  getInteraction: () => MdEditorInteractionContext
  onMathClick?: (payload: MdEditorMathClickPayload) => void
}): Extension[] {
  return [
    StarterKit.configure({
      listItem: false,
      orderedList: false,
    }),
    Markdown.configure({
      markedOptions: { gfm: true },
    }),
    CenteredQuote,
    AlphabeticOrderedListMarker,
    MdEditorOrderedList,
    MdEditorListItem,
    MdEditorListImageLayout,
    MdEditorOptionGrid,
    ParenthesizedOrderedListTokenizer,
    MarkdownImagePlaceholder.configure({
      renderImage: options.renderImage,
      resolveImageSrc: options.resolveImageSrc,
    }),
    MdEditorInlineMath.configure({
      katexOptions: { displayMode: false, throwOnError: false },
      onClick: (node, pos) => {
        options.onMathClick?.({
          kind: 'inline',
          latex: String(node.attrs.latex ?? ''),
          pos,
        })
      },
    }),
    MdEditorBlockMath.configure({
      katexOptions: { displayMode: true, throwOnError: false },
      onClick: (node, pos) => {
        options.onMathClick?.({
          kind: 'block',
          latex: String(node.attrs.latex ?? ''),
          pos,
        })
      },
    }),
    MdEditorTable.configure({
      resizable: false,
    }),
    TableRow,
    TableHeader,
    TableCell,
    TaskList,
    TaskItem.configure({
      nested: true,
    }),
    Placeholder.configure({
      placeholder: options.placeholder ?? '',
    }),
    SaveKeymap.configure({
      getInteraction: options.getInteraction,
    }),
  ] as Extension[]
}
