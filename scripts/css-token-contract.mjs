import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { readFile, readdir } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const packageRoot = fileURLToPath(new URL('../', import.meta.url))
const distRoot = join(packageRoot, 'dist')

const manifest = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'))

assert.ok(existsSync(distRoot), 'dist/ is missing — run `pnpm build` before this contract')

const componentEntries = Object.entries(manifest.exports)
  .filter(([name]) => name.startsWith('./components/'))
  .map(([name, target]) => ({ name, js: join(packageRoot, target.import) }))

assert.ok(
  componentEntries.length > 0,
  'package must keep exporting component subpaths',
)

async function collectCssFiles(directory) {
  const files = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await collectCssFiles(path)))
    } else if (entry.name.endsWith('.css')) {
      files.push(path)
    }
  }
  return files
}

function resolveOwnSpecifier(specifier, importerDir) {
  const packageName = manifest.name
  const exportKey = specifier.startsWith(`${packageName}/`)
    ? `./${specifier.slice(packageName.length + 1)}`
    : specifier

  if (specifier.endsWith('.css')) {
    if (specifier.startsWith('.')) {
      const path = resolve(importerDir, specifier)
      return existsSync(path) ? path : null
    }
    const target = manifest.exports[exportKey]
    return target ? join(packageRoot, target.default) : null
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

    const source = await readFile(jsFile, 'utf8')
    for (const line of source.split('\n')) {
      if (!/^\s*(import|export)[\s{]/.test(line)) continue
      const quoted = [...line.matchAll(/['"]([^'"]+)['"]/g)]
      const specifier = quoted.at(-1)?.[1]
      if (!specifier) continue

      const resolved = resolveOwnSpecifier(specifier, dirname(jsFile))
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

function scanCss(source) {
  const definitions = new Set(
    [...source.matchAll(/--[\w-]+(?=\s*:)/g)].map((match) => match[0]),
  )
  const hardReferences = new Set(
    [...source.matchAll(/var\(\s*(--[\w-]+)\s*\)/g)].map((match) => match[1]),
  )
  return { definitions, hardReferences }
}

const coreTokensPath = require.resolve('weimo-ui-core/styles/tokens.css')
const coreDefinitionSource = (
  await Promise.all(
    (await collectCssFiles(dirname(dirname(coreTokensPath)))).map((path) =>
      readFile(path, 'utf8'),
    ),
  )
).join('\n')
const coreDefinitions = scanCss(coreDefinitionSource).definitions

let totalStyles = 0
let totalProperties = 0
const violations = []

for (const entry of componentEntries) {
  const styles = [...(await collectEntryStyles(entry.js))]

  if (styles.length === 0) {
    violations.push(
      `${entry.name} loads no stylesheet through its JS graph — the style tracer may be broken`,
    )
    continue
  }

  const sheets = await Promise.all(
    styles.map(async (path) => ({
      path,
      ...scanCss(await readFile(path, 'utf8')),
    })),
  )

  const resolvable = new Set(coreDefinitions)
  for (const sheet of sheets) {
    for (const name of sheet.definitions) resolvable.add(name)
  }

  const unresolved = new Map()
  for (const sheet of sheets) {
    for (const name of sheet.hardReferences) {
      if (!resolvable.has(name)) {
        const list = unresolved.get(name) ?? []
        list.push(relative(packageRoot, sheet.path))
        unresolved.set(name, list)
      }
    }
  }

  for (const [name, paths] of unresolved) {
    violations.push(
      `${entry.name}: var(${name}) used by ${[...new Set(paths)].join(', ')} resolves nowhere`,
    )
  }

  totalStyles += styles.length
  totalProperties += resolvable.size
}

assert.equal(
  violations.length,
  0,
  `every component entry must be style-complete on its own — ${violations.join(' | ')}. ` +
    'Each var() without a fallback must be defined by the stylesheets its JS loads, or by peer weimo-ui-core tokens.',
)

console.log(
  `CSS token self-sufficiency contract passed ` +
    `(${componentEntries.length} entries, ${totalStyles} stylesheets, ` +
    `${totalProperties} resolvable properties)`,
)
