import { postApiJson } from './postApiJson'
import type { ExamReviewFormData, ExamReviewHistoryItem, ExamReviewReport } from '../types/examReview'

export async function submitExamReview(
  userId: string,
  form: ExamReviewFormData,
  selectedSubjects: string[],
): Promise<{ success: boolean; message?: string; report?: ExamReviewReport }> {
  const scoresJson: Record<string, { score: number; avg: number; max: number }> = {}
  for (const [subject, row] of Object.entries(form.scores)) {
    scoresJson[subject] = {
      score: Number(row.score) || 0,
      avg: Number(row.avg) || 0,
      max: Number(row.max) || 100,
    }
  }

  const result = await postApiJson<{
    success: boolean
    message?: string
    report?: ExamReviewReport
  }>(
    '/api/student/exam-review/generate',
    {
      userId,
      examName: form.examName,
      examDate: form.examDate,
      scoresJson,
      lossReasons: form.lossReasons,
      selectedSubjects,
    },
    'exam-review-generate',
    { timeoutMs: 120_000 },
  )

  if (result.kind === 'fallback') {
    return { success: false, message: result.reason }
  }
  return result.data
}

export async function fetchExamReviewHistory(
  userId: string,
): Promise<ExamReviewHistoryItem[]> {
  const result = await postApiJson<{ success: boolean; history?: ExamReviewHistoryItem[] }>(
    `/api/student/exam-review/history?userId=${encodeURIComponent(userId)}`,
    null,
    'exam-review-history',
    { method: 'GET', timeoutMs: 15_000 },
  )
  if (result.kind === 'fallback' || !result.data.success) return []
  return result.data.history || []
}
