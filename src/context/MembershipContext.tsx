import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { PlanId, MembershipState } from '../types/membership'
import { useAuth } from './AuthContext'
import {
  activatePlan,
  checkDiagnosisPermission,
  checkExamPermission,
  consumeDiagnosis,
  consumeExamGeneration,
  getMembership,
  getMembershipStatusLabel,
  getUsageSummary,
  isPaidMember,
} from '../lib/membershipStorage'
import type { UserRole } from '../lib/supabase'

interface MembershipContextValue {
  membership: MembershipState | null
  statusLabel: string
  isPaid: boolean
  usageSummary: ReturnType<typeof getUsageSummary> | null
  refreshMembership: () => void
  subscribeToPlan: (planId: PlanId) => void
  checkExam: () => ReturnType<typeof checkExamPermission>
  checkDiagnosis: () => ReturnType<typeof checkDiagnosisPermission>
  deductExamCredit: () => void
  deductDiagnosisCredit: () => void
}

const MembershipContext = createContext<MembershipContextValue | undefined>(undefined)

export function MembershipProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth()
  const [membership, setMembership] = useState<MembershipState | null>(null)

  const refreshMembership = useCallback(() => {
    if (!profile?.id) {
      setMembership(null)
      return
    }
    setMembership(getMembership(profile.id))
  }, [profile?.id])

  useEffect(() => {
    refreshMembership()
  }, [refreshMembership])

  const subscribeToPlan = useCallback(
    (planId: PlanId) => {
      if (!profile?.id) return
      const next = activatePlan(profile.id, planId)
      setMembership(next)
    },
    [profile?.id],
  )

  const checkExam = useCallback(() => {
    if (!profile?.id) return { allowed: false, reason: '请先登录' }
    return checkExamPermission(profile.id, profile.role as UserRole)
  }, [profile?.id, profile?.role])

  const checkDiagnosis = useCallback(() => {
    if (!profile?.id) return { allowed: false, reason: '请先登录' }
    return checkDiagnosisPermission(profile.id, profile.role as UserRole)
  }, [profile?.id, profile?.role])

  const deductExamCredit = useCallback(() => {
    if (!profile?.id) return
    setMembership(consumeExamGeneration(profile.id))
  }, [profile?.id])

  const deductDiagnosisCredit = useCallback(() => {
    if (!profile?.id) return
    setMembership(consumeDiagnosis(profile.id))
  }, [profile?.id])

  const role = (profile?.role ?? 'student') as UserRole
  const statusLabel = membership ? getMembershipStatusLabel(membership, role) : '免费用户'
  const isPaid = membership ? isPaidMember(membership, role) : false
  const usageSummary = membership ? getUsageSummary(membership, role) : null

  const value = useMemo(
    () => ({
      membership,
      statusLabel,
      isPaid,
      usageSummary,
      refreshMembership,
      subscribeToPlan,
      checkExam,
      checkDiagnosis,
      deductExamCredit,
      deductDiagnosisCredit,
    }),
    [
      membership,
      statusLabel,
      isPaid,
      usageSummary,
      refreshMembership,
      subscribeToPlan,
      checkExam,
      checkDiagnosis,
      deductExamCredit,
      deductDiagnosisCredit,
    ],
  )

  return <MembershipContext.Provider value={value}>{children}</MembershipContext.Provider>
}

export function useMembership() {
  const ctx = useContext(MembershipContext)
  if (!ctx) throw new Error('useMembership 必须在 MembershipProvider 内使用')
  return ctx
}
