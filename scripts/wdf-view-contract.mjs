import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import { fromTiptap, toTiptap } from 'weimo-wdf'

const packageManifest = JSON.parse(
  await readFile(new URL('../package.json', import.meta.url), 'utf8'),
)
const wdfViewSource = await readFile(
  new URL('../src/components/wdf-view/wdf-view.tsx', import.meta.url),
  'utf8',
)
const richEditorElement = /<RichEditor[\s\S]*?\/>/.exec(wdfViewSource)?.[0]

assert.ok(richEditorElement, 'WdfView must render RichEditor in edit mode')

assert.deepEqual(
  packageManifest.exports['./components/wdf-view'],
  {
    types: './dist/components/wdf-view/wdf-view.d.ts',
    import: './dist/components/wdf-view/wdf-view.js',
  },
  'WdfView must remain available through its public package subpath',
)

assert.match(
  wdfViewSource,
  /renderedMode === 'edit' && mode === 'view'/,
  'WdfView must commit its editing session while the editor is still mounted',
)
assert.match(
  wdfViewSource,
  /editorRef\.current\?\.getContent\(\) \?\? editorContent/,
  'WdfView must read the final editor draft when leaving edit mode',
)
assert.match(
  richEditorElement,
  /defaultValue=\{editorContent\}/,
  'WdfView editing sessions must initialize an uncontrolled RichEditor draft',
)
assert.doesNotMatch(
  richEditorElement,
  /value=\{editorContent\}/,
  'WdfView must not feed each WDF conversion back into RichEditor while editing',
)
assert.doesNotMatch(
  richEditorElement,
  /\bonChange=/,
  'WdfView must not publish its RichEditor draft while the session is still active',
)

const document = {
  schema: 'weimo.document',
  version: 1,
  root: {
    type: 'doc',
    content: [
      {
        type: 'heading',
        attrs: { level: 3 },
        content: [{ type: 'text', text: 'WDF view' }],
      },
      {
        type: 'ordered_list',
        attrs: { start: 3 },
        content: [
          {
            type: 'list_item',
            content: [
              {
                type: 'paragraph',
                content: [
                  {
                    type: 'text',
                    text: 'one model',
                    marks: [{ type: 'bold' }],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
}

assert.deepEqual(
  fromTiptap(toTiptap(document)),
  { ok: true, value: document },
  'the complete WDF editor subset must round-trip through Tiptap JSON',
)

assert.equal(
  fromTiptap({
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'hardBreak' }],
      },
    ],
  }).ok,
  false,
  'unsupported editor nodes must not be accepted as WDF',
)

console.log('WdfView conversion contract passed')
