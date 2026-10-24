import assert from 'node:assert/strict'
import test from 'node:test'
import { Editor } from '@tiptap/core'
import { WdfDocument } from 'weimo-wdf'
import { history, undoDepth } from '@tiptap/pm/history'
import { EditorState } from '@tiptap/pm/state'
import { createRichEditorExtensions } from '../dist/components/rich-editor/rich-editor-extensions.js'
import { createMdfDraft, freshMdfEditorState, readMdfDraft } from '../dist/components/new-mdf-view/new-mdf-document.js'
import { flowMdfTransition, snapshotMdfTransition } from '../dist/components/new-mdf-view/new-mdf-motion.js'

const sample = {
  schema: 'weimo.document', version: 1,
  root: {
    type: 'doc',
    content: [
      ...[1, 2, 3, 4, 5, 6].map((level) => ({
        type: 'heading', attrs: { level }, content: [{ type: 'text', text: `标题 ${level}`, marks: [{ type: 'bold' }] }],
      })),
      { type: 'paragraph', content: [] },
      { type: 'blockquote', content: [{ type: 'paragraph', content: [{ type: 'text', text: '引用' }] }] },
      { type: 'bullet_list', content: [{ type: 'list_item', content: [{ type: 'paragraph', content: [{ type: 'text', text: '无序' }] }] }] },
      { type: 'ordered_list', attrs: { start: 3 }, content: [{ type: 'list_item', content: [{ type: 'paragraph', content: [{ type: 'text', text: '有序' }] }] }] },
    ],
  },
}

function deferred() {
  let resolve, reject
  const promise = new Promise((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

test('all WDF formats, heading levels, and empty paragraphs survive a real editor round trip', () => {
  for (const document of [sample, WdfDocument.empty()]) {
    const draft = createMdfDraft(document)
    const editor = new Editor({
      element: null, content: draft.content,
      extensions: createRichEditorExtensions({ getInteraction: () => ({ disabled: false }) }),
    })
    try {
      assert.deepEqual(readMdfDraft(editor.getJSON()), document)
    } finally { editor.destroy() }
  }
})

test('typing remains local; pending and completed saves cannot commit twice', async () => {
  const document = structuredClone(sample)
  const draft = createMdfDraft(document)
  draft.content.content[0].content[0].text = '会话草稿'
  assert.deepEqual(document, sample, 'editing JSON must not mutate the committed document')
  const pending = deferred()
  let commits = 0
  const first = draft.save(draft.content, async () => { commits++; await pending.promise })
  assert.equal(draft.cancel(), false, 'a pending save must not also cancel')
  assert.equal(await draft.save(draft.content, () => { commits++ }), null)
  assert.equal(commits, 1)
  pending.resolve()
  const saved = await first
  assert.equal(saved.root.content[0].content[0].text, '会话草稿')
  assert.equal(await draft.save(draft.content, () => { commits++ }), null)
  assert.equal(commits, 1)
})

test('failed persistence retains the draft and permits a single successful retry', async () => {
  const draft = createMdfDraft(sample)
  const expected = new Error('network failed')
  await assert.rejects(draft.save(draft.content, () => { throw expected }), expected)
  let commits = 0
  assert.deepEqual(await draft.save(draft.content, () => { commits++ }), sample)
  assert.equal(commits, 1)
})

test('invalid editor content cannot escape to the caller and can be corrected', async () => {
  const draft = createMdfDraft(sample)
  let commits = 0
  await assert.rejects(draft.save({ type: 'doc', content: [{ type: 'image' }] }, () => { commits++ }))
  assert.equal(commits, 0)
  assert.deepEqual(await draft.save(draft.content, () => { commits++ }), sample)
  assert.equal(commits, 1)
})

test('cancelled sessions cannot save, and a fresh session starts with the latest committed content', async () => {
  const draft = createMdfDraft(sample)
  draft.content.content[0].content[0].text = '丢弃这段草稿'
  assert.equal(draft.cancel(), true)
  let commits = 0
  assert.equal(await draft.save(draft.content, () => { commits++ }), null)
  assert.equal(commits, 0)
  assert.deepEqual(readMdfDraft(createMdfDraft(sample).content), sample)
})

test('unmounting a pending session ignores late completion', async () => {
  const draft = createMdfDraft(sample)
  const pending = deferred()
  const saving = draft.save(draft.content, () => pending.promise)
  draft.dispose()
  pending.resolve()
  assert.equal(await saving, null)
})

test('a new editing session cannot undo into a previously discarded draft', () => {
  const draft = createMdfDraft(sample)
  const editor = new Editor({
    element: null, content: draft.content,
    extensions: createRichEditorExtensions({ getInteraction: () => ({ disabled: false }) }),
  })
  try {
    // Headless Tiptap does not mount its view plugins; initialize real history here.
    const baseline = EditorState.create({ doc: editor.state.doc, plugins: [history()] })
    const edited = baseline.apply(baseline.tr.insertText('应丢弃的草稿', 1))
    assert.ok(undoDepth(edited) > 0)
    const fresh = freshMdfEditorState(edited, draft.content)
    assert.equal(undoDepth(fresh), 0)
    assert.deepEqual(readMdfDraft(fresh.doc.toJSON()), sample)
  } finally { editor.destroy() }
})

test('flow exit animates actual card and toolbar heights before releasing them', async () => {
  const calls = []
  let cardHeight = 304, toolbarHeight = 48
  const fake = (height) => ({
    getBoundingClientRect: () => ({ height: height() }),
    animate: (frames, options) => {
      const item = { frames, options, cancelled: false }
      calls.push(item)
      return { finished: Promise.resolve(), cancel() { item.cancelled = true } }
    },
  })
  const previous = globalThis.window
  globalThis.window = { matchMedia: () => ({ matches: false }) }
  try {
    const transition = flowMdfTransition(
      { card: fake(() => cardHeight), toolbar: fake(() => toolbarHeight) },
      () => { cardHeight = 256; toolbarHeight = 0 }, true,
    )
    assert.deepEqual(calls[0].frames, [{ height: '304px' }, { height: '256px' }])
    assert.deepEqual(calls[1].frames, [{ height: '48px' }, { height: '0px' }])
    assert.equal(calls[1].options.delay, 60)
    assert.equal(calls[1].options.fill, 'backwards')
    await transition.finished
    assert.ok(calls.every((call) => call.cancelled))
  } finally { globalThis.window = previous }
})

test('reduced motion commits once without snapshots or height animations', async () => {
  let updates = 0
  const element = {
    getBoundingClientRect: () => ({ height: 48 }),
    animate: () => assert.fail('reduced motion must not animate'),
    ownerDocument: { startViewTransition: () => assert.fail('reduced motion must not capture') },
  }
  const previous = globalThis.window
  globalThis.window = { matchMedia: () => ({ matches: true }) }
  try {
    await snapshotMdfTransition({ card: element, toolbar: element }, () => updates++, true, true).finished
    assert.equal(updates, 1)
  } finally { globalThis.window = previous }
})
