import JSZip from 'jszip'
import { renderLatexInHtml } from '../components/common/MathRenderer'
import { replaceOmmlWithLatexInDocXml } from './ommlToLatex'
import { extractAndReplaceFormulaBlocks, loadDocxRelsMap } from './docxFormulaExtract'
import {
  convertFormulaImages,
  formulaImageTag,
  wmfEmfBase64ToPngDataUrl,
  type ConvertedFormulaImage,
} from './docxWmfConvert'

const FORMULA_PLACEHOLDER =
  '<span class="paper-formula-ph">【公式】</span>'

const FORMULA_TOKEN_RE = /⟦F(\d+)⟧/g

const BROWSER_IMAGE_TYPES = /^image\/(png|jpe?g|gif|webp|bmp|svg\+xml)$/i

function isUnsupportedImageType(contentType: string): boolean {
  return /wmf|emf|metafile|ole/i.test(contentType)
}

function formatFromContentType(contentType: string): string {
  if (/emf/i.test(contentType)) return 'emf'
  if (/wmf/i.test(contentType)) return 'wmf'
  const m = contentType.match(/image\/(\w+)/)
  return m?.[1] || 'png'
}

/** 预处理 docx：OMML→LaTeX、公式图→token，并转换 WMF/EMF */
async function preprocessDocxZip(arrayBuffer: ArrayBuffer): Promise<{
  buffer: ArrayBuffer
  formulaImages: ConvertedFormulaImage[]
}> {
  const zip = await JSZip.loadAsync(arrayBuffer)
  const docFile = zip.file('word/document.xml')
  if (!docFile) return { buffer: arrayBuffer, formulaImages: [] }

  const originalXml = await docFile.async('text')
  const relsMap = await loadDocxRelsMap(zip)

  let docXml = replaceOmmlWithLatexInDocXml(originalXml)
  const { docXml: withTokens, rawImages } = await extractAndReplaceFormulaBlocks(
    docXml,
    zip,
    relsMap,
  )
  const formulaImages = await convertFormulaImages(rawImages)

  zip.file('word/document.xml', withTokens)
  const buffer = await zip.generateAsync({ type: 'arraybuffer' })
  return { buffer, formulaImages }
}

function injectFormulaImages(html: string, formulaImages: ConvertedFormulaImage[]): string {
  return html.replace(FORMULA_TOKEN_RE, (_, idxStr) => {
    const img = formulaImages[parseInt(idxStr, 10)]
    if (img?.pngDataUrl) return formulaImageTag(img)
    return FORMULA_PLACEHOLDER
  })
}

async function convertWmfImgTags(html: string): Promise<string> {
  const re = /<img[^>]*src="data:image\/x-(wmf|emf);base64,([^"]+)"[^>]*>/gi
  const matches = [...html.matchAll(re)]
  if (!matches.length) return html

  let out = html
  for (const m of matches) {
    const fmt = m[1]
    const b64 = m[2]
    const png = await wmfEmfBase64ToPngDataUrl(b64, fmt)
    if (png) {
      out = out.replace(
        m[0],
        `<img class="paper-docx-formula" src="${png}" alt="公式" loading="lazy" />`,
      )
    } else {
      out = out.replace(m[0], FORMULA_PLACEHOLDER)
    }
  }
  return out
}

async function enhanceDocxHtml(
  html: string,
  formulaImages: ConvertedFormulaImage[],
): Promise<string> {
  let out = html
  out = injectFormulaImages(out, formulaImages)
  out = await convertWmfImgTags(out)
  out = out.replace(/<img[^>]*src=""[^>]*>/gi, FORMULA_PLACEHOLDER)
  out = renderLatexInHtml(out, true)
  out = out.replace(/【公式】/g, FORMULA_PLACEHOLDER)
  out = out.replace(
    /<img(?![^>]*class=)/gi,
    '<img class="paper-docx-img"',
  )
  return out
}

export async function convertDocxToPreviewHtml(arrayBuffer: ArrayBuffer): Promise<string> {
  const { buffer, formulaImages } = await preprocessDocxZip(arrayBuffer)
  const mammoth = await import('mammoth')

  const result = await mammoth.convertToHtml(
    { arrayBuffer: buffer },
    {
      convertImage: mammoth.images.imgElement((image) =>
        image.read('base64').then(async (imageBuffer) => {
          const contentType = image.contentType || 'image/png'
          if (isUnsupportedImageType(contentType)) {
            const fmt = formatFromContentType(contentType)
            const png = await wmfEmfBase64ToPngDataUrl(imageBuffer, fmt)
            if (png) {
              return { src: png, className: 'paper-docx-formula' }
            }
            return { src: '' }
          }
          if (!BROWSER_IMAGE_TYPES.test(contentType)) {
            if (!imageBuffer) return { src: '' }
            return { src: `data:${contentType};base64,${imageBuffer}` }
          }
          return {
            src: `data:${contentType};base64,${imageBuffer}`,
          }
        }).catch(() => ({ src: '' })),
      ),
    },
  )

  return enhanceDocxHtml(result.value || '<p>（空文档）</p>', formulaImages)
}
