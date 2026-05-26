import type { DiagnosisFormData, DiagnosisResponse } from '../types/diagnosis'
import { buildLocalDiagnosisReport } from '../data/mockDiagnosisReport'
import { postApiJson } from './postApiJson'

export const DIAGNOSIS_API_PATH = '/api/diagnosis/generate'

const MOCK_FALLBACK_MESSAGE = 'AI服务暂不可用，已展示示例诊断报告'

function buildRequestBody(form: DiagnosisFormData) {
  return {
    examType: form.examType,
    subject: form.subject,
    score: form.score,
    fullScore: form.fullScore,
    gradeRank: form.gradeRank,
    confusion: form.confusion,
    ocrText: form.ocrText,
    ocrIncomplete: form.ocrIncomplete,
    examImageCount: form.examImages?.length ?? 0,
  }
}

function formatErrorDetail(errorDetail: unknown): string {
  if (!errorDetail) return ''
  if (typeof errorDetail === 'string') return errorDetail
  if (typeof errorDetail === 'object' && errorDetail !== null) {
    const obj = errorDetail as { message?: string; statusCode?: number; responseBody?: string }
    const parts = [obj.message, obj.statusCode ? `HTTP ${obj.statusCode}` : '', obj.responseBody?.slice(0, 120)]
      .filter(Boolean)
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
      errorDetail: data.errorDetail,
      deepseekConfig: data.deepseekConfig,
    }
  }
  return data
}

export interface FetchDiagnosisOptions {
  onProgress?: (message: string) => void
}

/**
 * 获取诊断报告：与教育规划相同，同步 POST /api/diagnosis/generate。
 */
export async function fetchDiagnosisReport(
  form: DiagnosisFormData,
  options?: FetchDiagnosisOptions,
): Promise<DiagnosisResponse> {
  const hasOcr = Boolean(form.ocrText?.trim())
  options?.onProgress?.(hasOcr ? '正在基于 OCR 文本生成诊断报告...' : '正在生成诊断报告...')

  const body = buildRequestBody(form)
  console.log('[诊断] 发起 POST 请求', {
    url: DIAGNOSIS_API_PATH,
    method: 'POST',
    examImageCount: form.examImages?.length ?? 0,
    ocrLength: form.ocrText?.length ?? 0,
    ocrIncomplete: form.ocrIncomplete,
    examType: form.examType,
    subject: form.subject,
  })

  const result = await postApiJson<DiagnosisResponse>(DIAGNOSIS_API_PATH, body, '诊断')

  if (result.kind === 'success') {
    const data = result.data
    console.log('[诊断] API 完整响应', data)

    if (data.success && data.report) {
      const response = mapSuccessResponse(data)
      if (data.isMockFallback && data.errorDetail) {
        console.warn('[诊断] 服务端 AI 失败，已降级 mock', data.errorDetail, data.deepseekConfig)
      }
      return response
    }

    if (!data.success && data.errorDetail) {
      console.error('[诊断] API 返回错误', data.errorDetail)
      return {
        success: true,
        message: `${MOCK_FALLBACK_MESSAGE}（原因：${formatErrorDetail(data.errorDetail)}）`,
        isMockFallback: true,
        debugSource: 'server-error',
        errorDetail: data.errorDetail,
        report: buildLocalDiagnosisReport(form),
      }
    }

    console.warn('[诊断] 服务端 JSON 缺少 success/report', data)
  } else {
    console.warn('[诊断] API 不可用，降级为本地 mock', {
      reason: result.reason,
      url: result.url,
      status: result.status,
      bodyPreview: result.bodyPreview,
    })
  }

  return {
    success: true,
    message: result.kind === 'fallback' ? `${MOCK_FALLBACK_MESSAGE}（原因：${result.reason}）` : MOCK_FALLBACK_MESSAGE,
    isMockFallback: true,
    debugSource: 'client-mock',
    errorDetail: result.kind === 'fallback' ? { reason: result.reason, status: result.status, bodyPreview: result.bodyPreview } : undefined,
    report: buildLocalDiagnosisReport(form),
  }
}

/** @deprecated 请使用 fetchDiagnosisReport */
export function getLocalDiagnosisReport(form?: DiagnosisFormData): DiagnosisResponse {
  return {
    success: true,
    message: '诊断报告生成成功',
    report: buildLocalDiagnosisReport(form),
  }
}
