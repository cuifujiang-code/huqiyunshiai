import { parseExamFile } from './examParser.js'
import {
  recognizeHandwritingImagesDoubao,
  DoubaoVisionOcrError,
  isDoubaoVisionOcrConfigured,
} from './doubaoVisionOcr.js'
import { buildPrepareFailure } from './apiErrorUtil.js'
import { serializeError } from './deepseekClient.js'

/**
 * 解析标准试卷 + 豆包视觉 OCR 答题卡
 */
export async function prepareDiagnosisComparison(input, onProgress) {
  const { examFileBase64, examFileName, answerImages } = input

  if (!examFileBase64 || !examFileName) {
    return buildPrepareFailure('validate', new Error('请上传标准试卷（Word 或 PDF）'))
  }
  if (!Array.isArray(answerImages) || answerImages.length === 0) {
    return buildPrepareFailure('validate', new Error('请至少上传一张学生答题卡图片'))
  }

  if (!isDoubaoVisionOcrConfigured()) {
    return buildPrepareFailure(
      'doubao-vision-config',
      new DoubaoVisionOcrError(
        '豆包视觉 OCR 未配置：请设置 DOUBAO_API_KEY 与 DOUBAO_VISION_MODEL（ep- 推理接入点）',
      ),
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
    const ocrResult = await recognizeHandwritingImagesDoubao(answerImages, (current, total, name) => {
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
      ocrProvider: 'doubao-vision',
    }
  } catch (error) {
    const errorDetail =
      error instanceof DoubaoVisionOcrError ? error.toJSON() : serializeError(error)

    console.error('[诊断准备] 豆包视觉 OCR 失败', errorDetail)

    return {
      success: false,
      isMockFallback: true,
      step: 'doubao-vision-ocr',
      message:
        error instanceof DoubaoVisionOcrError
          ? error.message
          : '豆包视觉 OCR 识别失败，请检查 DOUBAO_API_KEY 与 DOUBAO_VISION_MODEL',
      errorDetail,
      examPaperText: parsed.text,
    }
  }
}
