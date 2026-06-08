import type { UniversityLookupResult } from '../types/planning'
import { postApiJson } from './postApiJson'

export async function lookupPlanningUniversity(params: {
  targetUniversity: string
  province: string
  major?: string
}): Promise<{ success: boolean; lookup?: UniversityLookupResult; message?: string }> {
  const result = await postApiJson<{ success: boolean; lookup: UniversityLookupResult }>(
    '/api/planning/university-lookup',
    {
      targetUniversity: params.targetUniversity,
      province: params.province,
      major: params.major || '通用',
    },
    '院校数据检索',
  )

  if (result.kind === 'success' && result.data.success) {
    return { success: true, lookup: result.data.lookup }
  }

  return {
    success: false,
    message: result.kind === 'success' ? result.data.lookup?.message : result.reason,
  }
}
