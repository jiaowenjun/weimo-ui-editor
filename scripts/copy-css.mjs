import { mkdir, readdir, copyFile, writeFile } from 'node:fs/promises'
import { dirname, extname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const sourceRoot = fileURLToPath(new URL('../src/', import.meta.url))
const outputRoot = fileURLToPath(new URL('../dist/', import.meta.url))

async function copyCss(directory) {
  const entries = await readdir(directory, { withFileTypes: true })

  await Promise.all(
    entries.map(async (entry) => {
      const sourcePath = join(directory, entry.name)

      if (entry.isDirectory()) {
        await copyCss(sourcePath)
        return
      }

      if (extname(entry.name) !== '.css') return

      const outputPath = join(outputRoot, relative(sourceRoot, sourcePath))
      await mkdir(dirname(outputPath), { recursive: true })
      await copyFile(sourcePath, outputPath)
      await writeFile(outputPath.replace(/\.css$/, '.d.css.ts'), 'export {}\n')
    }),
  )
}

await copyCss(sourceRoot)
