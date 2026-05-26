import type { DiagnosisFormData, DiagnosisResponse } from '../types/diagnosis'
import { buildLocalDiagnosisReport } from '../data/mockDiagnosisReport'

/**
 * 获取诊断报告：优先请求后端 /api/diagnosis/generate，
 * 失败时自动降级为前端本地模拟数据，保证始终可用。
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
          return { ...data, message: data.message ?? '诊断报告生成成功' }
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
    message: '已使用本地模拟数据生成诊断报告',
    report: buildLocalDiagnosisReport(form),
  }
}

/** 直接使用本地模拟数据，不发起网络请求 */
export function getLocalDiagnosisReport(form?: DiagnosisFormData): DiagnosisResponse {
  return {
    success: true,
    message: '诊断报告生成成功',
    report: buildLocalDiagnosisReport(form),
  }
}
