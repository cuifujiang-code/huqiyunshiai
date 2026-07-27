import { readFileSync } from 'fs'
import { importDocxBuffer } from '../server/teacher/docxImportService.js'

const buf = readFileSync('F:/崔福江/2026年暑假讲义/初高衔接讲义.docx')
const t0 = Date.now()
const r = await importDocxBuffer(buf, '初高衔接讲义.docx')
const b = r.chapters[0]?.sections?.[0]?.blocks?.[0]
const figs = b?.figures || []
const wmf = figs.filter((f) => /x-wmf|x-emf/i.test(f)).length
const png = figs.filter((f) => /image\/png/i.test(f)).length
const pending = (b?.content?.match(/【公式】/g) || []).length
console.log('import ms:', Date.now() - t0)
console.log('converted:', r.formulaImagesConvertedToPng, '/', r.formulaImagesExtracted)
console.log('block figures:', figs.length, 'png:', png, 'wmf:', wmf, 'pending tokens:', pending)
console.log('sample figure:', figs[0]?.slice(0, 120))
