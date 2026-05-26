import { useCallback, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import DashboardHeader from '../components/layout/DashboardHeader'
import PaymentModal from '../components/membership/PaymentModal'
import PlanCard from '../components/membership/PlanCard'
import SubscribedStatusPanel from '../components/membership/SubscribedStatusPanel'
import { useAuth } from '../context/AuthContext'
import { useMembership } from '../context/MembershipContext'
import { STUDENT_PLANS, TEACHER_PLANS } from '../data/membershipPlans'
import type { PlanId, SubscriptionPlan } from '../types/membership'

type PayPhase = 'idle' | 'processing' | 'success'

export default function MemberCenterPage() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const { membership, statusLabel, isPaid, subscribeToPlan, refreshMembership } = useMembership()

  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan | null>(null)
  const [payPhase, setPayPhase] = useState<PayPhase>('idle')
  const [showPlans, setShowPlans] = useState(false)
  const plansRef = useRef<HTMLDivElement>(null)

  const role = profile?.role ?? 'student'
  const plans = role === 'teacher' ? TEACHER_PLANS : STUDENT_PLANS
  const homePath = role === 'teacher' ? '/teacher/dashboard' : '/student/dashboard'

  const scrollToPlans = () => {
    setShowPlans(true)
    setTimeout(() => plansRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
  }

  const handleSubscribe = (plan: SubscriptionPlan) => {
    setSelectedPlan(plan)
  }

  const handleConfirmPayment = useCallback(() => {
    if (!selectedPlan) return
    const planId = selectedPlan.id as PlanId
    setSelectedPlan(null)
    setPayPhase('processing')

    window.setTimeout(() => {
      subscribeToPlan(planId)
      refreshMembership()
      setPayPhase('success')
      setShowPlans(false)
      window.setTimeout(() => setPayPhase('idle'), 2500)
    }, 2000)
  }, [selectedPlan, subscribeToPlan, refreshMembership])

  const roleLabel = role === 'teacher' ? '教师' : '学生'
  const showSubscribedPanel = isPaid && !showPlans && membership

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <DashboardHeader title="会员中心" backTo={homePath} backLabel="返回工作台" />

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-blue-100 sm:text-3xl">会员中心</h1>
          <p className="mt-2 text-slate-400">
            当前角色：<span className="text-cyan-300">{roleLabel}</span>
            <span className="mx-2 text-slate-600">|</span>
            会员状态：<span className="text-amber-200">{statusLabel}</span>
          </p>
          {profile && <p className="mt-1 text-xs text-slate-500">账号：{profile.phone}</p>}
        </div>

        {showSubscribedPanel ? (
          <div className="mt-8">
            <SubscribedStatusPanel
              membership={membership}
              role={role}
              statusLabel={statusLabel}
              onRenew={scrollToPlans}
              onUpgrade={scrollToPlans}
            />
          </div>
        ) : (
          <>
            {!isPaid && (
              <p className="mt-6 text-center text-sm text-slate-400">
                选择适合您的订阅方案，解锁更多 AI 能力
              </p>
            )}
            {isPaid && showPlans && (
              <p className="mt-6 text-center text-sm text-slate-400">选择续费或升级方案</p>
            )}
          </>
        )}

        {(!isPaid || showPlans) && (
          <div ref={plansRef} className="mt-8 grid gap-6 sm:grid-cols-2">
            {plans.map((plan) => (
              <PlanCard key={plan.id} plan={plan} onSubscribe={handleSubscribe} />
            ))}
          </div>
        )}

        {!isPaid && (
          <div className="mt-8 rounded-xl border border-slate-700/60 bg-slate-900/40 p-4 text-sm text-slate-400">
            <p className="font-medium text-slate-300">免费体验额度</p>
            <ul className="mt-2 space-y-1">
              {role === 'teacher' ? (
                <li>· 教师免费用户：每月可 AI 出题 3 次</li>
              ) : (
                <li>· 学生免费用户：首次 AI 诊断免费，之后需付费</li>
              )}
            </ul>
          </div>
        )}

        <div className="mt-8 text-center">
          <button
            type="button"
            onClick={() => navigate(homePath)}
            className="text-sm text-slate-500 underline-offset-2 hover:text-blue-300 hover:underline"
          >
            返回{role === 'teacher' ? '教师' : '学生'}工作台
          </button>
        </div>
      </main>

      {selectedPlan && (
        <PaymentModal
          plan={selectedPlan}
          open={!!selectedPlan}
          onClose={() => setSelectedPlan(null)}
          onConfirm={handleConfirmPayment}
        />
      )}

      {payPhase === 'processing' && (
        <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-black/75 backdrop-blur-sm">
          <div className="h-14 w-14 animate-spin rounded-full border-4 border-blue-500/30 border-t-cyan-400" />
          <p className="mt-6 text-lg font-medium text-blue-100">支付处理中...</p>
        </div>
      )}

      {payPhase === 'success' && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="rounded-2xl border border-emerald-500/40 bg-slate-900 px-10 py-8 text-center shadow-2xl">
            <p className="text-4xl">✓</p>
            <p className="mt-3 text-xl font-bold text-emerald-300">支付成功！</p>
            <p className="mt-2 text-sm text-slate-400">会员权益已生效</p>
          </div>
        </div>
      )}
    </div>
  )
}
