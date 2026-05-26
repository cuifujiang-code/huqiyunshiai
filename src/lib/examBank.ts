import type { ExamPaper } from '../types/exam'

const BANK_KEY = 'huaqi_exam_bank'

export function saveExamToBank(exam: ExamPaper): void {
  const existing = loadExamBank()
  const item = {
    ...exam,
    savedAt: new Date().toISOString(),
  }
  existing.unshift(item)
  localStorage.setItem(BANK_KEY, JSON.stringify(existing.slice(0, 50)))
}

export function loadExamBank(): (ExamPaper & { savedAt?: string })[] {
  try {
    return JSON.parse(localStorage.getItem(BANK_KEY) ?? '[]')
  } catch {
    return []
  }
}
