import type { PlanningFormData, PlanningResponse } from '../types/planning'
import { buildLocalPlanningReport } from '../data/mockPlanningReport'
import { postApiJson } from './postApiJson'

export const PLANNING_API_PATH = '/api/planning/generate'

const MOCK_FALLBACK_MESSAGE = 'AI服务暂不可用，已展示示例教育规划方案'

type PlanningRequest = PlanningFormData & {
  targetUniversity?: string
  targetMajor?: string
  confirmedUniversityData?: unknown
  _enhanced?: unknown
}

/**
 * 获取教育规划：优先请求数据驱动引擎 /api/planning/generate
 * 422（无知识库数据）时抛出错误，禁止降级 mock
 */
export async function fetchPlanningReport(form: PlanningRequest): Promise<PlanningResponse> {
  const result = await postApiJson<PlanningResponse>(PLANNING_API_PATH, form, '教育规划', {
    timeoutMs: 300000,
  })

  if (result.kind === 'fallback') {
    if (result.status === 422) {
      throw new Error(result.reason.replace(/^HTTP 422:\s*/, ''))
    }
    console.warn('[教育规划] API 不可用，降级为本地 mock', {
      reason: result.reason,
      status: result.status,
    })
  } else if (result.data.success === false) {
    throw new Error(result.data.message ?? '教育规划生成失败')
  } else if (result.data.report) {
    return {
      ...result.data,
      isMockFallback: false,
      message: result.data.message ?? '教育规划方案生成成功',
      debugSource: 'server-ai-data-driven',
    }
  }

  return {
    success: true,
    message: MOCK_FALLBACK_MESSAGE,
    isMockFallback: true,
    debugSource: 'client-mock',
    report: buildLocalPlanningReport(form),
  }
}
