import type { PlanningFormData, PlanningResponse } from '../types/planning'
import { buildLocalPlanningReport } from '../data/mockPlanningReport'
import { postApiJson } from './postApiJson'

export const PLANNING_API_PATH = '/api/planning/generate'

const MOCK_FALLBACK_MESSAGE = 'AI服务暂不可用，已展示示例教育规划方案'

/**
 * 获取教育规划：优先请求 /api/planning/generate，失败时降级本地 mock。
 */
export async function fetchPlanningReport(form: PlanningFormData): Promise<PlanningResponse> {
  const result = await postApiJson<PlanningResponse>(PLANNING_API_PATH, form, '教育规划')

  if (result.kind === 'success') {
    const data = result.data
    if (data.success && data.report) {
      const response: PlanningResponse = {
        ...data,
        isMockFallback: data.isMockFallback ?? data.report.source === 'mock',
        message: data.isMockFallback ? MOCK_FALLBACK_MESSAGE : (data.message ?? '教育规划方案生成成功'),
        debugSource: data.isMockFallback ? 'server-mock' : 'server-ai',
        errorDetail: data.errorDetail,
        deepseekConfig: data.deepseekConfig,
      }
      if (data.isMockFallback && data.errorDetail) {
        console.warn('[教育规划] 服务端 AI 失败，已降级 mock', data.errorDetail, data.deepseekConfig)
      }
      console.log('[教育规划] 使用服务端响应', response)
      return response
    }
    console.warn('[教育规划] 服务端 JSON 缺少 success/report，降级为本地 mock', data)
  } else {
    console.warn('[教育规划] API 不可用，降级为本地 mock', {
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
    report: buildLocalPlanningReport(form),
  }
}
