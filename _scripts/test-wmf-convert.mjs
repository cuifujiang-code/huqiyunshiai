import { readFileSync, writeFileSync, unlinkSync } from 'fs'
import { spawnSync } from 'child_process'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { importDocxBuffer } from '../server/teacher/docxImportService.js'

const buf = readFileSync('F:/崔福江/2026年暑假讲义/初高衔接讲义.docx')
const result = await importDocxBuffer(buf)
const fig = result.chapters[0].sections[0].blocks[0].figures[0]
const m = fig.match(/base64,([^"']+)/)
const binary = Buffer.from(m[1], 'base64')

const dir = dirname(fileURLToPath(import.meta.url))
const tmp = join(dir, 'tmp-test.wmf')
writeFileSync(tmp, binary)
const py = join(dir, 'wmf_to_png.py')
const proc = spawnSync('python', [py, tmp], { encoding: 'buffer', maxBuffer: 20 * 1024 * 1024 })
unlinkSync(tmp)
if (proc.status === 0 && proc.stdout?.length) {
  console.log('python convert ok, png bytes:', proc.stdout.length)
} else {
  console.error('python convert fail:', proc.stderr?.toString()?.slice(0, 300))
}
