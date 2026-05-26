import type { DiagnosisFormData, DiagnosisResponse } from '../types/diagnosis'
import { buildLocalDiagnosisReport } from '../data/mockDiagnosisReport'
import { postApiJson } from './postApiJson'

export const DIAGNOSIS_API_PATH = '/api/diagnosis/generate'
export const DIAGNOSIS_JOB_API_PATH = '/api/diagnosis/job'

const MOCK_FALLBACK_MESSAGE = 'AI服务暂不可用，已展示示例诊断报告'
const POLL_INTERVAL_MS = 2000
const POLL_MAX_MS = 90000
const LONG_RUNNING_HINT_MS = 15000

function buildRequestBody(form: DiagnosisFormData, asyncMode: boolean) {
  return {
    examType: form.examType,
    subject: form.subject,
    score: form.score,
    fullScore: form.fullScore,
    gradeRank: form.gradeRank,
    confusion: form.confusion,
    examImageBase64: form.examImageBase64,
    examImageMimeType: form.examImageMimeType,
    async: asyncMode,
  }
}

function mapSuccessResponse(data: DiagnosisResponse): DiagnosisResponse {
  if (data.success && data.report) {
    return {
      ...data,
      isMockFallback: data.isMockFallback ?? (data.report as { source?: string }).source === 'mock',
      message: data.isMockFallback ? MOCK_FALLBACK_MESSAGE : (data.message ?? '诊断报告生成成功'),
      debugSource: data.isMockFallback ? 'server-mock' : 'server-ai',
      errorDetail: data.errorDetail,
      deepseekConfig: data.deepseekConfig,
    }
  }
  return data
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

async function pollDiagnosisJob(
  jobId: string,
  onProgress?: (message: string) => void,
): Promise<DiagnosisResponse> {
  const started = Date.now()
  let longHintShown = false

  while (Date.now() - started < POLL_MAX_MS) {
    const elapsed = Date.now() - started
    if (!longHintShown && elapsed >= LONG_RUNNING_HINT_MS) {
      longHintShown = true
      onProgress?.('分析耗时较长，仍在处理中，请稍候...')
    }

    const url = `${DIAGNOSIS_JOB_API_PATH}?jobId=${encodeURIComponent(jobId)}`
    const result = await postApiJson<DiagnosisResponse>(url, null, '诊断轮询', { method: 'GET' })

    if (result.kind === 'success') {
      const data = result.data
      console.log('[诊断] 轮询响应', { jobId, status: data.status, elapsed })

      if (data.status === 'processing') {
        onProgress?.(data.message ?? '正在上传并分析试卷...')
        await sleep(POLL_INTERVAL_MS)
        continue
      }

      if (data.status === 'failed') {
        throw new Error(data.message ?? '诊断任务失败')
      }

      if (data.status === 'done' && data.report) {
        return mapSuccessResponse(data)
      }
    }

    await sleep(POLL_INTERVAL_MS)
  }

  throw new Error('诊断分析超时，请稍后重试或更换较小的试卷图片')
}

export interface FetchDiagnosisOptions {
  onProgress?: (message: string) => void
}

/**
 * 获取诊断报告：含试卷图片时走异步轮询；API 失败时降级本地 mock。
 */
export async function fetchDiagnosisReport(
  form: DiagnosisFormData,
  options?: FetchDiagnosisOptions,
): Promise<DiagnosisResponse> {
  const hasImage = Boolean(form.examImageBase64)
  const useAsync = hasImage

  if (hasImage) {
    options?.onProgress?.('正在上传并分析试卷...')
  }

  const body = buildRequestBody(form, useAsync)
  console.log('[诊断] 请求体摘要', {
    url: DIAGNOSIS_API_PATH,
    hasImage,
    imageBase64Length: form.examImageBase64?.length ?? 0,
    async: useAsync,
  })

  const result = await postApiJson<DiagnosisResponse>(DIAGNOSIS_API_PATH, body, '诊断')

  if (result.kind === 'success') {
    const data = result.data

    if (data.async && data.jobId && data.status === 'processing') {
      console.log('[诊断] 进入异步轮询', { jobId: data.jobId })
      try {
        const polled = await pollDiagnosisJob(data.jobId, options?.onProgress)
        if (polled.isMockFallback && polled.errorDetail) {
          console.warn('[诊断] 服务端 AI 失败，已降级 mock', polled.errorDetail, polled.deepseekConfig)
        }
        console.log('[诊断] 使用服务端响应（异步）', polled)
        return polled
      } catch (err) {
        console.warn('[诊断] 异步轮询失败，降级本地 mock', err)
        return {
          success: true,
          message: MOCK_FALLBACK_MESSAGE,
          isMockFallback: true,
          debugSource: 'client-mock',
          errorDetail: err instanceof Error ? err.message : String(err),
          report: buildLocalDiagnosisReport(form),
        }
      }
    }

    if (data.success && data.report) {
      const response = mapSuccessResponse(data)
      if (data.isMockFallback && data.errorDetail) {
        console.warn('[诊断] 服务端 AI 失败，已降级 mock', data.errorDetail, data.deepseekConfig)
      }
      console.log('[诊断] 使用服务端响应', response)
      return response
    }

    console.warn('[诊断] 服务端 JSON 缺少 success/report，降级为本地 mock', data)
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
    message: MOCK_FALLBACK_MESSAGE,
    isMockFallback: true,
    debugSource: 'client-mock',
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
