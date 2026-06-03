import { useNavigate } from 'react-router-dom'
import DashboardHeader from '../components/layout/DashboardHeader'
import { useAuth } from '../context/AuthContext'

const CARDS = [
  { emoji: '📝', title: 'AI智能出题', desc: '快速生成整卷试题并导出 PDF', path: '/teacher/exam', accent: 'cyan' },
  { emoji: '📚', title: '我的题库', desc: '管理个人题目库，支持导入拆题与批量操作', path: '/teacher/question-bank', accent: 'blue' },
  { emoji: '🗂️', title: '题库中心', desc: '目录树管理题目，筛选搜索与拖拽分类', path: '/teacher/question-library', accent: 'sky' },
  { emoji: '📥', title: '大批量拆题', desc: '上传 PDF/Word 试卷，AI 自动拆题入库', path: '/teacher/batch-upload', accent: 'teal' },
  { emoji: '📋', title: '智能备课', desc: '从题库选题或 AI 生成，保存备课方案', path: '/teacher/lesson-prep', accent: 'indigo' },
  { emoji: '📄', title: '智能组卷', desc: '按题型分布从题库智能组卷，不足 AI 补充', path: '/teacher/exam-builder', accent: 'violet' },
  { emoji: '📖', title: '讲义制作', desc: '校内/校外/针对性三种讲义模板', path: '/teacher/handout-builder', accent: 'purple' },
  { emoji: '📕', title: '辅导书制作', desc: '章节目录树管理，全书预览与导出', path: '/teacher/book-builder', accent: 'rose' },
  { emoji: '🎓', title: 'AI教育规划', desc: '为学生生成个性化培养路径与阶段任务', path: '/teacher/planning', accent: 'emerald' },
]

const ADMIN_CARD = {
  emoji: '🛡️',
  title: '后台管理',
  desc: '用户统计、会员开通续费、收入概览',
  path: '/admin/dashboard',
  accent: 'amber',
} as const

export default function TeacherDashboard() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const cards = profile?.role === 'admin' ? [...CARDS, ADMIN_CARD] : CARDS

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <DashboardHeader title="教师工作台" featureNavRole="teacher" />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-blue-100 sm:text-3xl">华祺云师 · 教师教学工具链</h1>
          <p className="mt-2 text-sm text-slate-400">题库 → 备课 → 组卷 → 讲义 → 辅导书，一站式教学赋能</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((c) => (
            <button
              key={c.path}
              type="button"
              onClick={() => navigate(c.path)}
              className="group rounded-2xl border border-slate-700/80 bg-slate-900/60 p-5 text-left transition hover:-translate-y-0.5 hover:border-blue-500/40 hover:bg-slate-900 hover:shadow-lg hover:shadow-blue-900/20"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="text-3xl">{c.emoji}</span>
                <span className="text-cyan-400 opacity-0 transition group-hover:opacity-100">→</span>
              </div>
              <h3 className="mt-3 font-semibold text-blue-100 group-hover:text-cyan-200">{c.title}</h3>
              <p className="mt-1.5 text-xs leading-relaxed text-slate-400">{c.desc}</p>
            </button>
          ))}
        </div>
      </main>
    </div>
  )
}
