import { parseExamFile } from './examParser.js'
import { recognizeHandwritingImages, AlibabaOcrError } from './alibabaHandwritingOcr.js'
import { serializeError } from './deepseekClient.js'

/**
 * 解析标准试卷 + 阿里云手写 OCR，返回预览文本
 */
export async function prepareDiagnosisComparison(payload, onProgress) {
  const { examFileBase64, examFileName, answerImages } = payload

  if (!examFileBase64 || !examFileName) {
    throw new Error('请上传标准试卷（Word 或 PDF）')
  }
  if (!Array.isArray(answerImages) || answerImages.length === 0) {
    throw new Error('请至少上传一张学生答题卡图片')
  }

  onProgress?.('正在解析试卷...')
  const examBuffer = Buffer.from(examFileBase64, 'base64')
  const parsed = await parseExamFile(examBuffer, examFileName)

  let answerSheetOcrText = ''
  let ocrIncomplete = false

  try {
    const ocrResult = await recognizeHandwritingImages(answerImages, (current, total, name) => {
      onProgress?.(`正在识别答题卡（${current}/${total}）: ${name}`)
    })
    answerSheetOcrText = ocrResult.combinedText
    ocrIncomplete = ocrResult.incomplete
  } catch (error) {
    console.error('[诊断准备] 阿里云 OCR 失败', error)
    const errorDetail = error instanceof AlibabaOcrError ? error.toJSON() : serializeError(error)
    return {
      success: false,
      isMockFallback: true,
      message: error instanceof AlibabaOcrError ? error.message : '阿里云手写 OCR 识别失败',
      errorDetail,
      examPaperText: parsed.text,
    }
  }

  return {
    success: true,
    examPaperText: parsed.text,
    examFileName,
    answerSheetOcrText,
    ocrIncomplete,
    answerSheetPageCount: answerImages.length,
    examPaperType: parsed.type,
  }
}
