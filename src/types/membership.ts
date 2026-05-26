export type MembershipType =
  | 'free'
  | 'teacher_monthly'
  | 'teacher_yearly'
  | 'student_per_use'
  | 'student_yearly'

export type PlanId =
  | 'teacher_monthly'
  | 'teacher_yearly'
  | 'student_per_use'
  | 'student_yearly'

export interface MembershipState {
  membershipType: MembershipType
  subscriptionStart: string | null
  expiresAt: string | null
  /** 本月已用 AI 出题次数（教师） */
  examGenerationsUsed: number
  /** 本月已用 AI 诊断次数（学生年度会员统计用） */
  diagnosisUsed: number
  /** 单次诊断剩余次数（学生按次购买） */
  perUseDiagnosisCredits: number
  /** 免费用户是否已用过首次免费诊断 */
  hasUsedFreeDiagnosis: boolean
  /** 上次重置月度用量的月份，格式 YYYY-MM */
  lastUsageResetMonth: string
}

export interface SubscriptionPlan {
  id: PlanId
  name: string
  price: number
  priceLabel: string
  period: string
  badge?: string
  recommended?: boolean
  features: string[]
  cta: string
  role: 'teacher' | 'student'
}

export type PaymentMethod = 'wechat' | 'alipay'

export interface PermissionCheckResult {
  allowed: boolean
  reason?: string
  remaining?: number | null
  limit?: number | null
}
