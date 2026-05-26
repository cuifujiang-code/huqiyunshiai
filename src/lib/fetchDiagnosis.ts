import type { DiagnosisFormData, DiagnosisResponse } from '../types/diagnosis'
import { buildLocalDiagnosisReport } from '../data/mockDiagnosisReport'
import { postApiJson } from './postApiJson'

export const DIAGNOSIS_API_PATH = '/api/diagnosis/generate'

const MOCK_FALLBACK_MESSAGE = 'AI服务暂不可用，已展示示例诊断报告'

/**
 * 获取诊断报告：优先请求后端 /api/diagnosis/generate（DeepSeek AI），
 * 仅在 API 调用失败或返回非 JSON 时降级为前端本地模拟数据。
 */
export async function fetchDiagnosisReport(form: DiagnosisFormData): Promise<DiagnosisResponse> {
  const result = await postApiJson<DiagnosisResponse>(DIAGNOSIS_API_PATH, form, '诊断')

  if (result.kind === 'success') {
    const data = result.data
    if (data.success && data.report) {
      const response: DiagnosisResponse = {
        ...data,
        isMockFallback: data.isMockFallback ?? (data.report as { source?: string }).source === 'mock',
        message: data.isMockFallback ? MOCK_FALLBACK_MESSAGE : (data.message ?? '诊断报告生成成功'),
        debugSource: data.isMockFallback ? 'server-mock' : 'server-ai',
        errorDetail: data.errorDetail,
        deepseekConfig: data.deepseekConfig,
      }
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
