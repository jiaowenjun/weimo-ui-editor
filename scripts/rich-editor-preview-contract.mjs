import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const richEditorPreview = await readFile(
  new URL(
    '../site/src/docs/catalog/packages/weimo-ui-editor/rich-editor.tsx',
    import.meta.url,
  ),
  'utf8',
)
const appStyles = await readFile(
  new URL('../site/src/app/app.css', import.meta.url),
  'utf8',
)

for (const forbidden of [
  'previewHeight',
  'ResizeObserver',
  'useLayoutEffect',
]) {
  assert.doesNotMatch(
    richEditorPreview,
    new RegExp(forbidden),
    `RichEditor preview must not lock its natural height with ${forbidden}`,
  )
}

assert.match(
  richEditorPreview,
  /<div className="rich-editor-docs-preview">/,
  'RichEditor preview must remain a natural-height wrapper',
)

const previewRule = /\.rich-editor-docs-preview\s*\{([^}]*)\}/.exec(appStyles)?.[1]

assert.ok(previewRule, 'RichEditor preview styles must remain defined')
assert.doesNotMatch(
  previewRule,
  /\b(?:height|overflow|transition)\s*:/,
  'RichEditor preview must not constrain or animate its content height',
)

console.log('RichEditor preview natural-height contract passed')
