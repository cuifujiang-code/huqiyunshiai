import { useNavigate } from 'react-router-dom'
import DashboardHeader from '../components/layout/DashboardHeader'
import { useAuth } from '../context/AuthContext'
import { useMembership } from '../context/MembershipContext'

const FEATURES = [
  {
    icon: '📊',
    title: 'AI学习诊断',
    desc: '输入考试信息，获取失分归因、薄弱知识点与提升计划',
    path: '/student/diagnosis',
    cta: '开始诊断',
  },
  {
    icon: '🎯',
    title: 'AI教育规划',
    desc: '基于年级、兴趣与目标，生成个性化培养路径与阶段性任务',
    path: '/student/planning',
    cta: '查看规划',
  },
  {
    icon: '📷',
    title: '拍照搜题',
    desc: '拍照或上传题目，OCR 识别后智能搜题，优先匹配题库标准答案',
    path: '/student/photo-search',
    cta: '开始搜题',
  },
]

export default function StudentDashboard() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const { statusLabel, usageSummary } = useMembership()

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <DashboardHeader title="学生学习中心" featureNavRole="student" />

      <main className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
        <div className="mb-8 text-center">
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
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          {FEATURES.map((f) => (
            <div
              key={f.path}
              className="group rounded-2xl border border-blue-500/20 bg-slate-900/60 p-6 text-center shadow-xl shadow-blue-900/10 transition hover:-translate-y-1 hover:border-blue-400/40"
            >
              <span className="text-4xl">{f.icon}</span>
              <h3 className="mt-4 text-lg font-semibold text-blue-100">{f.title}</h3>
              <p className="mt-2 text-sm text-slate-400">{f.desc}</p>
              <button
                type="button"
                onClick={() => navigate(f.path)}
                className="mt-6 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-600/30 transition hover:from-blue-500 hover:to-cyan-400"
              >
                {f.cta}
              </button>
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}
