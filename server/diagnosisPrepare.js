import { parseExamFile } from './examParser.js'
import { recognizeHandwritingImages, AlibabaOcrError, isAlibabaOcrConfigured } from './alibabaHandwritingOcr.js'
import { buildPrepareFailure } from './apiErrorUtil.js'
import { serializeError } from './deepseekClient.js'

/**
 * 解析标准试卷 + 阿里云手写 OCR，返回预览文本
 */
export async function prepareDiagnosisComparison(payload, onProgress) {
  const { examFileBase64, examFileName, answerImages } = payload

  if (!examFileBase64 || !examFileName) {
    return buildPrepareFailure('validate', new Error('请上传标准试卷（Word 或 PDF）'))
  }
  if (!Array.isArray(answerImages) || answerImages.length === 0) {
    return buildPrepareFailure('validate', new Error('请至少上传一张学生答题卡图片'))
  }

  if (!isAlibabaOcrConfigured()) {
    return buildPrepareFailure(
      'alibaba-ocr-config',
      new AlibabaOcrError('阿里云OCR未配置：请在 Vercel 设置 ALIBABA_ACCESS_KEY_ID 和 ALIBABA_ACCESS_KEY_SECRET'),
    )
  }

  let parsed
  try {
    onProgress?.('正在解析试卷...')
    const examBuffer = Buffer.from(examFileBase64, 'base64')
    parsed = await parseExamFile(examBuffer, examFileName)
  } catch (error) {
    return buildPrepareFailure('exam-parse', error, {
      examPaperText: undefined,
    })
  }

  try {
    onProgress?.('正在识别答题卡（1/' + answerImages.length + '）...')
    const ocrResult = await recognizeHandwritingImages(answerImages, (current, total, name) => {
      onProgress?.(`正在识别答题卡（${current}/${total}）: ${name}`)
    })

    return {
      success: true,
      examPaperText: parsed.text,
      examFileName,
      answerSheetOcrText: ocrResult.combinedText,
      ocrIncomplete: ocrResult.incomplete,
      answerSheetPageCount: answerImages.length,
      examPaperType: parsed.type,
    }
  } catch (error) {
    const errorDetail =
      error instanceof AlibabaOcrError ? error.toJSON() : serializeError(error)

    console.error('[诊断准备] 阿里云 OCR 失败', errorDetail)

    return {
      success: false,
      isMockFallback: true,
      step: 'alibaba-ocr',
      message:
        error instanceof AlibabaOcrError
          ? error.message
          : '阿里云手写 OCR 识别失败，请检查密钥与 OCR 服务权限',
      errorDetail,
      examPaperText: parsed.text,
    }
  }
}
