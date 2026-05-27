import type { DiagnosisFormData, DiagnosisReport, DiagnosisResponse } from '../types/diagnosis'
import { buildLocalDiagnosisReport } from '../data/mockDiagnosisReport'
import { postApiJson } from './postApiJson'

export const DIAGNOSIS_SUBMIT_PATH = '/api/diagnosis/submit'
export const DIAGNOSIS_RUN_OCR_PATH = '/api/diagnosis/run-ocr'
export const DIAGNOSIS_RUN_ANALYSIS_PATH = '/api/diagnosis/run-analysis'

/** @deprecated 同步诊断 API */
export const DIAGNOSIS_API_PATH = '/api/diagnosis/generate'

const MOCK_FALLBACK_MESSAGE = 'AI服务暂不可用，已展示示例诊断报告'
const API_TIMEOUT_MS = 10_000

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

function mapSuccessResponse(data: {
  message?: string
  report?: DiagnosisReport
  isMockFallback?: boolean
  errorDetail?: unknown
}): DiagnosisResponse {
  if (data.report) {
    const isMock = data.isMockFallback ?? (data.report as { source?: string }).source === 'mock'
    const errorHint = isMock ? formatErrorDetail(data.errorDetail) : ''
    return {
      success: true,
      message: isMock
        ? errorHint
          ? `${MOCK_FALLBACK_MESSAGE}（原因：${errorHint}）`
          : MOCK_FALLBACK_MESSAGE
        : (data.message ?? '诊断报告生成成功'),
      report: data.report,
      isMockFallback: isMock,
      errorDetail: data.errorDetail,
      debugSource: isMock ? 'server-mock' : 'server-ai',
    }
  }
  return { success: false, message: data.message || '未返回诊断报告' }
}

export interface SubmitDiagnosisInput {
  userId?: string
  examType: string
  subject: string
  score: number
  fullScore: number
  gradeRank?: number
  confusion: string
  examFileBase64: string
  examFileName: string
  answerImages: { name: string; base64: string; mimeType: string }[]
}

export type SubmitDiagnosisPayload = SubmitDiagnosisInput

export interface DiagnosisTaskSubmitResponse {
  success: boolean
  taskId?: string
  status?: 'processing'
  message?: string
}

export interface DiagnosisRunOcrResponse {
  success: boolean
  taskId?: string
  status?: string
  message?: string
}

export interface DiagnosisRunAnalysisResponse {
  success: boolean
  taskId?: string
  status?: string
  message?: string
  report?: DiagnosisReport
  isMockFallback?: boolean
  errorDetail?: unknown
}

export interface FetchDiagnosisOptions {
  onProgress?: (message: string) => void
}

export async function submitDiagnosisTask(
  input: SubmitDiagnosisInput,
): Promise<DiagnosisTaskSubmitResponse> {
  const result = await postApiJson<DiagnosisTaskSubmitResponse>(
    DIAGNOSIS_SUBMIT_PATH,
    input,
    '诊断提交',
    { timeoutMs: API_TIMEOUT_MS },
  )

  if (result.kind === 'success') {
    return result.data
  }

  return {
    success: false,
    message: result.reason.includes('超时')
      ? '提交超时（超过10秒），请压缩图片后重试'
      : `提交失败（${result.reason}）`,
  }
}

export async function runDiagnosisOcr(taskId: string): Promise<DiagnosisRunOcrResponse> {
  const url = `${DIAGNOSIS_RUN_OCR_PATH}?taskId=${encodeURIComponent(taskId)}`
  const result = await postApiJson<DiagnosisRunOcrResponse>(url, null, 'OCR识别', {
    method: 'GET',
    timeoutMs: API_TIMEOUT_MS,
  })

  if (result.kind === 'success') {
    return result.data
  }

  return {
    success: false,
    message: result.reason.includes('超时')
      ? 'OCR 识别超时（超过10秒），请压缩图片或减少张数后重试'
      : `OCR 识别失败（${result.reason}）`,
  }
}

export async function runDiagnosisAnalysis(taskId: string): Promise<DiagnosisResponse> {
  const url = `${DIAGNOSIS_RUN_ANALYSIS_PATH}?taskId=${encodeURIComponent(taskId)}`
  const result = await postApiJson<DiagnosisRunAnalysisResponse>(url, null, 'AI分析', {
    method: 'GET',
    timeoutMs: API_TIMEOUT_MS,
  })

  if (result.kind === 'success') {
    const data = result.data
    if (data.success && data.report) {
      return mapSuccessResponse(data)
    }
    return {
      success: false,
      message: data.message || 'AI 分析失败',
      isMockFallback: false,
      errorDetail: data.errorDetail,
    }
  }

  return {
    success: false,
    message: result.reason.includes('超时')
      ? 'AI 分析超时（超过10秒），请稍后重试'
      : `AI 分析失败（${result.reason}）`,
    isMockFallback: false,
  }
}

/**
 * 前端顺序调用：submit → run-ocr → run-analysis
 */
export async function runSequentialDiagnosis(
  input: SubmitDiagnosisInput,
  options?: FetchDiagnosisOptions,
): Promise<DiagnosisResponse> {
  options?.onProgress?.('正在提交诊断任务...')

  const submit = await submitDiagnosisTask(input)
  if (!submit.success || !submit.taskId) {
    return {
      success: false,
      message: submit.message || '提交诊断任务失败',
      isMockFallback: false,
    }
  }

  const taskId = submit.taskId

  options?.onProgress?.('正在识别答题卡...')
  const ocr = await runDiagnosisOcr(taskId)
  if (!ocr.success) {
    return {
      success: false,
      message: ocr.message || 'OCR 识别失败',
      isMockFallback: false,
    }
  }

  options?.onProgress?.('答题卡识别完成，正在进行AI分析...')
  return runDiagnosisAnalysis(taskId)
}

export function buildFallbackDiagnosisResponse(form: DiagnosisFormData, reason: string): DiagnosisResponse {
  return {
    success: true,
    message: `${MOCK_FALLBACK_MESSAGE}（原因：${reason}）`,
    isMockFallback: true,
    debugSource: 'client-mock',
    report: buildLocalDiagnosisReport(form),
  }
}
