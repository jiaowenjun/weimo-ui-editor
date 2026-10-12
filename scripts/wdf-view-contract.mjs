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
const wdfViewDemoSource = await readFile(
  new URL(
    '../site/src/docs/catalog/packages/weimo-ui-editor/wdf-view.tsx',
    import.meta.url,
  ),
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

assert.match(
  wdfViewDemoSource,
  /editing \? \([\s\S]*aria-label="取消编辑"[\s\S]*<X \/>[\s\S]*aria-label="保存编辑"[\s\S]*<Check \/>/,
  'the editing preview card must expose separate cancel and save actions',
)
assert.match(
  wdfViewDemoSource,
  /const cancelEditing = \(\) => \{[\s\S]*setEditingSession\(\(current\) => current \+ 1\)[\s\S]*setMode\('view'\)/,
  'cancel must discard the local draft by replacing the editing session',
)
assert.match(
  wdfViewDemoSource,
  /const saveEditing = \(\) => setMode\('view'\)/,
  'save must leave edit mode through the WdfView commit transition',
)
assert.match(
  wdfViewDemoSource,
  /key=\{editingSession\}/,
  'the preview WdfView must use the cancelable editing-session identity',
)
assert.doesNotMatch(
  wdfViewDemoSource,
  /\bEye\b|切换到阅读模式/,
  'edit mode must no longer expose the ambiguous preview action',
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
