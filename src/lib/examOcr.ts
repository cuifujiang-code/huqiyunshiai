import { createWorker } from 'tesseract.js'

export interface OcrPageResult {
  pageIndex: number
  fileName: string
  text: string
}

export interface OcrResult {
  pages: OcrPageResult[]
  combinedText: string
  incomplete: boolean
}

const MIN_CHARS_PER_PAGE = 15
const MIN_TOTAL_CHARS = 40

/**
 * 使用 Tesseract.js 在前端识别试卷图片文字（中文+英文）。
 * 图片仅在浏览器本地处理，不上传至服务器。
 */
export async function recognizeExamImages(
  images: { previewUrl: string; name: string }[],
  onProgress?: (message: string) => void,
): Promise<OcrResult> {
  if (images.length === 0) {
    return { pages: [], combinedText: '', incomplete: true }
  }

  onProgress?.('正在加载 OCR 引擎（首次可能较慢）...')
  const worker = await createWorker('chi_sim+eng')

  const pages: OcrPageResult[] = []

  try {
    for (let i = 0; i < images.length; i++) {
      const img = images[i]
      onProgress?.(`正在识别第 ${i + 1}/${images.length} 页：${img.name}...`)

      const { data } = await worker.recognize(img.previewUrl)
      pages.push({
        pageIndex: i,
        fileName: img.name,
        text: data.text.trim(),
      })
    }
  } finally {
    await worker.terminate()
  }

  const combinedText = pages
    .map((p, i) => `--- 第 ${i + 1} 页（${p.fileName}）---\n${p.text}`)
    .join('\n\n')

  const incomplete =
    combinedText.length < MIN_TOTAL_CHARS ||
    pages.some((p) => p.text.length < MIN_CHARS_PER_PAGE)

  return { pages, combinedText, incomplete }
}
