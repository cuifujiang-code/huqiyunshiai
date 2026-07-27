import { fileToBase64 } from './fileBase64'
import { pdfHasExtractableText, pdfToSingleImage } from '../utils/pdfTools'

export interface PreparedExamUpload {
  base64: string
  fileName: string
  convertedFromPdf?: boolean
}

/**
 * 上传前预处理试卷：
 * - 扫描版 PDF（无文字层）→ 客户端渲染为 PNG，走 Vision/OCR 解析
 * - 普通 PDF / Word → 原样上传
 */
export async function prepareExamFileForDecompose(file: File): Promise<PreparedExamUpload> {
  const lower = file.name.toLowerCase()
  if (!lower.endsWith('.pdf')) {
    return { base64: await fileToBase64(file), fileName: file.name }
  }

  try {
    const hasText = await pdfHasExtractableText(file)
    if (hasText) {
      return { base64: await fileToBase64(file), fileName: file.name }
    }

    const blob = await pdfToSingleImage(file, { maxPages: 10, scale: 1.5, format: 'png' })
    const pngName = file.name.replace(/\.pdf$/i, '_扫描版.png')
    const pngFile = new File([blob], pngName, { type: 'image/png' })
    return {
      base64: await fileToBase64(pngFile),
      fileName: pngName,
      convertedFromPdf: true,
    }
  } catch (err) {
    console.warn('[examUploadPrepare] PDF 预处理失败，原样上传 PDF', err)
    return {
      base64: await fileToBase64(file),
      fileName: file.name,
    }
  }
}
