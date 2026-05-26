import { Link } from 'react-router-dom'
import Logo from '../components/Logo'
import { ALL_PLANS } from '../data/membershipPlans'

const FEATURES = [
  {
    icon: '📝',
    title: 'AI智能出题',
    desc: '输入教学需求，一键生成完整试卷。支持选择题、填空题、计算题与实验探究题，可导出 PDF。',
    tag: '教师核心功能',
  },
  {
    icon: '📊',
    title: '学习诊断报告',
    desc: '基于考试数据生成 AI 诊断报告，包含失分归因、薄弱知识点、错题解析与 14 天提升计划。',
    tag: '学生核心功能',
  },
  {
    icon: '📁',
    title: '教学资产管理',
    desc: '试卷自动保存至个人题库，诊断报告可存档分享，会员方案灵活订阅，助力教学全流程数字化。',
    tag: '教师 & 学生',
  },
]

function loginHref(role: 'teacher' | 'student', redirect?: string) {
  const params = new URLSearchParams({ role })
  if (redirect) params.set('redirect', redirect)
  return `/login?${params.toString()}`
}

export default function HomePage() {
  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <header className="sticky top-0 z-40 border-b border-blue-500/20 bg-slate-950/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <Link to="/" className="flex items-center gap-3">
            <Logo size="sm" />
            <span className="hidden text-sm font-medium text-blue-200 sm:inline">华祺云师AI</span>
          </Link>
          <nav className="flex items-center gap-2 sm:gap-4">
            <a href="#features" className="hidden text-sm text-slate-400 hover:text-blue-300 sm:inline">
              功能
            </a>
            <a href="#pricing" className="hidden text-sm text-slate-400 hover:text-blue-300 sm:inline">
              价格
            </a>
            <Link
              to="/login"
              className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 transition hover:border-blue-500/50"
            >
              登录
            </Link>
          </nav>
        </div>
      </header>

      <section className="relative overflow-hidden px-4 pb-20 pt-16 sm:px-6 sm:pb-28 sm:pt-24">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-900/40 via-slate-950 to-slate-950" />
        <div className="relative mx-auto max-w-4xl text-center">
          <p className="mb-4 inline-block rounded-full border border-blue-500/30 bg-blue-500/10 px-4 py-1 text-xs text-cyan-300">
            演示版 · 模拟 AI 数据 · 即刻体验
          </p>
          <h1 className="text-3xl font-bold leading-tight tracking-tight text-white sm:text-5xl lg:text-6xl">
            <span className="bg-gradient-to-r from-blue-300 via-cyan-200 to-blue-400 bg-clip-text text-transparent">
              华祺云师AI
            </span>
            <br />
            <span className="mt-2 block text-2xl text-blue-100 sm:text-3xl lg:text-4xl">
              智能教学工具箱
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-slate-400 sm:text-lg">
            AI助教 + 学情诊断 + 志愿规划，为每位教师打造的专属 AI 教学助手
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              to={loginHref('teacher', '/teacher/dashboard')}
              className="w-full rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 px-8 py-4 text-base font-semibold text-white shadow-lg shadow-blue-600/30 transition hover:from-blue-500 hover:to-cyan-400 sm:w-auto"
            >
              我是教师，开始使用
            </Link>
            <Link
              to={loginHref('student', '/student/diagnosis')}
              className="w-full rounded-xl border border-blue-400/50 bg-blue-500/10 px-8 py-4 text-base font-semibold text-blue-100 transition hover:border-cyan-400/60 hover:bg-blue-500/20 sm:w-auto"
            >
              我是学生，查看诊断
            </Link>
          </div>
        </div>
      </section>

      <section id="features" className="border-t border-blue-500/10 bg-slate-900/30 px-4 py-16 sm:px-6 sm:py-20">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-center text-2xl font-bold text-blue-100 sm:text-3xl">三大核心功能</h2>
          <p className="mt-2 text-center text-slate-400">覆盖出题、诊断、资产管理的完整教学闭环</p>
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="group rounded-2xl border border-blue-500/20 bg-slate-900/60 p-6 transition duration-300 hover:-translate-y-1 hover:border-blue-400/40 hover:shadow-lg hover:shadow-blue-900/20"
              >
                <span className="text-3xl">{f.icon}</span>
                <span className="ml-2 rounded-full bg-blue-500/10 px-2 py-0.5 text-xs text-blue-300">{f.tag}</span>
                <h3 className="mt-4 text-lg font-semibold text-white">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="pricing" className="border-t border-blue-500/10 px-4 py-16 sm:px-6 sm:py-20">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-center text-2xl font-bold text-blue-100 sm:text-3xl">价格方案</h2>
          <p className="mt-2 text-center text-slate-400">灵活订阅，登录后在会员中心完成模拟支付</p>
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {ALL_PLANS.map((plan) => (
              <div
                key={plan.id}
                className={`relative flex flex-col rounded-2xl border bg-slate-900/60 p-5 transition duration-300 hover:-translate-y-1 ${
                  plan.recommended
                    ? 'border-amber-400/60 shadow-lg shadow-amber-500/10'
                    : 'border-blue-500/20 hover:border-blue-400/40'
                }`}
              >
                {plan.badge && (
                  <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-amber-500 to-yellow-400 px-3 py-0.5 text-xs font-bold text-slate-900">
                    {plan.badge}
                  </span>
                )}
                <h3 className="text-sm font-semibold text-blue-100">{plan.name}</h3>
                <p className="mt-2 text-xl font-bold text-white">{plan.priceLabel}</p>
                <ul className="mt-4 flex-1 space-y-2">
                  {plan.features.slice(0, 3).map((feat) => (
                    <li key={feat} className="flex gap-1.5 text-xs text-slate-400">
                      <span className="text-cyan-400">✓</span>
                      {feat}
                    </li>
                  ))}
                </ul>
                <Link
                  to={loginHref(plan.role, '/member-center')}
                  className={`mt-4 block rounded-xl py-2.5 text-center text-sm font-semibold transition ${
                    plan.recommended
                      ? 'bg-gradient-to-r from-amber-500 to-yellow-400 text-slate-900 hover:from-amber-400'
                      : 'bg-gradient-to-r from-blue-600 to-cyan-500 text-white hover:from-blue-500'
                  }`}
                >
                  {plan.cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-800 px-4 py-8 text-center text-sm text-slate-500 sm:px-6">
        <p>华祺云师AI · 演示版 · 所有 AI 功能均使用模拟数据</p>
        <p className="mt-2">
          <Link to="/login" className="text-blue-400 hover:underline">
            登录
          </Link>
          <span className="mx-2">·</span>
          <a href="#pricing" className="text-blue-400 hover:underline">
            查看价格
          </a>
        </p>
      </footer>
    </div>
  )
}
