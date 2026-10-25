import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { Editor } from '@tiptap/core'
import { WdfDocument } from 'weimo-wdf'
import { history, undoDepth } from '@tiptap/pm/history'
import { EditorState } from '@tiptap/pm/state'
import { createRichEditorExtensions } from '../dist/components/rich-editor/rich-editor-extensions.js'
import { createMdfDraft, freshMdfEditorState, readMdfDraft } from '../dist/components/new-mdf-view/new-mdf-document.js'
import { flowMdfTransition } from '../dist/components/new-mdf-view/new-mdf-motion.js'
import { resolveMdfImplementation } from '../dist/components/new-mdf-view/new-mdf-presentation.js'
import { watchDialogViewport } from '../dist/components/mobile-wdf-view/dialog-viewport.js'

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

test('reduced motion commits once without height animations', async () => {
  let updates = 0
  const element = {
    getBoundingClientRect: () => ({ height: 48 }),
    animate: () => assert.fail('reduced motion must not animate'),
  }
  const previous = globalThis.window
  globalThis.window = { matchMedia: () => ({ matches: true }) }
  try {
    await flowMdfTransition({ card: element, toolbar: element }, () => updates++, true).finished
    assert.equal(updates, 1)
  } finally { globalThis.window = previous }
})

test('narrow screens always choose original WdfView, independent of presentation', () => {
  for (const presentation of ['auto', 'inline', 'dialog']) {
    assert.equal(resolveMdfImplementation(true, presentation, null), 'original')
  }
  assert.equal(resolveMdfImplementation(false, 'auto', null), 'inline')
  assert.equal(resolveMdfImplementation(false, 'inline', null), 'inline')
  assert.equal(resolveMdfImplementation(false, 'dialog', null), 'original')
})

test('rotation and presentation changes cannot replace an active draft or closing component', () => {
  for (const narrow of [false, true]) {
    for (const presentation of ['auto', 'inline', 'dialog']) {
      for (const session of ['inline', 'original']) {
        assert.equal(resolveMdfImplementation(narrow, presentation, session), session)
      }
    }
  }
})

const source = (file) => readFileSync(new URL(file, import.meta.url), 'utf8')

// Drive the actual shared viewport listener with independent Safari-style resize
// and scroll events. These tests do not simulate the iOS compositor or keyboard.
function viewportFixture(t, { narrow = true, visualViewport = true, phase = 'edit' } = {}) {
  const previous = globalThis.window
  const viewport = Object.assign(new EventTarget(), { width: 390, height: 844, offsetTop: 0, offsetLeft: 0 })
  const timers = new Map()
  let nextTimer = 0, currentPhase = phase, current = true
  const browser = Object.assign(new EventTarget(), {
    visualViewport: visualViewport ? viewport : null, innerWidth: 390, innerHeight: 844,
    matchMedia: (query) => ({ matches: query.includes('max-width') && narrow }),
    setTimeout: (callback) => { const id = ++nextTimer; timers.set(id, callback); return id },
    clearTimeout: (id) => timers.delete(id),
  })
  globalThis.window = browser
  const writes = []
  const classes = new Set()
  const shell = {
    style: new Proxy({ top: '12px', left: '12px', width: '366px', height: '620px' }, {
      set(target, key, value) { writes.push(key); target[key] = value; return true },
    }),
    classList: { add: (name) => classes.add(name), remove: (name) => classes.delete(name) },
  }
  const dispose = watchDialogViewport(shell, () => currentPhase, () => current, 'animating')
  t.after(() => { dispose(); globalThis.window = previous })
  return {
    viewport, browser, shell, writes, timers, classes, dispose,
    emit(type, change = {}) { Object.assign(viewport, change); viewport.dispatchEvent(new Event(type)) },
    setPhase(value) { currentPhase = value },
    invalidate() { current = false },
    flushTimers() { const callbacks = [...timers.values()]; timers.clear(); callbacks.forEach((callback) => callback()) },
    screenTop() { return parseFloat(shell.style.top) - viewport.offsetTop },
  }
}

test('keyboard resize and viewport-only panning keep the mobile panel at a 12px visible margin', (t) => {
  const f = viewportFixture(t)
  f.emit('resize', { height: 460 })
  assert.equal(f.shell.style.height, '436px')
  assert.equal(f.screenTop(), 12)
  f.writes.length = 0
  const resizeTimer = [...f.timers.keys()]
  for (const offsetTop of [24, 64, 96, 72, 0]) {
    f.emit('scroll', { offsetTop, offsetLeft: offsetTop / 2 })
    assert.equal(f.screenTop(), 12, 'position compensation must be synchronous, even without resize')
    assert.equal(parseFloat(f.shell.style.left) - f.viewport.offsetLeft, 12)
  }
  assert.ok(f.writes.every((key) => key === 'top' || key === 'left'), 'panning must not restart the height animation')
  assert.deepEqual([...f.timers.keys()], resizeTimer)
  f.emit('resize', { height: 844 })
  assert.equal(f.shell.style.height, '620px')
  assert.equal(f.screenTop(), 12)
})

test('scroll-before-resize and consecutive keyboard resizes share one transition cleanup', (t) => {
  const f = viewportFixture(t)
  f.emit('scroll', { offsetTop: 96 })
  assert.equal(f.screenTop(), 12)
  assert.equal(f.timers.size, 0)
  f.emit('resize', { height: 540 })
  const earlier = [...f.timers.keys()][0]
  f.emit('resize', { height: 460, offsetTop: 72 })
  assert.equal(f.screenTop(), 12)
  assert.equal(f.timers.size, 1)
  assert.equal(f.timers.has(earlier), false, 'an earlier keyboard frame must not end the latest transition')
  assert.ok(f.classes.has('animating'))
  f.flushTimers()
  assert.equal(f.classes.has('animating'), false)
})

test('closing, stale sessions, and disposal cannot receive viewport writes or lose the closing animation', (t) => {
  const f = viewportFixture(t)
  f.emit('resize', { height: 460 })
  f.setPhase('closing')
  f.writes.length = 0
  f.emit('resize', { height: 844 })
  f.emit('scroll', { offsetTop: 96 })
  f.flushTimers()
  assert.deepEqual(f.writes, [])
  assert.ok(f.classes.has('animating'))
  f.setPhase('edit')
  f.emit('resize')
  f.dispose()
  assert.equal(f.timers.size, 0)
  f.writes.length = 0
  f.emit('resize')
  f.emit('scroll')
  f.browser.dispatchEvent(new Event('resize'))
  assert.deepEqual(f.writes, [])
  assert.ok(f.classes.has('animating'))
})

test('a replaced editing session rejects viewport updates and delayed cleanup', (t) => {
  const f = viewportFixture(t)
  f.emit('resize')
  f.invalidate()
  f.writes.length = 0
  f.emit('resize', { height: 460 })
  f.emit('scroll', { offsetTop: 96 })
  f.flushTimers()
  assert.deepEqual(f.writes, [])
  assert.ok(f.classes.has('animating'))
})

test('opening retains the original morph and desktop panning does not run the mobile correction', (t) => {
  const f = viewportFixture(t, { narrow: false, phase: 'opening' })
  f.emit('resize', { height: 460 })
  assert.equal(f.shell.style.height, '436px')
  assert.equal(f.timers.size, 0)
  assert.equal(f.classes.size, 0, 'opening animation ownership remains with card-morph')
  f.writes.length = 0
  f.emit('scroll', { offsetTop: 96 })
  f.setPhase('edit')
  f.emit('scroll')
  assert.deepEqual(f.writes, [])
})

test('browsers without VisualViewport retain window resize support', (t) => {
  const f = viewportFixture(t, { visualViewport: false })
  f.browser.innerHeight = 460
  f.browser.dispatchEvent(new Event('resize'))
  assert.equal(f.shell.style.height, '436px')
  assert.equal(f.shell.style.top, '12px')
  f.dispose()
  f.writes.length = 0
  f.browser.dispatchEvent(new Event('resize'))
  assert.deepEqual(f.writes, [])
})

test('only settled narrow dialogs exclude top and left from viewport transitions', () => {
  const css = source('../src/components/wdf-view/wdf-view.css')
  assert.match(css, /@media \(max-width: 640px\)\s*\{\s*\.wdf-view__card--animating\[data-edit-style='dialog'\]\[data-phase='edit'\]\s*\{\s*transition-property: width, height;/)
  assert.match(css, /\.wdf-view__card--animating\s*\{[^}]*top [^,]+,[^}]*left [^,]+,[^}]*width [^,]+,[^}]*height /)
})

test('mobile directly renders original WdfView and owns no alternate geometry or animation', () => {
  const mobile = source('../src/components/new-mdf-view/new-mdf-original.tsx')
  assert.match(mobile, /import \{ WdfView,/)
  assert.match(mobile, /<WdfView[\s\S]*editStyle="dialog" autoFocus=\{false\}/)
  assert.doesNotMatch(mobile, /<dialog|showModal|visualViewport|getBoundingClientRect|requestAnimationFrame|\.animate\(|focus\(/)
  const router = source('../src/components/new-mdf-view/new-mdf-view.tsx')
  assert.match(router, /implementation === 'original' \? NewMdfOriginal : NewMdfInline/)
  assert.match(router, /useSyncExternalStore\(subscribeNarrowScreen/)
  assert.match(router, /setSession\(editing \? implementation : null\)/)
})

test('inline uses only flow transitions without any mobile dialog or focus code', () => {
  const inline = source('../src/components/new-mdf-view/new-mdf-inline.tsx')
  assert.match(inline, /flowMdfTransition\(\{ card, toolbar \}, show, false\)/)
  assert.match(inline, /flowMdfTransition\(\{ card, toolbar \}, update, true\)/)
  const motion = source('../src/components/new-mdf-view/new-mdf-motion.ts')
  const api = source('../dist/components/new-mdf-view/new-mdf-view.d.ts')
  assert.doesNotMatch(inline + motion + api, /snapshotMdfTransition|startViewTransition|viewTransitionName|view-transition-|NewMdfMotion|motion\?:/)
  assert.match(inline, /autofocus: false/)
  const opening = inline.slice(inline.indexOf('async function completeOpen'), inline.indexOf('function begin()'))
  assert.doesNotMatch(opening, /\.focus\(|focusEditor|setTextSelection/)
  assert.doesNotMatch(inline, /<dialog|showModal|visualViewport|morphMdfDialog|lockMdfPage/)
  const css = source('../src/components/new-mdf-view/new-mdf-view.css')
  assert.doesNotMatch(css, /:modal|::backdrop|new-mdf-viewport/)
})

test('original mobile choreography and CSS are the single source of truth', () => {
  const original = source('../src/components/wdf-view/wdf-view.tsx')
  const start = original.indexOf('const settleToView')
  const finish = original.indexOf('// 卸载兜底', start)
  const settle = original.slice(start, finish)
  const steps = ['flushSync(', 'hideFromTopLayer(shell)', 'clearShellGeometry(', 'viewportFocus.unlockBody()', 'viewportFocus.restoreScrollPosition()', 'stageVisibilityHandoff(', 'finishSessionMode()']
  const indices = steps.map((step) => settle.indexOf(step))
  assert.ok(indices.every((index, position) => index >= 0 && (position === 0 || index > indices[position - 1])))
  assert.match(original, /autoFocus = false/)
  assert.match(original, /useCardMorph\(/)
  assert.match(original, /useViewportAndFocus\(/)
  assert.match(original, /KEYBOARD_CLOSE_WAIT/)
})

test('mobile persistence bridge leaves original callers unchanged and preserves save retry semantics', () => {
  const original = source('../src/components/wdf-view/wdf-view.tsx')
  assert.match(original, /if \(!adapter\) return closeEditor\(intent, source\)/)
  assert.match(original, /if \(phaseRef\.current !== 'edit' \|\| adapter\.saving\) return/)
  assert.match(original, /if \(intent === 'cancel'\) return closeEditor\(intent, source\)/)
  assert.match(original, /if \(!isCurrentSession\(session\) \|\| phaseRef\.current !== 'edit'\) return/)
  const mobile = source('../src/components/new-mdf-view/new-mdf-original.tsx')
  assert.match(mobile, /await session\.save\(content, latest\.current\.onCommit\)/)
  assert.match(mobile, /if \(!next \|\| !alive\.current \|\| draft\.current !== session\) return/)
  assert.match(mobile, /flushSync\(\(\) => setSaving\(false\)\)[\s\S]*close\(\)/)
  assert.match(mobile, /draft\.current\?\.dispose\(\)/)
  assert.match(mobile, /await new Promise<void>\(\(resolve\) => \{ returned\.current = resolve; close\(\) \}\)/)
  assert.match(mobile, /if \(next === 'view'\) \{\s*returned\.current\?\.\(\)/)
  assert.match(mobile, /save: async \(\) => \{ view\.current\?\.close\(\); await pending\.current \}/)
  const router = source('../src/components/new-mdf-view/new-mdf-view.tsx')
  assert.match(router, /document=\{props\.document \?\? localDocument\}/)
  assert.match(router, /latest\.current\.document === undefined\) setLocalDocument\(next\)/)
})
