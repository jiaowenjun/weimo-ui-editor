import { Extension } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

export type TrailingOrderedListImagePair = {
  imagePosition: number
  listPosition: number
}

type ListImageLayoutPluginState = {
  decorations: DecorationSet
  paired: boolean
}

const listImageLayoutPluginKey = new PluginKey<ListImageLayoutPluginState>(
  'weimoListImageLayout',
)

function isEmptyParagraph(node: ProseMirrorNode) {
  return node.type.name === 'paragraph' && node.childCount === 0
}

export function resolveTrailingOrderedListImagePair(
  doc: ProseMirrorNode,
): TrailingOrderedListImagePair | null {
  let imageIndex = doc.childCount - 1

  while (imageIndex >= 0 && isEmptyParagraph(doc.child(imageIndex))) {
    imageIndex -= 1
  }

  if (imageIndex < 1) return null

  const listIndex = imageIndex - 1
  const list = doc.child(listIndex)
  const image = doc.child(imageIndex)

  if (list.type.name !== 'orderedList' || image.type.name !== 'image') {
    return null
  }

  let listPosition = 0

  for (let index = 0; index < listIndex; index += 1) {
    listPosition += doc.child(index).nodeSize
  }

  return {
    imagePosition: listPosition + list.nodeSize,
    listPosition,
  }
}

function createListImageLayoutState(doc: ProseMirrorNode): ListImageLayoutPluginState {
  const pair = resolveTrailingOrderedListImagePair(doc)
  const decorations: Decoration[] = []

  if (pair) {
    const list = doc.nodeAt(pair.listPosition)
    const image = doc.nodeAt(pair.imagePosition)

    if (list && image) {
      decorations.push(
        Decoration.node(pair.listPosition, pair.listPosition + list.nodeSize, {
          'data-list-image-role': 'list',
        }),
        Decoration.node(pair.imagePosition, pair.imagePosition + image.nodeSize, {
          'data-list-image-role': 'image',
        }),
      )
    }
  }

  return {
    decorations: DecorationSet.create(doc, decorations),
    paired: pair !== null,
  }
}

export const MdEditorListImageLayout = Extension.create({
  name: 'mdEditorListImageLayout',

  addProseMirrorPlugins() {
    return [
      new Plugin<ListImageLayoutPluginState>({
        key: listImageLayoutPluginKey,
        props: {
          attributes(state): Record<string, string> {
            return listImageLayoutPluginKey.getState(state)?.paired
              ? { 'data-list-image-layout': 'true' }
              : {}
          },
          decorations(state) {
            return listImageLayoutPluginKey.getState(state)?.decorations ?? null
          },
        },
        state: {
          apply(transaction, pluginState) {
            return transaction.docChanged
              ? createListImageLayoutState(transaction.doc)
              : pluginState
          },
          init(_, state) {
            return createListImageLayoutState(state.doc)
          },
        },
      }),
    ]
  },
})
