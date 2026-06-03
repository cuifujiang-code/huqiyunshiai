import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useMembership } from '../context/MembershipContext'
import { getFeatureUsage, type FeatureKey } from '../lib/featureUsage'
import Logo from '../components/Logo'

/** 快捷操作按钮定义 */
const QUICK_ACTIONS = [
  { label: '新建组卷', path: '/teacher/exam-builder' },
  { label: '批量拆题', path: '/teacher/batch-upload' },
  { label: '新建备课', path: '/teacher/lesson-prep' },
  { label: '快速导出PDF', path: '/teacher/exam' },
] as const

/** 上区高频核心卡片 */
const CORE_CARDS = [
  {
    icon: '🧠',
    title: 'AI智能出题',
    desc: '按需自定义题型、难度，一键生成试卷',
    path: '/teacher/exam',
    badge: '已生成 12 套试卷',
  },
  {
    icon: '📚',
    title: '我的题库',
    desc: '管理所有自建试题，支持 PDF 批量导入',
    path: '/teacher/question-bank',
    badge: '题库 246 道试题',
  },
  {
    icon: '📄',
    title: '智能组卷',
    desc: '从题库选题，一键合成标准试卷',
    path: '/teacher/exam-builder',
    badge: '已组卷 8 份',
  },
  {
    icon: '📥',
    title: '批量拆题',
    desc: '上传 PDF 试卷自动拆题入库',
    path: '/teacher/task-center',
    badge: '已拆 183 道',
  },
]

/** 左下：备课出书专区 */
const LESSON_BOOK_CARDS = [
  { icon: '📋', title: '智能备课', desc: '从题库选题或 AI 生成，保存备课方案', path: '/teacher/lesson-prep', usageKey: 'lesson' as FeatureKey },
  { icon: '📖', title: '讲义制作', desc: '四种模式含自定义模板，封面/目录/页眉页脚', path: '/teacher/handout-builder', usageKey: 'handout' as FeatureKey },
  { icon: '📕', title: '教辅出书', desc: '题库批量选题、知识网络图、统一排版导出', path: '/teacher/book-builder', usageKey: 'book' as FeatureKey },
]

/** 右下：学情规划专区 */
const PLANNING_CARDS = [
  {
    icon: '🎓',
    title: '学生学习规划',
    desc: '已创建 5 份学生学习方案',
    path: '/teacher/planning',
  },
  {
    icon: '📈',
    title: '学习进度追踪',
    desc: '已跟踪 23 名学生进度',
    path: '/teacher/student-progress',
  },
]

export default function TeacherDashboard() {
  const navigate = useNavigate()
  const { profile, signOut } = useAuth()
  const { statusLabel } = useMembership()
  const [usage, setUsage] = useState<Record<string, number>>({})
  const [showOnboarding, setShowOnboarding] = useState(false)

  useEffect(() => {
    if (profile?.id) setUsage(getFeatureUsage(profile.id))
  }, [profile?.id])

  // 首次进入弹出新手提示（每会话一次）
  useEffect(() => {
    const seen = sessionStorage.getItem('dashboard_onboarding_seen')
    if (!seen) {
      setShowOnboarding(true)
      sessionStorage.setItem('dashboard_onboarding_seen', '1')
    }
  }, [])

  const handleSignOut = async () => {
    await signOut()
    navigate('/login', { replace: true })
  }

  const displayName = profile?.name || profile?.email?.split('@')[0] || '管理员'
  const roleLabel = profile?.role === 'admin' ? '管理员' : '教师'

  return (
    <div className="min-h-screen text-[#E8ECF3]" style={{ backgroundColor: '#121722' }}>
      {/* ========== 顶部通栏 ========== */}
      <header className="border-b border-white/[0.06]" style={{ backgroundColor: '#121722' }}>
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3">
          {/* 左：LOGO */}
          <div className="flex items-center gap-2 shrink-0">
            <Logo size="sm" />
          </div>

          {/* 中：4 个快捷悬浮按钮 */}
          <div className="flex items-center gap-2">
            {QUICK_ACTIONS.map((act) => (
              <button
                key={act.path}
                type="button"
                onClick={() => navigate(act.path)}
                className="btn-brand text-[13px] px-4 py-2"
              >
                {act.label}
              </button>
            ))}
          </div>

          {/* 右：账号 + 会员 + 退出 */}
          <div className="flex items-center gap-3 shrink-0">
            <span className="text-sm text-[#8A94A9]">
              {displayName}
              <span className="ml-1 text-xs text-[#2584FF]">({roleLabel})</span>
            </span>
            <button
              type="button"
              onClick={() => navigate('/member-center')}
              className="btn-gold text-xs"
            >
              💎 会员中心
            </button>
            <button
              type="button"
              onClick={handleSignOut}
              className="text-sm text-[#8A94A9] transition hover:text-[#E8ECF3]"
            >
              退出登录
            </button>
          </div>
        </div>
      </header>

      {/* ========== 新手提示 ========== */}
      {showOnboarding && (
        <div className="mx-auto mt-3 max-w-6xl px-5">
          <div className="onboarding-tip flex items-center justify-between">
            <span>👋 欢迎使用教师工作台！点击任意卡片快速进入功能模块</span>
            <button
              type="button"
              onClick={() => setShowOnboarding(false)}
              className="ml-3 text-white/70 hover:text-white text-xs"
            >
              ✕ 知道了
            </button>
          </div>
        </div>
      )}

      {/* ========== 主体区域 ========== */}
      <main className="mx-auto max-w-6xl px-5 py-6">
        {/* --- 上区：高频核心区（4卡片） --- */}
        <section className="mb-6" style={{ minHeight: '55vh' }}>
          <div className="grid grid-cols-4 gap-6 h-full">
            {CORE_CARDS.map((card) => (
              <button
                key={card.path}
                type="button"
                onClick={() => navigate(card.path)}
                className="card-lift flex flex-col items-center justify-center p-8 text-center cursor-pointer"
              >
                <span className="text-5xl mb-4">{card.icon}</span>
                <h3 className="text-lg font-bold text-[#E8ECF3] mb-2">{card.title}</h3>
                <p className="text-sm text-[#8A94A9] mb-4 leading-relaxed">{card.desc}</p>
                <span className="text-xs font-semibold text-[#2584FF] mb-3">{card.badge}</span>
                <span className="btn-brand text-xs px-4 py-1.5">快速进入 →</span>
              </button>
            ))}
          </div>
        </section>

        {/* --- 下区：双栏 --- */}
        <div className="grid grid-cols-2 gap-6">
          {/* 左下：备课出书专区（3卡片竖向） */}
          <section>
            <h2 className="text-sm font-semibold text-[#8A94A9] mb-3 uppercase tracking-wide">备课出书专区</h2>
            <div className="flex flex-col gap-3">
              {LESSON_BOOK_CARDS.map((card) => {
                const count = card.usageKey ? (usage[card.usageKey] ?? 0) : undefined
                return (
                  <button
                    key={card.path}
                    type="button"
                    onClick={() => navigate(card.path)}
                    className="card-lift flex items-center gap-4 px-5 py-4 text-left cursor-pointer"
                  >
                    <span className="text-2xl shrink-0">{card.icon}</span>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-semibold text-[#E8ECF3]">{card.title}</h3>
                      <p className="text-xs text-[#8A94A9] mt-0.5 truncate">{card.desc}</p>
                    </div>
                    {count != null && count > 0 && (
                      <span className="shrink-0 rounded-full bg-white/[0.06] px-2.5 py-0.5 text-[11px] text-[#2584FF]">
                        已用 {count} 次
                      </span>
                    )}
                    <span className="shrink-0 text-[#8A94A9] text-sm">→</span>
                  </button>
                )
              })}
            </div>
          </section>

          {/* 右下：学情规划专区（2卡片横向） */}
          <section>
            <h2 className="text-sm font-semibold text-[#8A94A9] mb-3 uppercase tracking-wide">学情规划专区</h2>
            <div className="grid grid-cols-2 gap-3">
              {PLANNING_CARDS.map((card) => (
                <button
                  key={card.path}
                  type="button"
                  onClick={() => navigate(card.path)}
                  className="card-lift flex flex-col items-center justify-center p-6 text-center cursor-pointer"
                >
                  <span className="text-3xl mb-3">{card.icon}</span>
                  <h3 className="text-sm font-semibold text-[#E8ECF3] mb-1.5">{card.title}</h3>
                  <p className="text-xs text-[#2584FF] font-medium">{card.desc}</p>
                </button>
              ))}
            </div>
          </section>
        </div>
      </main>

      {/* ========== 底部状态栏 ========== */}
      <footer className="border-t border-white/[0.06] px-5 py-3" style={{ backgroundColor: '#121722' }}>
        <div className="mx-auto max-w-6xl flex items-center gap-4 text-xs text-[#8A94A9]">
          <span>当前账号：<strong className="text-[#E8ECF3]">{displayName}</strong>（{roleLabel}）</span>
          <span className="text-white/[0.12]">|</span>
          <span>题库总数量：<strong className="text-[#E8ECF3]" style={{ fontWeight: 700 }}>246</strong> 道试题</span>
        </div>
      </footer>
    </div>
  )
}
