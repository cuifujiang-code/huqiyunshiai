import type {
  MembershipState,
  MembershipType,
  PermissionCheckResult,
  PlanId,
} from '../types/membership'
import type { UserRole } from './supabase'

const STORAGE_KEY = 'huaqi_membership'

function currentMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date)
  d.setMonth(d.getMonth() + months)
  return d
}

function addYears(date: Date, years: number): Date {
  const d = new Date(date)
  d.setFullYear(d.getFullYear() + years)
  return d
}

function readStore(): Record<string, MembershipState> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Record<string, MembershipState>
  } catch {
    return {}
  }
}

function writeStore(store: Record<string, MembershipState>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
}

export function createDefaultMembership(): MembershipState {
  return {
    membershipType: 'free',
    subscriptionStart: null,
    expiresAt: null,
    examGenerationsUsed: 0,
    diagnosisUsed: 0,
    perUseDiagnosisCredits: 0,
    hasUsedFreeDiagnosis: false,
    lastUsageResetMonth: currentMonth(),
  }
}

function maybeResetMonthlyUsage(state: MembershipState): MembershipState {
  const month = currentMonth()
  if (state.lastUsageResetMonth === month) return state
  return {
    ...state,
    examGenerationsUsed: 0,
    diagnosisUsed: 0,
    lastUsageResetMonth: month,
  }
}

function isExpired(state: MembershipState): boolean {
  if (!state.expiresAt) return false
  return new Date(state.expiresAt).getTime() < Date.now()
}

function normalizeExpiredSubscription(state: MembershipState): MembershipState {
  if (state.membershipType === 'free' || state.membershipType === 'student_per_use') {
    return state
  }
  if (!isExpired(state)) return state
  return {
    ...maybeResetMonthlyUsage(state),
    membershipType: 'free',
    subscriptionStart: null,
    expiresAt: null,
  }
}

export function getMembership(userId: string): MembershipState {
  const store = readStore()
  const raw = store[userId] ?? createDefaultMembership()
  const normalized = normalizeExpiredSubscription(maybeResetMonthlyUsage(raw))
  if (JSON.stringify(raw) !== JSON.stringify(normalized)) {
    store[userId] = normalized
    writeStore(store)
  }
  return normalized
}

export function saveMembership(userId: string, state: MembershipState) {
  const store = readStore()
  store[userId] = state
  writeStore(store)
}

export function getExamLimit(type: MembershipType): number | null {
  switch (type) {
    case 'free':
      return 3
    case 'teacher_monthly':
      return 100
    case 'teacher_yearly':
      return 300
    default:
      return 0
  }
}

export function getDiagnosisLimit(type: MembershipType): number | null {
  if (type === 'student_yearly') return null
  return 0
}

export function isPaidMember(state: MembershipState, role: UserRole): boolean {
  if (role === 'teacher') {
    return (
      (state.membershipType === 'teacher_monthly' || state.membershipType === 'teacher_yearly') &&
      !isExpired(state)
    )
  }
  if (state.membershipType === 'student_yearly' && !isExpired(state)) return true
  if (state.membershipType === 'student_per_use' && state.perUseDiagnosisCredits > 0) return true
  if (state.membershipType === 'free' && !state.hasUsedFreeDiagnosis) return false
  return false
}

export function getMembershipStatusLabel(state: MembershipState, role: UserRole): string {
  if (role === 'teacher') {
    if (state.membershipType === 'teacher_monthly' && !isExpired(state)) return '付费会员 · 教师月费'
    if (state.membershipType === 'teacher_yearly' && !isExpired(state)) return '付费会员 · 教师年度'
    return '免费用户'
  }
  if (state.membershipType === 'student_yearly' && !isExpired(state)) return '付费会员 · 学生年度'
  if (state.perUseDiagnosisCredits > 0) return `按次会员 · 剩余 ${state.perUseDiagnosisCredits} 次`
  if (state.membershipType === 'free' && !state.hasUsedFreeDiagnosis) return '免费用户（首次诊断免费）'
  return '免费用户'
}

export function checkExamPermission(userId: string, role: UserRole): PermissionCheckResult {
  if (role !== 'teacher') {
    return { allowed: false, reason: '仅教师账号可使用 AI 出题功能' }
  }
  const state = getMembership(userId)
  const limit = getExamLimit(state.membershipType)
  if (limit == null || limit === 0) {
    return { allowed: false, reason: '当前会员方案不支持 AI 出题，请订阅教师版会员', remaining: 0, limit: 0 }
  }
  const remaining = limit - state.examGenerationsUsed
  if (remaining <= 0) {
    return {
      allowed: false,
      reason: '本月 AI 出题次数已用完，请升级或续费会员',
      remaining: 0,
      limit,
    }
  }
  return { allowed: true, remaining, limit }
}

export function checkDiagnosisPermission(userId: string, role: UserRole): PermissionCheckResult {
  if (role !== 'student') {
    return { allowed: false, reason: '仅学生账号可使用 AI 学习诊断' }
  }
  const state = getMembership(userId)

  if (state.membershipType === 'student_yearly' && !isExpired(state)) {
    return { allowed: true, remaining: null, limit: null }
  }
  if (state.perUseDiagnosisCredits > 0) {
    return { allowed: true, remaining: state.perUseDiagnosisCredits, limit: state.perUseDiagnosisCredits }
  }
  if (!state.hasUsedFreeDiagnosis) {
    return { allowed: true, remaining: 1, limit: 1 }
  }
  return {
    allowed: false,
    reason: '免费诊断次数已用完，请购买单次诊断或订阅年度会员',
    remaining: 0,
    limit: 0,
  }
}

export function consumeExamGeneration(userId: string): MembershipState {
  const state = getMembership(userId)
  const next = {
    ...state,
    examGenerationsUsed: state.examGenerationsUsed + 1,
  }
  saveMembership(userId, next)
  return next
}

export function consumeDiagnosis(userId: string): MembershipState {
  const state = getMembership(userId)

  if (state.membershipType === 'student_yearly' && !isExpired(state)) {
    const next = { ...state, diagnosisUsed: state.diagnosisUsed + 1 }
    saveMembership(userId, next)
    return next
  }
  if (state.perUseDiagnosisCredits > 0) {
    const credits = state.perUseDiagnosisCredits - 1
    const next: MembershipState = {
      ...state,
      perUseDiagnosisCredits: credits,
      membershipType: credits > 0 ? 'student_per_use' : 'free',
    }
    saveMembership(userId, next)
    return next
  }
  if (!state.hasUsedFreeDiagnosis) {
    const next = { ...state, hasUsedFreeDiagnosis: true }
    saveMembership(userId, next)
    return next
  }
  return state
}

export function activatePlan(userId: string, planId: PlanId): MembershipState {
  const state = getMembership(userId)
  const now = new Date()
  const isoNow = now.toISOString()

  switch (planId) {
    case 'teacher_monthly':
      return saveAndReturn(userId, {
        ...state,
        membershipType: 'teacher_monthly',
        subscriptionStart: isoNow,
        expiresAt: addMonths(now, 1).toISOString(),
        examGenerationsUsed: 0,
        lastUsageResetMonth: currentMonth(),
      })
    case 'teacher_yearly':
      return saveAndReturn(userId, {
        ...state,
        membershipType: 'teacher_yearly',
        subscriptionStart: isoNow,
        expiresAt: addYears(now, 1).toISOString(),
        examGenerationsUsed: 0,
        lastUsageResetMonth: currentMonth(),
      })
    case 'student_per_use':
      return saveAndReturn(userId, {
        ...state,
        membershipType: 'student_per_use',
        perUseDiagnosisCredits: state.perUseDiagnosisCredits + 1,
        subscriptionStart: state.subscriptionStart ?? isoNow,
      })
    case 'student_yearly':
      return saveAndReturn(userId, {
        ...state,
        membershipType: 'student_yearly',
        subscriptionStart: isoNow,
        expiresAt: addYears(now, 1).toISOString(),
        diagnosisUsed: 0,
      })
    default:
      return state
  }
}

function saveAndReturn(userId: string, state: MembershipState): MembershipState {
  saveMembership(userId, state)
  return state
}

export function getUsageSummary(state: MembershipState, role: UserRole) {
  if (role === 'teacher') {
    const limit = getExamLimit(state.membershipType) ?? 0
    return {
      label: 'AI 出题',
      used: state.examGenerationsUsed,
      limit,
      unlimited: false,
    }
  }
  if (state.membershipType === 'student_yearly' && !isExpired(state)) {
    return {
      label: 'AI 诊断',
      used: state.diagnosisUsed,
      limit: null,
      unlimited: true,
    }
  }
  if (state.perUseDiagnosisCredits > 0) {
    return {
      label: '诊断次数',
      used: 0,
      limit: state.perUseDiagnosisCredits,
      unlimited: false,
    }
  }
  return {
    label: '免费诊断',
    used: state.hasUsedFreeDiagnosis ? 1 : 0,
    limit: 1,
    unlimited: false,
  }
}
