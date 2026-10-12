import assert from 'node:assert/strict'

import { Editor } from '@tiptap/core'
import { fromTiptap } from 'weimo-wdf'

import {
  createRichEditorExtensions,
  findWdfOrderedListInput,
} from '../dist/components/rich-editor/rich-editor-extensions.js'
import { editorHasContent } from '../dist/components/rich-editor/rich-editor-content.js'
import { toWdfEditorContent } from '../dist/components/wdf-view/wdf-editor-content.js'

const document = {
  schema: 'weimo.document',
  version: 1,
  root: {
    type: 'doc',
    content: [
      {
        type: 'heading',
        attrs: { level: 6 },
        content: [
          { type: 'text', text: 'schema ' },
          { type: 'text', text: 'contract', marks: [{ type: 'bold' }] },
        ],
      },
      {
        type: 'blockquote',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'paragraphs only' }],
          },
        ],
      },
      {
        type: 'paragraph',
        content: [],
      },
      {
        type: 'ordered_list',
        attrs: { start: 2 },
        content: [
          {
            type: 'list_item',
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: 'one paragraph' }],
              },
            ],
          },
        ],
      },
    ],
  },
}

const tiptapDocument = toWdfEditorContent(document)
const editor = new Editor({
  element: null,
  extensions: createRichEditorExtensions({
    getInteraction: () => ({ disabled: false }),
  }),
  content: tiptapDocument,
})

try {
  const editorDocument = JSON.parse(JSON.stringify(editor.getJSON()))

  assert.deepEqual(
    editorDocument,
    tiptapDocument,
    'the RichEditor schema must preserve weimo-wdf Tiptap JSON exactly',
  )
  assert.notEqual(
    JSON.stringify(editorDocument),
    JSON.stringify(tiptapDocument),
    'the fixture must retain the real bold-node property-order difference',
  )
  assert.equal(
    editorHasContent(editor, tiptapDocument),
    true,
    'controlled comparison must use ProseMirror document semantics rather than JSON property order',
  )
  editor.commands.setTextSelection(2)
  const selectionBeforeEquivalentUpdate = editor.state.selection.from

  if (!editorHasContent(editor, tiptapDocument)) {
    editor.commands.setContent(tiptapDocument, { emitUpdate: false })
  }

  assert.equal(
    editor.state.selection.from,
    selectionBeforeEquivalentUpdate,
    'an equivalent controlled value must not replace the document or move the selection',
  )

  const changedDocument = structuredClone(tiptapDocument)
  changedDocument.content[0].content[0].text = 'changed'
  assert.equal(
    editorHasContent(editor, changedDocument),
    false,
    'controlled comparison must still detect real document changes',
  )
  assert.equal(editor.schema.nodes.hardBreak, undefined)
  assert.equal(editor.schema.nodes.blockquote?.spec.content?.toString(), 'paragraph+')
  assert.equal(editor.schema.nodes.listItem?.spec.content?.toString(), 'paragraph')
  assert.deepEqual(fromTiptap(editorDocument), { ok: true, value: document })

  assert.equal(findWdfOrderedListInput('0. '), null)
  assert.notEqual(findWdfOrderedListInput('4294967295. '), null)
  assert.equal(findWdfOrderedListInput('4294967296. '), null)
} finally {
  editor.destroy()
}

console.log('RichEditor WDF schema contract passed')
