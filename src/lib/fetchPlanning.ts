import type { PlanningFormData, PlanningResponse } from '../types/planning'
import { buildLocalPlanningReport } from '../data/mockPlanningReport'

const MOCK_FALLBACK_MESSAGE = 'AI服务暂不可用，已展示示例教育规划方案'

export async function fetchPlanningReport(form: PlanningFormData): Promise<PlanningResponse> {
  try {
    const response = await fetch('/api/planning/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })

    const text = await response.text()
    if (response.ok && text) {
      try {
        const data = JSON.parse(text) as PlanningResponse
        if (data.success && data.report) {
          return {
            ...data,
            isMockFallback: data.isMockFallback ?? data.report.source === 'mock',
            message: data.isMockFallback ? MOCK_FALLBACK_MESSAGE : (data.message ?? '教育规划方案生成成功'),
          }
        }
      } catch {
        // 解析失败，降级本地数据
      }
    }
  } catch {
    // 网络错误，降级本地数据
  }

  return {
    success: true,
    message: MOCK_FALLBACK_MESSAGE,
    isMockFallback: true,
    report: buildLocalPlanningReport(form),
  }
}
