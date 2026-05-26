import type { DiagnosisFormData, DiagnosisResponse } from '../types/diagnosis'
import { buildLocalDiagnosisReport } from '../data/mockDiagnosisReport'

const MOCK_FALLBACK_MESSAGE = 'AI服务暂不可用，已展示示例诊断报告'

/**
 * 获取诊断报告：优先请求后端 /api/diagnosis/generate（DeepSeek AI），
 * 失败时自动降级为前端本地模拟数据。
 */
export async function fetchDiagnosisReport(form: DiagnosisFormData): Promise<DiagnosisResponse> {
  try {
    const response = await fetch('/api/diagnosis/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })

    const text = await response.text()
    if (response.ok && text) {
      try {
        const data = JSON.parse(text) as DiagnosisResponse
        if (data.success && data.report) {
          return {
            ...data,
            isMockFallback: data.isMockFallback ?? false,
            message: data.isMockFallback ? MOCK_FALLBACK_MESSAGE : (data.message ?? '诊断报告生成成功'),
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
