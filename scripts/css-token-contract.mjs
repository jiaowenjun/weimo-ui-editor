import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { readFile, readdir } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

// 由 JS 在运行时写入内联样式的变量,不出现在任何样式表定义中(如 slider 的 --fill):
// 视为已解析,新增条目必须写明赋值位置。
const RUNTIME_SET_PROPERTIES = new Set(['--fill'])

const require = createRequire(import.meta.url)
const packageRoot = fileURLToPath(new URL('../', import.meta.url))
const distRoot = join(packageRoot, 'dist')

const manifest = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'))

assert.ok(existsSync(distRoot), 'dist/ is missing — run `pnpm build` before this contract')

async function collectCssFiles(directory) {
  const files = []
  if (!existsSync(directory)) return files
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...(await collectCssFiles(path)))
    else if (entry.name.endsWith('.css')) files.push(path)
  }
  return files
}

// peer 中会提供样式表的包(本包为 token 源头,常规无 css peer;保留能力供下游同款脚本参考)
const peerRoots = []
for (const name of Object.keys(manifest.peerDependencies ?? {})) {
  if (!name.startsWith('weimo-ui-')) continue
  try {
    const tokensPath = require.resolve(`${name}/styles/tokens.css`)
    peerRoots.push(tokensPath.split('/dist/')[0])
  } catch {
    // peer 不含样式入口,无需参与解析
  }
}
const peerManifests = []
for (const root of peerRoots) {
  peerManifests.push({
    root,
    manifest: JSON.parse(await readFile(join(root, 'package.json'), 'utf8')),
  })
}

function resolveCssSpecifier(specifier, fromDir) {
  if (specifier.startsWith('.')) {
    const path = resolve(fromDir, specifier)
    return existsSync(path) ? path : null
  }
  for (const peer of peerManifests) {
    const name = peer.manifest.name
    if (specifier.startsWith(`${name}/`)) {
      const key = `./${specifier.slice(name.length + 1)}`
      const target = peer.manifest.exports?.[key]
      const file = target ? target.default ?? target.import : null
      return file ? join(peer.root, file) : null
    }
  }
  if (specifier.startsWith(`${manifest.name}/`)) {
    const key = `./${specifier.slice(manifest.name.length + 1)}`
    const target = manifest.exports?.[key]
    const file = target ? target.default ?? target.import : null
    return file ? join(packageRoot, file) : null
  }
  return null
}

function resolveOwnSpecifier(specifier, importerDir) {
  const exportKey = specifier.startsWith(`${manifest.name}/`)
    ? `./${specifier.slice(manifest.name.length + 1)}`
    : specifier

  if (specifier.endsWith('.css')) {
    if (specifier.startsWith('.')) {
      const path = resolve(importerDir, specifier)
      return existsSync(path) ? path : null
    }
    const target = manifest.exports?.[exportKey]
    const file = target ? target.default ?? target.import : null
    return file ? join(packageRoot, file) : null
  }
  if (specifier.startsWith('.')) {
    const base = resolve(importerDir, specifier)
    for (const candidate of [`${base}.js`, join(base, 'index.js')]) {
      if (existsSync(candidate)) return candidate
    }
  }
  return null
}

async function collectEntryStyles(entryJs) {
  const seenJs = new Set()
  const cssFiles = new Set()
  const queue = [entryJs]

  while (queue.length > 0) {
    const jsFile = queue.pop()
    if (seenJs.has(jsFile)) continue
    seenJs.add(jsFile)

    if (!existsSync(jsFile)) continue
    const source = await readFile(jsFile, 'utf8')
    for (const line of source.split('\n')) {
      if (!/^\s*(import|export)[\s{]/.test(line)) continue
      const quoted = [...line.matchAll(/['"]([^'"]+)['"]/g)]
      const specifier = quoted.at(-1)?.[1]
      if (!specifier) continue

      let resolved = resolveOwnSpecifier(specifier, dirname(jsFile))
      if (!resolved && specifier.endsWith('.css')) {
        resolved = resolveCssSpecifier(specifier, dirname(jsFile))
      }
      if (!resolved) continue
      if (resolved.endsWith('.css')) {
        if (existsSync(resolved)) cssFiles.add(resolved)
      } else {
        queue.push(resolved)
      }
    }
  }

  return cssFiles
}

async function expandImports(cssSet) {
  const processed = new Set()
  let grew = true
  while (grew) {
    grew = false
    for (const path of cssSet) {
      if (processed.has(path)) continue
      processed.add(path)
      const source = await readFile(path, 'utf8')
      for (const match of source.matchAll(/@import\s+["']([^"']+)["']/g)) {
        const resolved = resolveCssSpecifier(match[1], dirname(path))
        if (resolved && existsSync(resolved) && !cssSet.has(resolved)) {
          cssSet.add(resolved)
          grew = true
        }
      }
    }
  }
  return cssSet
}

function scanCss(source) {
  const definitions = new Set(
    [...source.matchAll(/--[\w-]+(?=\s*:)/g)].map((match) => match[0]),
  )
  const hardReferences = new Set(
    [...source.matchAll(/var\(\s*(--[\w-]+)\s*\)/g)].map((match) => match[1]),
  )
  return { definitions, hardReferences }
}

const entries = Object.entries(manifest.exports ?? {})
  .map(([name, target]) => {
    const file = target.import ?? target.default
    return { name, file: file?.endsWith('.js') ? join(packageRoot, file) : null }
  })
  .filter((entry) => entry.file !== null)

assert.ok(entries.length > 0, 'package must keep exporting component subpaths')

const definitionsByFile = new Map()
const definitionsOf = async (path) => {
  if (!definitionsByFile.has(path)) {
    definitionsByFile.set(
      path,
      scanCss(await readFile(path, 'utf8')).definitions,
    )
  }
  return definitionsByFile.get(path)
}

let totalStyles = 0
const violations = []

for (const entry of entries) {
  const styles = [...(await expandImports(await collectEntryStyles(entry.file)))]

  if (styles.length === 0) continue

  const resolvable = new Set(RUNTIME_SET_PROPERTIES)
  for (const path of styles) {
    for (const name of await definitionsOf(path)) resolvable.add(name)
  }

  const unresolved = new Map()
  for (const path of styles) {
    const { hardReferences } = scanCss(await readFile(path, 'utf8'))
    for (const name of hardReferences) {
      if (resolvable.has(name)) continue
      const list = unresolved.get(name) ?? new Set()
      list.add(relative(packageRoot, path))
      unresolved.set(name, list)
    }
  }

  for (const [name, files] of unresolved) {
    violations.push(
      `${entry.name}: var(${name}) used by ${[...files].join(', ')} resolves nowhere in the styles this entry loads`,
    )
  }

  totalStyles += styles.length
}

assert.equal(
  violations.length,
  0,
  `every component entry must be style-complete on its own — ${violations.join(' | ')}. ` +
    'Each var() without a fallback must be defined by the stylesheets its JS loads ' +
    '(following @import chains), by a runtime inline style, or it needs a fallback.',
)

console.log(
  `CSS token self-sufficiency contract passed ` +
    `(${entries.length} entries, ${totalStyles} stylesheets)`,
)
