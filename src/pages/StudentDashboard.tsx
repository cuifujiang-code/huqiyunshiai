import { useNavigate } from 'react-router-dom'
import DashboardHeader from '../components/layout/DashboardHeader'
import { useAuth } from '../context/AuthContext'
import { useMembership } from '../context/MembershipContext'

export default function StudentDashboard() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const { statusLabel, usageSummary } = useMembership()

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <DashboardHeader title="学生学习中心" />

      <main className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
        <div className="rounded-2xl border border-blue-500/20 bg-slate-900/60 p-8 text-center shadow-xl shadow-blue-900/10">
          <h2 className="text-2xl font-semibold text-blue-100 sm:text-3xl">华祺云师AI · 学生学习中心</h2>
          <p className="mt-4 text-slate-400">选择以下功能开始学习</p>
          {profile && <p className="mt-2 text-sm text-slate-500">当前账号：{profile.phone}</p>}
          <p className="mt-1 text-sm text-amber-200/90">{statusLabel}</p>
          {usageSummary && (
            <p className="mt-1 text-xs text-slate-500">
              {usageSummary.unlimited
                ? `${usageSummary.label}：无限次`
                : `${usageSummary.label}：${usageSummary.used} / ${usageSummary.limit} 次`}
            </p>
          )}
          <button
            type="button"
            onClick={() => navigate('/student/diagnosis')}
            className="mt-8 inline-block rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 px-8 py-3.5 text-sm font-semibold text-white shadow-lg shadow-blue-600/30 transition hover:from-blue-500 hover:to-cyan-400"
          >
            AI学习诊断
          </button>
        </div>
      </main>
    </div>
  )
}
