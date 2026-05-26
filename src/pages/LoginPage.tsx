import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import Logo from '../components/Logo'
import { useAuth } from '../context/AuthContext'
import { mockSignInWithPhone } from '../lib/mockAuth'
import type { UserRole } from '../lib/supabase'

function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.startsWith('86') && digits.length === 13) {
    return `+${digits}`
  }
  if (digits.length === 11) {
    return `+86${digits}`
  }
  if (phone.startsWith('+')) {
    return phone
  }
  return `+86${digits}`
}

function defaultDashboard(role: UserRole) {
  return role === 'teacher' ? '/teacher/dashboard' : '/student/dashboard'
}

function resolveRedirect(role: UserRole, redirectParam: string | null) {
  if (!redirectParam || !redirectParam.startsWith('/')) return defaultDashboard(role)
  if (redirectParam.startsWith('/teacher/') && role !== 'teacher') return defaultDashboard(role)
  if (redirectParam.startsWith('/student/') && role !== 'student') return defaultDashboard(role)
  return redirectParam
}

export default function LoginPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { profile, ensureProfile, applyLocalMockProfile, isAuthenticated } = useAuth()

  const [phone, setPhone] = useState('')
  const [role, setRole] = useState<UserRole>('student')
  const [otp, setOtp] = useState('')
  const [otpSent, setOtpSent] = useState(false)
  const [countdown, setCountdown] = useState(0)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    const roleParam = searchParams.get('role')
    if (roleParam === 'teacher' || roleParam === 'student') {
      setRole(roleParam)
    }
  }, [searchParams])

  useEffect(() => {
    if (isAuthenticated && profile) {
      const target = resolveRedirect(profile.role, searchParams.get('redirect'))
      navigate(target, { replace: true })
    }
  }, [isAuthenticated, profile, navigate, searchParams])

  useEffect(() => {
    if (countdown <= 0) return
    const timer = window.setTimeout(() => setCountdown((c) => c - 1), 1000)
    return () => window.clearTimeout(timer)
  }, [countdown])

  const validatePhone = (): string | null => {
    const formattedPhone = formatPhone(phone.trim())
    if (!/^\+86\d{11}$/.test(formattedPhone)) {
      setError('请输入有效的 11 位中国大陆手机号')
      return null
    }
    return formattedPhone
  }

  /** 模拟发送验证码：不调用短信接口，仅展示验证码输入框 */
  const handleSendOtp = async () => {
    setError('')
    setMessage('')

    if (!validatePhone()) return

    setOtpSent(true)
    setCountdown(60)
    setOtp('123456')
    setMessage('模拟验证码已发送（开发模式：可输入任意 6 位数字）')
  }

  /** 模拟确认登录：跳过短信校验，使用 signInWithPassword 登录虚拟账号 */
  const handleVerifyOtp = async () => {
    setError('')
    setMessage('')

    const formattedPhone = validatePhone()
    if (!formattedPhone) return

    if (!otp.trim()) {
      setError('请输入验证码')
      return
    }

    setLoading(true)
    try {
      const result = await mockSignInWithPhone(formattedPhone, role)

      if (result.mode === 'local') {
        applyLocalMockProfile(result.profile)
        navigate(resolveRedirect(result.profile.role, searchParams.get('redirect')), { replace: true })
        return
      }

      const userProfile = await ensureProfile(formattedPhone, role, result.session.user.id)
      if (!userProfile) {
        throw new Error('登录成功但无法创建用户资料')
      }

      navigate(resolveRedirect(userProfile.role, searchParams.get('redirect')), { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 px-4 py-10">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 -left-32 h-96 w-96 rounded-full bg-blue-600/20 blur-3xl" />
        <div className="absolute -right-32 -bottom-32 h-96 w-96 rounded-full bg-cyan-500/15 blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        <div className="mb-8 text-center">
          <Logo />
          <h1 className="mt-6 bg-gradient-to-r from-blue-300 via-cyan-200 to-blue-400 bg-clip-text text-3xl font-bold tracking-wide text-transparent sm:text-4xl">
            华祺云师AI
          </h1>
          <p className="mt-2 text-sm text-slate-400">智慧教育 SaaS 平台 · 手机号快捷登录</p>
          <Link to="/" className="mt-3 inline-block text-xs text-blue-400 hover:underline">
            ← 返回首页
          </Link>
        </div>
        <div className="rounded-2xl border border-blue-500/20 bg-slate-900/80 p-6 shadow-2xl shadow-blue-900/20 backdrop-blur-sm sm:p-8">
          <div className="space-y-5">
            <div>
              <label htmlFor="phone" className="mb-1.5 block text-sm font-medium text-slate-300">
                手机号
              </label>
              <input
                id="phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="请输入 11 位手机号"
                className="w-full rounded-xl border border-slate-700 bg-slate-800/80 px-4 py-3 text-white placeholder-slate-500 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
              />
            </div>
            <div>
              <label htmlFor="role" className="mb-1.5 block text-sm font-medium text-slate-300">
                身份角色
              </label>
              <select
                id="role"
                value={role}
                onChange={(e) => setRole(e.target.value as UserRole)}
                className="w-full rounded-xl border border-slate-700 bg-slate-800/80 px-4 py-3 text-white outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
              >
                <option value="student">学生</option>
                <option value="teacher">教师</option>
              </select>
            </div>
            {otpSent && (
              <div>
                <label htmlFor="otp" className="mb-1.5 block text-sm font-medium text-slate-300">
                  验证码
                </label>
                <input
                  id="otp"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                  placeholder="请输入 6 位验证码"
                  className="w-full rounded-xl border border-slate-700 bg-slate-800/80 px-4 py-3 text-white placeholder-slate-500 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
                />
              </div>
            )}
            {error && (
              <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                {error}
              </p>
            )}
            {message && (
              <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
                {message}
              </p>
            )}
            <div className="flex flex-col gap-3 pt-1 sm:flex-row">
              <button
                type="button"
                onClick={handleSendOtp}
                disabled={loading || countdown > 0}
                className="flex-1 rounded-xl border border-blue-500/40 bg-blue-500/10 px-4 py-3 text-sm font-medium text-blue-200 transition hover:bg-blue-500/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {countdown > 0 ? `${countdown}s 后重发` : '发送验证码'}
              </button>
              {otpSent && (
                <button
                  type="button"
                  onClick={handleVerifyOtp}
                  disabled={loading}
                  className="flex-1 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 px-4 py-3 text-sm font-medium text-white shadow-lg shadow-blue-600/30 transition hover:from-blue-500 hover:to-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? '登录中...' : '确认登录'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
