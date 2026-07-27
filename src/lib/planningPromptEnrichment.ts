import type { EnhancedPlanningFormData, PlanningFormData } from '../types/planning'
import { buildPlanningPromptEnrichment } from './planningWizardUtils'

export type PlanningPromptEnrichment = ReturnType<typeof buildPlanningPromptEnrichment> & {
  examTrendText?: string
}

/** 从表单构建发给后端的 prompt 扩展块（霍兰德 + 五维分析） */
export function buildPlanningRequestEnrichment(
  form: PlanningFormData | EnhancedPlanningFormData,
): PlanningPromptEnrichment {
  const base = buildPlanningPromptEnrichment(form as EnhancedPlanningFormData)
  return { ...base }
}
