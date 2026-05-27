import type { DiagnosisFormData, DiagnosisReport, DiagnosisResponse } from '../types/diagnosis'
import { buildLocalDiagnosisReport } from '../data/mockDiagnosisReport'
import { postApiJson } from './postApiJson'

export const DIAGNOSIS_SUBMIT_PATH = '/api/diagnosis/submit'
export const DIAGNOSIS_STATUS_PATH = '/api/diagnosis/status'

/** @deprecated 同步诊断 API，已由异步 submit/status 替代 */
export const DIAGNOSIS_API_PATH = '/api/diagnosis/generate'

const MOCK_FALLBACK_MESSAGE = 'AI服务暂不可用，已展示示例诊断报告'
const POLL_INTERVAL_MS = 3000
const POLL_MAX_ATTEMPTS = 20

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

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

/** @deprecated 使用 SubmitDiagnosisInput */
export type SubmitDiagnosisPayload = SubmitDiagnosisInput

export interface DiagnosisTaskSubmitResponse {
  success: boolean
  taskId?: string
  status?: 'processing'
  message?: string
}

export interface DiagnosisTaskStatusResponse {
  success: boolean
  taskId?: string
  status: 'processing' | 'completed' | 'failed' | 'not_found'
  message?: string
  report?: DiagnosisReport
  isMockFallback?: boolean
  error_message?: string
  errorDetail?: unknown
}

export interface FetchDiagnosisOptions {
  onProgress?: (message: string) => void
}

/**
 * 提交异步诊断任务（立即返回 taskId）
 */
export async function submitDiagnosisTask(
  input: SubmitDiagnosisInput,
): Promise<DiagnosisTaskSubmitResponse> {
  console.log('[诊断] submit 请求', {
    examFileName: input.examFileName,
    answerImageCount: input.answerImages.length,
  })

  const result = await postApiJson<DiagnosisTaskSubmitResponse>(
    DIAGNOSIS_SUBMIT_PATH,
    input,
    '诊断提交',
  )

  if (result.kind === 'success') {
    return result.data
  }

  return {
    success: false,
    message: `提交失败（${result.reason}）`,
  }
}

/**
 * 轮询诊断任务状态（每 3 秒，最多 20 次）
 */
export async function pollDiagnosisTaskUntilDone(
  taskId: string,
  options?: FetchDiagnosisOptions,
): Promise<DiagnosisResponse> {
  const progressMsg = 'AI正在分析您的试卷和答题卡...预计需要20-40秒'
  options?.onProgress?.(progressMsg)

  for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      await sleep(POLL_INTERVAL_MS)
    }

    const url = `${DIAGNOSIS_STATUS_PATH}?taskId=${encodeURIComponent(taskId)}`
    const result = await postApiJson<DiagnosisTaskStatusResponse>(url, null, '诊断状态', {
      method: 'GET',
    })

    if (result.kind !== 'success') {
      console.warn('[诊断] status 查询失败', result)
      continue
    }

    const data = result.data
    console.log('[诊断] status 响应', { attempt: attempt + 1, status: data.status })

    if (data.status === 'processing') {
      options?.onProgress?.(data.message || progressMsg)
      continue
    }

    if (data.status === 'failed') {
      return {
        success: false,
        message: data.message || data.error_message || '诊断任务失败',
        isMockFallback: false,
        errorDetail: data.error_message,
      }
    }

    if (data.status === 'completed' && data.report) {
      return mapSuccessResponse({
        success: true,
        message: data.message,
        report: data.report,
        isMockFallback: data.isMockFallback,
        errorDetail: data.errorDetail,
      })
    }

    if (data.status === 'not_found') {
      return {
        success: false,
        message: '任务不存在或已过期',
        isMockFallback: false,
      }
    }
  }

  return {
    success: false,
    message: '诊断处理超时，请稍后重新提交',
    isMockFallback: false,
  }
}

/**
 * 一站式：提交任务并轮询至完成
 */
export async function runAsyncDiagnosis(
  input: SubmitDiagnosisInput,
  options?: FetchDiagnosisOptions,
): Promise<DiagnosisResponse> {
  const submit = await submitDiagnosisTask(input)
  if (!submit.success || !submit.taskId) {
    return {
      success: false,
      message: submit.message || '提交诊断任务失败',
      isMockFallback: false,
    }
  }

  options?.onProgress?.(submit.message || '您的诊断正在处理中...')
  return pollDiagnosisTaskUntilDone(submit.taskId, options)
}

/** 本地降级：异步失败时用表单生成示例报告 */
export function buildFallbackDiagnosisResponse(form: DiagnosisFormData, reason: string): DiagnosisResponse {
  return {
    success: true,
    message: `${MOCK_FALLBACK_MESSAGE}（原因：${reason}）`,
    isMockFallback: true,
    debugSource: 'client-mock',
    report: buildLocalDiagnosisReport(form),
  }
}
