import { Extension } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

import { WEIMO_CENTERED_QUOTE_MARKER } from '../markdown/centered-quote'

const centeredQuotePluginKey = new PluginKey('weimoCenteredQuote')

function centeredQuoteMarkerRange(
  blockquote: ProseMirrorNode,
  blockquotePosition: number,
) {
  let markerRange: { from: number; to: number } | undefined

  blockquote.descendants((node, position) => {
    if (markerRange) return false
    if (node.type.name !== 'paragraph') return false

    let childPosition = blockquotePosition + position + 2

    for (let index = 0; index < node.childCount; index += 1) {
      const child = node.child(index)

      if (child.isText) {
        const markerIndex = child.text?.indexOf(WEIMO_CENTERED_QUOTE_MARKER) ?? -1

        if (markerIndex >= 0) {
          markerRange = {
            from: childPosition + markerIndex,
            to: childPosition + markerIndex + WEIMO_CENTERED_QUOTE_MARKER.length,
          }

          return false
        }
      }

      childPosition += child.nodeSize
    }

    return false
  })

  return markerRange
}

export const CenteredQuote = Extension.create({
  name: 'weimoCenteredQuote',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: centeredQuotePluginKey,
        props: {
          decorations(state) {
            const decorations: Decoration[] = []

            state.doc.descendants((node, position) => {
              if (node.type.name !== 'blockquote') return

              const markerRange = centeredQuoteMarkerRange(node, position)

              if (!markerRange) return

              decorations.push(
                Decoration.node(position, position + node.nodeSize, {
                  'data-weimo-centered': 'true',
                }),
              )
              decorations.push(
                Decoration.inline(markerRange.from, markerRange.to, {
                  class: 'weimo-markdown-content__centered-quote-marker',
                }),
              )
            })

            return DecorationSet.create(state.doc, decorations)
          },
        },
      }),
    ]
  },
})
