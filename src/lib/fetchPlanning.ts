import type { PlanningFormData, PlanningResponse } from '../types/planning'
import { buildLocalPlanningReport } from '../data/mockPlanningReport'
import { postApiJson } from './postApiJson'
import { buildPlanningRequestEnrichment } from './planningPromptEnrichment'

export const PLANNING_API_PATH = '/api/planning/generate'

const MOCK_FALLBACK_MESSAGE = 'AI服务暂不可用，已展示示例教育规划方案'

function resolvePlanningSuccessMessage(reportSource?: string, serverMessage?: string): string {
  if (serverMessage && !serverMessage.includes('数据驱动 ·')) {
    return serverMessage
  }
  switch (reportSource) {
    case 'ai-data-driven':
      return 'AI 已结合数据库与录取数据生成规划方案'
    case 'ai-data-driven-degraded':
      return 'AI 已生成规划方案（部分录取数据为层级估算，仅供参考）'
    case 'database-driven':
      return '已基于学生档案与考试记录生成数据驱动规划（AI 暂不可用）'
    case 'database-driven-degraded':
      return '已基于数据库生成规划（含层级估算录取数据，AI 暂不可用）'
    default:
      return serverMessage ?? '教育规划方案生成成功'
  }
}

function isClientMockSource(source?: string): boolean {
  return source === 'mock' || !source
}

type PlanningRequest = PlanningFormData & {
  targetUniversity?: string
  targetMajor?: string
  confirmedUniversityData?: unknown
  studentUserId?: string
  userId?: string
  _enhanced?: unknown
  _planningEnrichment?: ReturnType<typeof buildPlanningRequestEnrichment>
}

/**
 * 获取教育规划：优先请求数据驱动引擎 /api/planning/generate
 * 支持降级模式：当知识库无精确院校数据时，系统自动切换至层级估算模式
 */
export async function fetchPlanningReport(form: PlanningRequest): Promise<PlanningResponse> {
  const planningEnrichment = buildPlanningRequestEnrichment(form)
  const payload = {
    ...form,
    studentUserId: form.studentUserId || form.userId,
    userId: form.userId || form.studentUserId,
    _planningEnrichment: planningEnrichment,
  }
  const result = await postApiJson<PlanningResponse>(PLANNING_API_PATH, payload, '教育规划', {
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
    const reportSource = result.data.report.source
    const isMockFallback = isClientMockSource(reportSource)
    return {
      ...result.data,
      isMockFallback,
      message: isMockFallback
        ? MOCK_FALLBACK_MESSAGE
        : resolvePlanningSuccessMessage(reportSource, result.data.message),
      debugSource: reportSource ?? 'server-ai-data-driven',
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
