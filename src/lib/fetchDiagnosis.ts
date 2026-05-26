import type { DiagnosisFormData, DiagnosisResponse } from '../types/diagnosis'
import { buildLocalDiagnosisReport } from '../data/mockDiagnosisReport'
import { postApiJson } from './postApiJson'

export const DIAGNOSIS_API_PATH = '/api/diagnosis/generate'

const MOCK_FALLBACK_MESSAGE = 'AI服务暂不可用，已展示示例诊断报告'

function formatErrorDetail(errorDetail: unknown): string {
  if (!errorDetail) return ''
  if (typeof errorDetail === 'string') return errorDetail
  if (typeof errorDetail === 'object' && errorDetail !== null) {
    const obj = errorDetail as { message?: string; statusCode?: number; responseBody?: string; code?: string }
    const parts = [
      obj.message,
      obj.code ? `code=${obj.code}` : '',
      obj.statusCode ? `HTTP ${obj.statusCode}` : '',
      obj.responseBody?.slice(0, 120),
    ].filter(Boolean)
    return parts.join(' | ')
  }
  return String(errorDetail).slice(0, 200)
}

function mapSuccessResponse(data: DiagnosisResponse): DiagnosisResponse {
  if (data.success && data.report) {
    const isMock = data.isMockFallback ?? (data.report as { source?: string }).source === 'mock'
    const errorHint = isMock ? formatErrorDetail(data.errorDetail) : ''
    return {
      ...data,
      isMockFallback: isMock,
      message: isMock
        ? errorHint
          ? `${MOCK_FALLBACK_MESSAGE}（原因：${errorHint}）`
          : MOCK_FALLBACK_MESSAGE
        : (data.message ?? '诊断报告生成成功'),
      debugSource: isMock ? 'server-mock' : 'server-ai',
    }
  }
  return data
}

export interface PrepareDiagnosisPayload {
  examFileBase64: string
  examFileName: string
  answerImages: { name: string; base64: string; mimeType: string }[]
}

export interface FetchDiagnosisOptions {
  onProgress?: (message: string) => void
}

/**
 * 阶段一：解析标准试卷 + 阿里云手写 OCR
 */
export async function prepareDiagnosisComparison(
  payload: PrepareDiagnosisPayload,
  options?: FetchDiagnosisOptions,
): Promise<DiagnosisResponse> {
  options?.onProgress?.('正在解析试卷...')

  const body = {
    action: 'prepare',
    examFileBase64: payload.examFileBase64,
    examFileName: payload.examFileName,
    answerImages: payload.answerImages,
  }

  console.log('[诊断] prepare 请求', {
    examFileName: payload.examFileName,
    answerImageCount: payload.answerImages.length,
  })

  const result = await postApiJson<DiagnosisResponse>(DIAGNOSIS_API_PATH, body, '诊断准备')

  if (result.kind === 'success') {
    const data = result.data
    console.log('[诊断] prepare 响应', data)

    if (!data.success) {
      return {
        ...data,
        isMockFallback: data.isMockFallback ?? true,
        message: data.message || '试卷解析或 OCR 识别失败',
        errorDetail: data.errorDetail,
      }
    }
    return data
  }

  return {
    success: false,
    message: `准备失败（${result.reason}）`,
    isMockFallback: true,
    errorDetail: { reason: result.reason, status: result.status, bodyPreview: result.bodyPreview },
  }
}

/**
 * 阶段二：DeepSeek 对比分析
 */
export async function fetchDiagnosisReport(
  form: DiagnosisFormData,
  options?: FetchDiagnosisOptions,
): Promise<DiagnosisResponse> {
  options?.onProgress?.('正在AI对比分析...')

  const body = {
    action: 'analyze',
    examType: form.examType,
    subject: form.subject,
    score: form.score,
    fullScore: form.fullScore,
    gradeRank: form.gradeRank,
    confusion: form.confusion,
    examPaperText: form.examPaperText,
    answerSheetOcrText: form.answerSheetOcrText ?? form.ocrText,
    ocrIncomplete: form.ocrIncomplete,
    answerSheetPageCount: form.answerSheetImages?.length ?? 0,
  }

  console.log('[诊断] analyze 请求', {
    examPaperLength: form.examPaperText?.length ?? 0,
    answerOcrLength: form.answerSheetOcrText?.length ?? 0,
  })

  const result = await postApiJson<DiagnosisResponse>(DIAGNOSIS_API_PATH, body, '诊断分析')

  if (result.kind === 'success') {
    const data = result.data

    if (data.success && data.report) {
      return mapSuccessResponse(data)
    }

    if (!data.success && data.errorDetail) {
      return {
        success: true,
        message: `${MOCK_FALLBACK_MESSAGE}（原因：${formatErrorDetail(data.errorDetail)}）`,
        isMockFallback: true,
        debugSource: 'server-error',
        errorDetail: data.errorDetail,
        report: buildLocalDiagnosisReport(form),
      }
    }
  } else {
    console.warn('[诊断] analyze 失败', result)
  }

  return {
    success: true,
    message: result.kind === 'fallback' ? `${MOCK_FALLBACK_MESSAGE}（原因：${result.reason}）` : MOCK_FALLBACK_MESSAGE,
    isMockFallback: true,
    debugSource: 'client-mock',
    errorDetail: result.kind === 'fallback' ? { reason: result.reason, status: result.status } : undefined,
    report: buildLocalDiagnosisReport(form),
  }
}
