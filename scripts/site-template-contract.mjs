import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const docsShell = await readFile(
  new URL('../site/src/docs/shell/docs-shell.tsx', import.meta.url),
  'utf8',
)
const detailPage = await readFile(
  new URL('../site/src/docs/pages/component-detail-page.tsx', import.meta.url),
  'utf8',
)
const appStyles = await readFile(
  new URL('../site/src/app/app.css', import.meta.url),
  'utf8',
)
const globalStyles = await readFile(
  new URL('../site/src/styles/global.css', import.meta.url),
  'utf8',
)
const sitePackage = JSON.parse(
  await readFile(new URL('../site/package.json', import.meta.url), 'utf8'),
)

assert.match(
  docsShell,
  /from 'weimo-ui-template\/components\/site-template'/,
  'DocsShell must consume the public site template component',
)
assert.match(
  detailPage,
  /from 'weimo-ui-core\/components\/component-preview-card'/,
  'component pages must consume the public core preview card API',
)
assert.match(
  globalStyles,
  /@import "weimo-ui-template\/styles\/base\.css";/,
  'the site must consume the public template base stylesheet',
)

for (const forbidden of [
  'weimo-ui-core/components/sidebar',
  'weimo-ui-core/components/top-bar',
  'nextTheme',
  'app-shell',
  'docs-sidebar-nav',
  'docs-top-bar',
]) {
  assert.doesNotMatch(
    `${docsShell}\n${appStyles}`,
    new RegExp(forbidden),
    `the site must not restore duplicated template implementation: ${forbidden}`,
  )
}

assert.equal(
  sitePackage.dependencies['weimo-ui-template'],
  '~0.1.0',
  'the site template dependency must use the published npm package',
)
assert.equal(
  sitePackage.dependencies['class-variance-authority'],
  undefined,
  'the site must not retain a dependency used only by its deleted card copy',
)

console.log('site template contract passed')
