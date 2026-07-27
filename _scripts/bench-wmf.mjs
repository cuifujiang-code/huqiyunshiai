import { readFileSync, writeFileSync, unlinkSync, mkdirSync } from 'fs'
import { spawnSync } from 'child_process'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { importDocxBuffer } from '../server/teacher/docxImportService.js'

const buf = readFileSync('F:/崔福江/2026年暑假讲义/初高衔接讲义.docx')
const result = await importDocxBuffer(buf)
const figures = result.chapters[0].sections[0].blocks[0].figures.slice(0, 20)
const py = join(dirname(fileURLToPath(import.meta.url)), 'wmf_to_png.py')
mkdirSync(join(dirname(fileURLToPath(import.meta.url)), '..', '_temp'), { recursive: true })
const tmpDir = join(dirname(fileURLToPath(import.meta.url)), '..', '_temp')

const t0 = Date.now()
let ok = 0
for (let i = 0; i < figures.length; i++) {
  const m = figures[i].match(/base64,([^"']+)/)
  if (!m) continue
  const tmp = join(tmpDir, `bench-${i}.wmf`)
  writeFileSync(tmp, Buffer.from(m[1], 'base64'))
  const r = spawnSync('python', [py, tmp], { encoding: 'buffer', maxBuffer: 20 * 1024 * 1024 })
  unlinkSync(tmp)
  if (r.status === 0 && r.stdout?.length) ok++
}
console.log(`${figures.length} converts in ${Date.now() - t0}ms, ok: ${ok}`)
