import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import { fromTiptap, toTiptap } from 'weimo-wdf'

const packageManifest = JSON.parse(
  await readFile(new URL('../package.json', import.meta.url), 'utf8'),
)
const wdfCardSource = await readFile(
  new URL('../src/components/wdf-card/wdf-card.tsx', import.meta.url),
  'utf8',
)
const wdfCardStyles = await readFile(
  new URL('../src/components/wdf-card/wdf-card.css', import.meta.url),
  'utf8',
)
const wdfCardDemoSource = await readFile(
  new URL(
    '../site/src/docs/catalog/packages/weimo-ui-editor/wdf-card.tsx',
    import.meta.url,
  ),
  'utf8',
)
const richEditorElement = /<RichEditor\s[\s\S]*?\/>/.exec(wdfCardSource)?.[0]

assert.ok(richEditorElement, 'WdfCard must render RichEditor in edit mode')

assert.deepEqual(
  packageManifest.exports['./components/wdf-card'],
  {
    types: './dist/components/wdf-card/wdf-card.d.ts',
    import: './dist/components/wdf-card/wdf-card.js',
  },
  'WdfCard must remain available through its public package subpath',
)

assert.match(
  wdfCardSource,
  /if \(intent === 'save'\) \{[\s\S]*commitDraft\('change'\)[\s\S]*transitionPhase\('closing'\)/,
  'WdfCard must commit a valid draft before starting its close transition',
)
assert.match(
  wdfCardSource,
  /const \{[\s\S]*sessionContent[\s\S]*commitDraft[\s\S]*\} = useEditorSession\(/,
  'WdfCard must keep document conversion in its editor-session data plane',
)
assert.match(
  richEditorElement,
  /defaultValue=\{sessionContent\}/,
  'WdfCard editing sessions must initialize an uncontrolled RichEditor draft',
)
assert.doesNotMatch(
  richEditorElement,
  /\bvalue=/,
  'WdfCard must not feed each WDF conversion back into RichEditor while editing',
)
assert.doesNotMatch(
  richEditorElement,
  /\bonChange=/,
  'WdfCard must not publish its RichEditor draft while the session is active',
)
assert.match(
  wdfCardSource,
  /aria-label="取消编辑"[\s\S]*<X \/>[\s\S]*aria-label="保存编辑"[\s\S]*<Check \/>/,
  'WdfCard must expose separate cancel and save actions while editing',
)

assert.match(
  wdfCardSource,
  /className="wdf-card__body"[\s\S]*wdf-card__bottom-bar[\s\S]*aria-label="编辑工具栏"/,
  'the bottom bar slot must render between the body and the edit toolbar',
)
assert.match(
  wdfCardStyles,
  /\.wdf-card__bottom-bar\s*\{[^}]*flex: none;[^}]*padding: 0 var\(--space-card-pad\) var\(--space-card-pad\);/,
  'the bottom bar must align with card padding without joining toolbar choreography',
)
assert.match(
  wdfCardStyles,
  /\.wdf-card__bottom-bar:empty\s*\{\s*display: none;/,
  'an empty bottom bar must not reserve space inside the card',
)
assert.match(
  wdfCardSource,
  /className="wdf-card__action-slot"/,
  'WdfCard must expose a header action slot for consumer chrome',
)
assert.match(
  wdfCardSource,
  /phase === 'view' \? \(\s*hideEditEntry \? null : \(\s*<GhostIconButton[\s\S]*?aria-label="切换到编辑模式"/,
  'hideEditEntry must remove only the view-mode pencil; edit-mode cancel/save stays',
)
assert.match(
  wdfCardSource,
  /hideEditEntry = false/,
  'hideEditEntry must default to showing the pencil entry',
)
assert.match(
  wdfCardStyles,
  /\.wdf-card__action-slot:empty\s*\{\s*display: none;/,
  'an empty action slot must not reserve header space',
)
assert.match(
  wdfCardDemoSource,
  /bottomBar=/,
  'the docs demo must exercise the bottom bar slot',
)

assert.doesNotMatch(
  wdfCardSource,
  /WdfCardInlineToolbarExitAnimation|inlineToolbarExitAnimation|data-inline-exit-layout/,
  'the fixed inline exit must not expose experimental strategy switches',
)
const inlineExitStart = wdfCardSource.slice(
  wdfCardSource.indexOf('const startInlineExitAnimation'),
  wdfCardSource.indexOf('const settleToView'),
)
assert.match(
  wdfCardStyles,
  /data-edit-style='inline'[^\{]*\.wdf-card__toolbar\s*\{[^}]*transition:\s*none;/,
  'the inline toolbar must only animate during its explicit entry and exit stages',
)
assert.match(
  wdfCardSource,
  /if \(!prefersReducedMotion\(\)\) \{\s*startInlineExitAnimation\(\)/,
  'inline exit must animate by default while respecting reduced motion',
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
  wdfCardSource,
  /height: inlineExit\.stage === 'running'\s*\? inlineExit\.toHeight\s*: inlineExit\.fromHeight/,
  'the real card must interpolate between measured start and end heights',
)
assert.match(
  wdfCardStyles,
  /\.wdf-card__card\[data-edit-style='inline'\]\[data-inline-exit-stage='running'\]\s*\{\s*transition: height 200ms ease;/,
  'inline exit must animate the actual card border rather than only fading icons',
)
assert.match(
  wdfCardStyles,
  /data-inline-exit-stage='running'\] \.wdf-card__toolbar\s*\{[^}]*height: 0;[^}]*height 200ms ease,[^}]*padding-block 200ms ease;/,
  'the closing toolbar must transition its height and padding on the same timeline as the card',
)
assert.doesNotMatch(
  inlineExitStart,
  /showInTopLayer|hideFromTopLayer/,
  'inline exit must keep the card in document flow without promoting it to the top layer',
)
assert.match(
  inlineExitStart,
  /following === slot\.nextElementSibling/,
  'following animation must only affect the explicitly designated adjacent container',
)
assert.match(
  wdfCardSource,
  /height: Math\.max\(inlineExit\.fromHeight, inlineExit\.toHeight\)/,
  'inline exit must hold the larger endpoint until settling to avoid early overlap',
)
assert.match(
  wdfCardSource,
  /event\.propertyName !== 'height'[\s\S]*inlineExitRef\.current\?\.stage === 'running'[\s\S]*settleInlineToView\(\)/,
  'only the card height endpoint may finish the close, never an earlier icon opacity event',
)
assert.equal(
  [...wdfCardDemoSource.matchAll(/<WdfCard\s/g)].length,
  1,
  'the docs demo must return to a single adaptive editing card',
)
assert.doesNotMatch(
  wdfCardDemoSource,
  /editStyle=|ComparisonCard|MutationObserver|requestAnimationFrame/,
  'the docs demo must use adaptive editing without comparison controls or sampling',
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

console.log('WdfCard behavior and conversion contract passed')
