import { Extension } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { Plugin, PluginKey, type Transaction } from '@tiptap/pm/state'
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view'

import {
  measureOptionGridColumns,
  type OptionGridColumnCount,
} from '../markdown/option-grid'
import { resolveTrailingOrderedListImagePair } from './md-editor-list-image-layout'

type OptionGridMeasurement = {
  columns: OptionGridColumnCount
  position: number
}

type OptionGridPluginMeta = {
  measurements: OptionGridMeasurement[]
}

type OptionGridPluginState = {
  columnsByPosition: Map<number, OptionGridColumnCount>
  decorations: DecorationSet
}

const optionGridPluginKey = new PluginKey<OptionGridPluginState>('weimoOptionGrid')

export function resolveEditorOptionGridMaxColumns(
  doc: ProseMirrorNode,
  listPosition: number,
): 2 | 4 {
  return resolveTrailingOrderedListImagePair(doc)?.listPosition === listPosition ? 2 : 4
}

function isExactUpperAlphaOptionList(node: ProseMirrorNode | null | undefined) {
  if (
    !node ||
    node.type.name !== 'orderedList' ||
    node.attrs.type !== 'A' ||
    (node.attrs.start ?? 1) !== 1 ||
    node.childCount !== 4
  ) {
    return false
  }

  for (let index = 0; index < node.childCount; index += 1) {
    if (node.child(index).type.name !== 'listItem') return false
  }

  return true
}

function createOptionGridDecorations(
  doc: ProseMirrorNode,
  columnsByPosition: Map<number, OptionGridColumnCount>,
) {
  const decorations: Decoration[] = []

  doc.descendants((node, position) => {
    if (!isExactUpperAlphaOptionList(node)) return

    const columns = columnsByPosition.get(position) ?? 1
    decorations.push(
      Decoration.node(position, position + node.nodeSize, {
        'data-option-columns': String(columns),
        'data-option-grid': 'true',
        'data-option-grid-position': String(position),
      }),
    )
  })

  return DecorationSet.create(doc, decorations)
}

function mapMeasuredColumns(
  columnsByPosition: Map<number, OptionGridColumnCount>,
  transaction: Transaction,
) {
  const mapped = new Map<number, OptionGridColumnCount>()

  for (const [position, columns] of columnsByPosition) {
    const nextPosition = transaction.mapping.mapResult(position, 1)
    if (!nextPosition.deleted) mapped.set(nextPosition.pos, columns)
  }

  return mapped
}

function retainExactOptionGridColumns(
  doc: ProseMirrorNode,
  columnsByPosition: Map<number, OptionGridColumnCount>,
) {
  const retained = new Map<number, OptionGridColumnCount>()

  doc.descendants((node, position) => {
    if (!isExactUpperAlphaOptionList(node)) return

    const columns = columnsByPosition.get(position)
    if (columns) retained.set(position, columns)
  })

  return retained
}

function createPluginView(view: EditorView) {
  const ownerDocument = view.dom.ownerDocument
  const ownerWindow = ownerDocument.defaultView

  if (!ownerWindow) return {}

  let animationFrame = 0
  let disposed = false

  const updateMeasurements = () => {
    animationFrame = 0
    if (disposed || view.composing) return

    const pluginState = optionGridPluginKey.getState(view.state)
    if (!pluginState) return

    const measurements: OptionGridMeasurement[] = []
    let changed = false

    for (const list of view.dom.querySelectorAll<HTMLOListElement>(
      'ol[data-option-grid="true"][data-option-grid-position]',
    )) {
      if (!(list instanceof ownerWindow.HTMLOListElement)) continue

      const position = Number.parseInt(list.dataset.optionGridPosition ?? '', 10)
      const node = Number.isInteger(position) ? view.state.doc.nodeAt(position) : null

      if (!isExactUpperAlphaOptionList(node)) continue

      const columns = measureOptionGridColumns(list, {
        maxColumns: resolveEditorOptionGridMaxColumns(view.state.doc, position),
        measurementHost: view.dom.parentElement,
      })
      measurements.push({ columns, position })

      if (pluginState.columnsByPosition.get(position) !== columns) {
        changed = true
      }
    }

    if (!changed) return

    view.dispatch(
      view.state.tr
        .setMeta(optionGridPluginKey, { measurements } satisfies OptionGridPluginMeta)
        .setMeta('addToHistory', false),
    )
  }

  const scheduleUpdate = () => {
    if (!disposed && !animationFrame) {
      animationFrame = ownerWindow.requestAnimationFrame(updateMeasurements)
    }
  }

  const resizeObserver =
    'ResizeObserver' in ownerWindow
      ? new ownerWindow.ResizeObserver(scheduleUpdate)
      : null
  resizeObserver?.observe(view.dom)
  view.dom.addEventListener('compositionend', scheduleUpdate)
  scheduleUpdate()

  if (ownerDocument.fonts) {
    void ownerDocument.fonts.ready.then(scheduleUpdate)
  }

  return {
    destroy() {
      disposed = true
      resizeObserver?.disconnect()
      view.dom.removeEventListener('compositionend', scheduleUpdate)
      if (animationFrame) ownerWindow.cancelAnimationFrame(animationFrame)
    },
    update(_view: EditorView, previousState: EditorView['state']) {
      if (view.state.doc !== previousState.doc) scheduleUpdate()
    },
  }
}

export const MdEditorOptionGrid = Extension.create({
  name: 'mdEditorOptionGrid',

  addProseMirrorPlugins() {
    return [
      new Plugin<OptionGridPluginState>({
        key: optionGridPluginKey,
        props: {
          decorations(state) {
            return optionGridPluginKey.getState(state)?.decorations ?? null
          },
        },
        state: {
          apply(transaction, pluginState) {
            const meta = transaction.getMeta(optionGridPluginKey) as
              | OptionGridPluginMeta
              | undefined

            if (meta) {
              const columnsByPosition = new Map(
                meta.measurements.map(
                  ({ columns, position }) => [position, columns] as const,
                ),
              )

              return {
                columnsByPosition,
                decorations: createOptionGridDecorations(
                  transaction.doc,
                  columnsByPosition,
                ),
              }
            }

            if (!transaction.docChanged) return pluginState

            const columnsByPosition = retainExactOptionGridColumns(
              transaction.doc,
              mapMeasuredColumns(pluginState.columnsByPosition, transaction),
            )

            return {
              columnsByPosition,
              decorations: createOptionGridDecorations(
                transaction.doc,
                columnsByPosition,
              ),
            }
          },
          init(_, state) {
            const columnsByPosition = new Map<number, OptionGridColumnCount>()

            return {
              columnsByPosition,
              decorations: createOptionGridDecorations(state.doc, columnsByPosition),
            }
          },
        },
        view: createPluginView,
      }),
    ]
  },
})
