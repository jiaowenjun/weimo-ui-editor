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
const wdfViewStyles = await readFile(
  new URL('../src/components/wdf-view/wdf-view.css', import.meta.url),
  'utf8',
)
const wdfViewDemoSource = await readFile(
  new URL(
    '../site/src/docs/catalog/packages/weimo-ui-editor/wdf-view.tsx',
    import.meta.url,
  ),
  'utf8',
)
const richEditorElement = /<RichEditor\s[\s\S]*?\/>/.exec(wdfViewSource)?.[0]

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
  /if \(intent === 'save'\) \{[\s\S]*commitDraft\('change'\)[\s\S]*transitionPhase\('closing'\)/,
  'WdfView must commit a valid draft before starting its close transition',
)
assert.match(
  wdfViewSource,
  /const \{[\s\S]*sessionContent[\s\S]*commitDraft[\s\S]*\} = useEditorSession\(/,
  'WdfView must keep document conversion in its editor-session data plane',
)
assert.match(
  richEditorElement,
  /defaultValue=\{sessionContent\}/,
  'WdfView editing sessions must initialize an uncontrolled RichEditor draft',
)
assert.doesNotMatch(
  richEditorElement,
  /\bvalue=/,
  'WdfView must not feed each WDF conversion back into RichEditor while editing',
)
assert.doesNotMatch(
  richEditorElement,
  /\bonChange=/,
  'WdfView must not publish its RichEditor draft while the session is active',
)
assert.match(
  wdfViewSource,
  /aria-label="取消编辑"[\s\S]*<X \/>[\s\S]*aria-label="保存编辑"[\s\S]*<Check \/>/,
  'WdfView must expose separate cancel and save actions while editing',
)

assert.match(
  wdfViewSource,
  /inlineToolbarExitAnimation = 'instant'/,
  'the public default must retain the Safari-stable instant exit',
)
assert.match(
  wdfViewSource,
  /export type WdfViewInlineToolbarExitAnimation =[\s\S]*'instant'[\s\S]*'visual'[\s\S]*'overlay'/,
  'WdfView must publish both comparison variants without removing instant',
)
const inlineExitStart = wdfViewSource.slice(
  wdfViewSource.indexOf('const startInlineExitAnimation'),
  wdfViewSource.indexOf('const settleToView'),
)
assert.match(
  wdfViewStyles,
  /data-edit-style='inline'[^\{]*\.wdf-view__toolbar\s*\{[^}]*transition:\s*none;/,
  'the default inline exit must preserve the instant baseline',
)
assert.match(
  wdfViewSource,
  /!prefersReducedMotion\(\) && exitAnimation !== 'instant'[\s\S]*startInlineExitAnimation\(exitAnimation\)/,
  'both experiments must use geometry animation and respect reduced motion',
)
assert.doesNotMatch(
  inlineExitStart,
  /endSession\(|transitionPhase\('view'\)/,
  'starting exit must retain the editor and toolbar until their heights finish transitioning',
)
assert.match(
  inlineExitStart,
  /toHeight = shell\.getBoundingClientRect\(\)\.height/,
  'exit must measure the actual final view height, including saved or cancelled content changes',
)
assert.match(
  wdfViewSource,
  /height: inlineExit\.stage === 'ready'\s*\? inlineExit\.fromHeight\s*: inlineExit\.toHeight/,
  'the real card must interpolate between measured start and end heights',
)
assert.match(
  wdfViewStyles,
  /\.wdf-view__card\[data-edit-style='inline'\]\[data-inline-exit-stage='running'\]\s*\{\s*transition: height 200ms ease;/,
  'both experiments must animate the actual card border rather than only fading icons',
)
assert.match(
  wdfViewStyles,
  /data-inline-exit-stage='running'\] \.wdf-view__toolbar\s*\{[^}]*height: 0;[^}]*height 200ms ease,[^}]*padding-block 200ms ease;/,
  'the closing toolbar must transition its height and padding on the same timeline as the card',
)
assert.match(
  inlineExitStart,
  /layout === 'overlay' && showInTopLayer\(shell\)/,
  'overlay must detach the whole real card to avoid its overflow changing page scrollHeight',
)
assert.match(
  wdfViewSource,
  /event\.propertyName !== 'height'[\s\S]*inlineExitRef\.current\?\.stage === 'running'[\s\S]*settleInlineToView\(\)/,
  'only the card height endpoint may finish the close, never an earlier icon opacity event',
)
assert.match(
  wdfViewDemoSource,
  /<ComparisonCard animation="visual"[\s\S]*<ComparisonCard animation="overlay"/,
  'the docs demo must render both exit strategies for direct comparison',
)
assert.match(
  wdfViewDemoSource,
  /editStyle="inline"[\s\S]*inlineToolbarExitAnimation=\{animation\}/,
  'the shared comparison card must force the inline path at every viewport width',
)
assert.match(
  wdfViewDemoSource,
  /card\.getBoundingClientRect\(\)\.height[\s\S]*toolbar\.getBoundingClientRect\(\)\.height/,
  'the demo must sample real card and toolbar geometry so a zero-height snap is observable',
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

console.log('WdfView behavior and conversion contract passed')
