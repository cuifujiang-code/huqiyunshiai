import type { PlanningFormData, PlanningReport, SavedPlanningRecord } from '../types/planning'

const STORAGE_KEY = 'huaqi_planning_reports'

function readAll(): SavedPlanningRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as SavedPlanningRecord[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeAll(records: SavedPlanningRecord[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records))
}

export function savePlanningRecord(params: {
  form: PlanningFormData
  report: PlanningReport
  createdBy: 'teacher' | 'student'
  creatorUserId?: string
  studentUserId?: string
}): SavedPlanningRecord {
  const record: SavedPlanningRecord = {
    id: `plan_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    studentName: params.form.studentName,
    studentUserId: params.studentUserId,
    createdBy: params.createdBy,
    creatorUserId: params.creatorUserId,
    form: params.form,
    report: params.report,
    createdAt: new Date().toISOString(),
  }
  const all = readAll()
  all.unshift(record)
  writeAll(all.slice(0, 50))
  return record
}

/** 学生查看：自己创建的 + 教师为其创建的（按姓名或 userId 匹配） */
export function getStudentPlanningRecords(studentName: string, studentUserId?: string): SavedPlanningRecord[] {
  return readAll().filter(
    (r) =>
      (r.createdBy === 'student' && r.studentUserId === studentUserId) ||
      (r.createdBy === 'teacher' &&
        (r.studentUserId === studentUserId || r.studentName.trim() === studentName.trim())),
  )
}

/** 教师查看：自己创建的全部记录 */
export function getTeacherPlanningRecords(creatorUserId?: string): SavedPlanningRecord[] {
  return readAll().filter((r) => r.createdBy === 'teacher' && (!creatorUserId || r.creatorUserId === creatorUserId))
}

export function deletePlanningRecord(id: string) {
  writeAll(readAll().filter((r) => r.id !== id))
}
