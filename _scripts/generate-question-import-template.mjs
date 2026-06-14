import { mkdirSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { buildImportTemplateBuffer } from '../server/teacher/questionExcelImport.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, 'public', 'templates')
mkdirSync(outDir, { recursive: true })
const outPath = join(outDir, 'question-import-template.xlsx')
writeFileSync(outPath, buildImportTemplateBuffer())
console.log('Wrote', outPath)
