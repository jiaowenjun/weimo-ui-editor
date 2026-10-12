import assert from 'node:assert/strict'

import { Editor } from '@tiptap/core'
import { fromTiptap } from 'weimo-doc'

import {
  createRichEditorExtensions,
  findWdfOrderedListInput,
} from '../dist/components/rich-editor/rich-editor-extensions.js'
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
        content: [{ type: 'text', text: 'schema' }],
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
    'the RichEditor schema must preserve weimo-doc Tiptap JSON exactly',
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
