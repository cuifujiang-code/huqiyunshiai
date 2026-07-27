/**
 * 从 DOCX 中提取公式渲染图（WMF/EMF/PNG），供预览替换占位符
 */
import type JSZip from 'jszip'

export interface DocxFormulaImage {
  index: number
  base64: string
  format: string
  mime: string
  width: string
  height: string
  inline: boolean
}

function mimeFromPath(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() || 'png'
  const map: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    bmp: 'image/bmp',
    wmf: 'image/x-wmf',
    emf: 'image/x-emf',
  }
  return map[ext] || `image/${ext}`
}

function isMetafileExt(ext: string): boolean {
  return ext === 'wmf' || ext === 'emf'
}

export async function loadDocxRelsMap(zip: JSZip): Promise<Record<string, string>> {
  const relsMap: Record<string, string> = {}
  const relsFile = zip.file('word/_rels/document.xml.rels')
  if (!relsFile) return relsMap
  const relsXml = await relsFile.async('text')
  const relRe = /<Relationship[^>]*Id="([^"]*)"[^>]*Target="([^"]*)"[^>]*\/>/g
  let m: RegExpExecArray | null
  while ((m = relRe.exec(relsXml)) !== null) {
    const target = m[2]
    relsMap[m[1]] = target.startsWith('media/') ? `word/${target}` : target
  }
  return relsMap
}

async function readZipFileBase64(zip: JSZip, entryPath: string): Promise<string | null> {
  const entry = zip.file(entryPath)
  if (!entry) return null
  const buf = await entry.async('base64')
  return buf || null
}

function emuToPx(emu: number): number {
  return Math.max(10, Math.round((emu / 914400) * 96))
}

function parseExtent(block: string): { width: string; height: string; inline: boolean } {
  const cx = block.match(/\bcx="(\d+)"/)?.[1]
  const cy = block.match(/\bcy="(\d+)"/)?.[1]
  if (cx && cy) {
    const w = emuToPx(parseInt(cx, 10))
    const h = emuToPx(parseInt(cy, 10))
    return { width: `${w}px`, height: `${h}px`, inline: h <= 56 && w <= 480 }
  }
  const styleMatch = block.match(/style="width:([\d.]+)(pt|in|cm|px)/)
  if (styleMatch) {
    let width = parseFloat(styleMatch[1])
    const unit = styleMatch[2]
    if (unit === 'pt') width = Math.round(width * 1.33)
    else if (unit === 'in') width = Math.round(width * 96)
    else if (unit === 'cm') width = Math.round(width * 37.8)
    return { width: `${width}px`, height: 'auto', inline: width <= 320 }
  }
  return { width: 'auto', height: 'auto', inline: true }
}

function collectRIds(block: string): string[] {
  const ids = new Set<string>()
  for (const m of block.matchAll(/r:(?:id|embed)="(rId\d+)"/g)) ids.add(m[1])
  return [...ids]
}

async function extractRIdImage(
  block: string,
  zip: JSZip,
  relsMap: Record<string, string>,
): Promise<Omit<DocxFormulaImage, 'index'> | null> {
  const extent = parseExtent(block)
  for (const id of collectRIds(block)) {
    const path = relsMap[id]
    if (!path) continue
    const b64 = await readZipFileBase64(zip, path)
    if (!b64) continue
    const ext = path.split('.').pop()?.toLowerCase() || 'png'
    return {
      base64: b64,
      format: ext,
      mime: mimeFromPath(path),
      width: extent.width,
      height: extent.height,
      inline: extent.inline,
    }
  }
  return null
}

function blipPath(block: string, relsMap: Record<string, string>): string | null {
  const embed = block.match(/r:embed="(rId\d+)"/)?.[1]
  if (embed && relsMap[embed]) return relsMap[embed]
  return null
}

async function replaceAsync(
  str: string,
  regex: RegExp,
  replacer: (match: string) => Promise<string>,
): Promise<string> {
  const parts: string[] = []
  let last = 0
  regex.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = regex.exec(str)) !== null) {
    parts.push(str.slice(last, m.index))
    parts.push(await replacer(m[0]))
    last = m.index + m[0].length
  }
  parts.push(str.slice(last))
  return parts.join('')
}

/**
 * 按文档顺序提取公式图，并将 OLE / WMF 图元替换为 ⟦F{n}⟧ token
 */
export async function extractAndReplaceFormulaBlocks(
  docXml: string,
  zip: JSZip,
  relsMap: Record<string, string>,
): Promise<{ docXml: string; rawImages: Omit<DocxFormulaImage, 'index'>[] }> {
  const rawImages: Omit<DocxFormulaImage, 'index'>[] = []
  let tokenIdx = 0

  const markFormula = async (block: string): Promise<string> => {
    const img = await extractRIdImage(block, zip, relsMap)
    const i = tokenIdx
    tokenIdx += 1
    if (img) rawImages.push(img)
    return `<w:r><w:t xml:space="preserve">⟦F${i}⟧</w:t></w:r>`
  }

  let xml = docXml

  xml = await replaceAsync(xml, /<w:object[\s\S]*?<\/w:object>/g, async (block) =>
    block.includes('OLEObject') ? markFormula(block) : block,
  )

  xml = await replaceAsync(xml, /<w:pict[\s\S]*?<\/w:pict>/g, async (block) => {
    if (block.includes('OLEObject') || block.includes('EMBED Equation')) {
      return markFormula(block)
    }
    const path = blipPath(block, relsMap) || (collectRIds(block)[0] ? relsMap[collectRIds(block)[0]] : null)
    const ext = path?.split('.').pop()?.toLowerCase() || ''
    if (isMetafileExt(ext)) return markFormula(block)
    if (block.includes('v:imagedata') || block.includes('imagedata')) {
      const path2 = collectRIds(block).map((id) => relsMap[id]).find(Boolean)
      const ext2 = path2?.split('.').pop()?.toLowerCase() || ''
      if (isMetafileExt(ext2)) return markFormula(block)
    }
    return block
  })

  xml = await replaceAsync(xml, /<w:drawing[\s\S]*?<\/w:drawing>/g, async (block) => {
    const path = blipPath(block, relsMap)
    const ext = path?.split('.').pop()?.toLowerCase() || ''
    if (isMetafileExt(ext)) return markFormula(block)
    return block
  })

  xml = await replaceAsync(xml, /<o:OLEObject[^>]*\/>/g, async (block) => markFormula(block))

  return { docXml: xml, rawImages }
}
