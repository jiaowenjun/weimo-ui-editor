import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { Editor } from '@tiptap/core'
import { WdfDocument } from 'weimo-wdf'
import { history, undoDepth } from '@tiptap/pm/history'
import { EditorState } from '@tiptap/pm/state'
import { createRichEditorExtensions } from '../dist/components/rich-editor/rich-editor-extensions.js'
import { createMdfDraft, freshMdfEditorState, readMdfDraft } from '../dist/components/new-mdf-view/new-mdf-document.js'
import { flowMdfTransition, morphMdfDialog, snapshotMdfTransition } from '../dist/components/new-mdf-view/new-mdf-motion.js'
import { lockMdfPage, showMdfDialog, watchMdfViewport } from '../dist/components/new-mdf-view/new-mdf-dialog.js'

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

test('entering either edit mode never requests editor focus or a text selection', () => {
  const source = readFileSync(new URL('../src/components/new-mdf-view/new-mdf-view.tsx', import.meta.url), 'utf8')
  assert.match(source, /autofocus: false/)
  const opening = source.slice(source.indexOf('async function completeOpen'), source.indexOf('function begin()'))
  assert.doesNotMatch(opening, /\.focus\(|focusEditor|setTextSelection/)
  assert.match(opening, /showMdfDialog\(card, headingRef\.current!\)/)
  assert.match(source, /ref=\{headingRef\} tabIndex=\{-1\}/)
})

test('native dialog receives a non-editable autofocus target before opening', () => {
  for (const autofocus of [false, true]) {
    const heading = { autofocus }
    const dialog = {
      showModal() { assert.equal(heading.autofocus, true) },
    }
    showMdfDialog(dialog, heading)
    assert.equal(heading.autofocus, autofocus, 'the native focusing hint must not leak')
  }
  const heading = { autofocus: false }
  const dialog = { showModal() { throw new Error('detached') } }
  assert.throws(() => showMdfDialog(dialog, heading), /detached/)
  assert.equal(heading.autofocus, false)
})

test('return morph takes over only after keyboard recovery and viewport tracking stops', () => {
  const source = readFileSync(new URL('../src/components/new-mdf-view/new-mdf-view.tsx', import.meta.url), 'utf8')
  const closing = source.slice(source.indexOf('async function finish'), source.indexOf('async function save()'))
  const steps = ['await waitMdfKeyboard', 'const from = card.getBoundingClientRect()', 'unwatch.current?.()', 'unlock.current?.()', 'const destination =', 'await morphMdfDialog']
  const indices = steps.map((step) => closing.indexOf(step))
  assert.ok(indices.every((index, position) => index >= 0 && (position === 0 || index > indices[position - 1])), 'live viewport writes must stop before the return animation and page unlock')
})

test('page lock preserves the document position and restores only its own styles once', () => {
  const previousWindow = globalThis.window, previousDocument = globalThis.document
  const style = { position: 'relative', top: '7px', left: '3px', width: '90%', overflow: 'auto', paddingRight: '' }
  const original = { ...style }
  const scrolls = []
  globalThis.document = { body: { style }, documentElement: { clientWidth: 390 } }
  globalThis.window = {
    scrollX: 0, scrollY: 460, innerWidth: 405,
    getComputedStyle: () => ({ paddingRight: '12px' }),
    scrollTo: (position) => scrolls.push(position),
  }
  try {
    const unlock = lockMdfPage()
    assert.deepEqual(style, { ...original, overflow: 'hidden', paddingRight: 'calc(12px + 15px)' })
    window.scrollY = 500
    unlock()
    unlock()
    assert.deepEqual(style, original)
    assert.deepEqual(scrolls, [{ left: 0, top: 460, behavior: 'instant' }])
    scrolls.length = 0
    window.innerWidth = 390
    const unlockUnmoved = lockMdfPage()
    assert.equal(style.paddingRight, '')
    unlockUnmoved()
    assert.equal(scrolls.length, 0, 'unchanged page position needs no programmatic scroll')
  } finally { globalThis.window = previousWindow; globalThis.document = previousDocument }
})

test('keyboard resize cancels a captured morph before live geometry, coalesces, and cleans up', async () => {
  const previousWindow = globalThis.window
  const viewport = Object.assign(new EventTarget(), { height: 844, width: 390, offsetTop: 0, offsetLeft: 0 })
  const frames = new Map(), styles = new Map(), order = []
  let frameId = 0, cancellations = 0, cancelMorph
  globalThis.window = Object.assign(new EventTarget(), {
    visualViewport: viewport, innerHeight: 844, innerWidth: 390,
    matchMedia: () => ({ matches: false }),
    requestAnimationFrame: (callback) => { frames.set(++frameId, callback); return frameId },
    cancelAnimationFrame: (id) => frames.delete(id),
  })
  const flushFrame = () => {
    const batch = [...frames.values()]
    frames.clear()
    batch.forEach((callback) => callback())
  }
  const done = deferred()
  const dialog = {
    style: {
      setProperty: (key, value) => { styles.set(key, value); order.push('geometry') },
      removeProperty: (key) => styles.delete(key),
    },
    getBoundingClientRect: () => ({ top: 16, left: 16, width: 358, height: 300 }),
    animate: () => ({ finished: done.promise, cancel: () => { cancellations++; done.reject(new Error('cancelled')) } }),
  }
  let unwatch
  try {
    unwatch = watchMdfViewport(dialog, () => { order.push('cancel'); cancelMorph?.() })
    assert.equal(styles.get('--new-mdf-viewport-height'), '844px')
    assert.equal(cancellations, 0, 'initial measurement must not interrupt a transition')
    const morph = morphMdfDialog(dialog, { top: 400, left: 16, width: 358, height: 250 }, true, (cancel) => { cancelMorph = cancel })
    order.length = 0
    viewport.height = 460
    viewport.offsetTop = 8
    viewport.dispatchEvent(new Event('resize'))
    window.dispatchEvent(new Event('resize'))
    assert.equal(frames.size, 1)
    assert.equal(cancellations, 0)
    flushFrame()
    assert.equal(order[0], 'cancel')
    assert.equal(cancellations, 1)
    assert.equal(styles.get('--new-mdf-viewport-height'), '460px')
    assert.equal(styles.get('--new-mdf-viewport-top'), '8px')
    await morph
    cancelMorph = null
    order.length = 0
    viewport.dispatchEvent(new Event('resize'))
    flushFrame()
    assert.deepEqual(order, [], 'duplicate sizes must not rewrite geometry')
    viewport.offsetTop = 24
    viewport.dispatchEvent(new Event('scroll'))
    assert.equal(frames.size, 0, 'Safari focus panning must not trigger a recenter loop')
    viewport.height = 844
    viewport.width = 844
    viewport.offsetTop = 0
    viewport.dispatchEvent(new Event('resize'))
    flushFrame()
    assert.equal(styles.get('--new-mdf-viewport-width'), '844px', 'rotation updates the available width')
    viewport.dispatchEvent(new Event('resize'))
    unwatch()
    assert.equal(frames.size, 0)
    assert.equal(styles.size, 0)
    viewport.dispatchEvent(new Event('resize'))
    window.dispatchEvent(new Event('resize'))
    assert.equal(frames.size, 0, 'unmount removes every listener')
  } finally { unwatch?.(); globalThis.window = previousWindow }
})
