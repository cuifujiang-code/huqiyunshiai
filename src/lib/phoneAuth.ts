import { supabase, type UserRole } from './supabase'
import { localMockSignIn } from './localMockAuth'
import type { Session } from '@supabase/supabase-js'

export function isSupabaseConfigured(): boolean {
  const url = import.meta.env.VITE_SUPABASE_URL ?? ''
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''
  return Boolean(url && key && !url.includes('placeholder'))
}

export function formatPhoneE164(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.startsWith('86') && digits.length === 13) return `+${digits}`
  if (digits.length === 11) return `+86${digits}`
  if (phone.startsWith('+')) return phone
  return `+86${digits}`
}

export function validatePassword(password: string): string | null {
  if (password.length < 6) return '密码至少需要 6 位'
  return null
}

function isAlreadyRegistered(message: string): boolean {
  const m = message.toLowerCase()
  return m.includes('already registered') || m.includes('already been registered') || m.includes('user already exists')
}

function needsOtp(message: string): boolean {
  const m = message.toLowerCase()
  return (
    m.includes('not confirmed') ||
    m.includes('otp') ||
    m.includes('verify') ||
    m.includes('invalid login credentials')
  )
}

/** 发送手机验证码（Supabase Phone Auth + 测试手机号模式） */
export async function sendPhoneOtp(
  phone: string,
  password: string,
  role: UserRole,
): Promise<void> {
  if (!isSupabaseConfigured()) {
    throw new Error('SUPABASE_NOT_CONFIGURED')
  }

  const pwdError = validatePassword(password)
  if (pwdError) throw new Error(pwdError)

  const { error: signUpError } = await supabase.auth.signUp({
    phone,
    password,
    options: {
      data: { role, phone },
    },
  })

  if (!signUpError) return

  if (isAlreadyRegistered(signUpError.message)) {
    const { error: otpError } = await supabase.auth.signInWithOtp({ phone })
    if (otpError) throw otpError
    return
  }

  throw signUpError
}

/** 手机号 + 密码登录 / 注册并完成 OTP 验证 */
export async function confirmPhoneAuth(params: {
  phone: string
  password: string
  role: UserRole
  otp: string
}): Promise<Session> {
  const { phone, password, role, otp } = params

  if (!isSupabaseConfigured()) {
    throw new Error('SUPABASE_NOT_CONFIGURED')
  }

  const pwdError = validatePassword(password)
  if (pwdError) throw new Error(pwdError)

  if (!otp || otp.length < 6) {
    throw new Error('请输入 6 位验证码')
  }

  const signIn = await supabase.auth.signInWithPassword({ phone, password })
  if (signIn.data.session) {
    return signIn.data.session
  }

  const verify = await supabase.auth.verifyOtp({
    phone,
    token: otp,
    type: 'sms',
  })
  if (verify.data.session) {
    return verify.data.session
  }

  const signUp = await supabase.auth.signUp({
    phone,
    password,
    options: { data: { role, phone } },
  })

  if (signUp.error && !isAlreadyRegistered(signUp.error.message)) {
    throw signUp.error
  }

  const verifyAfterSignUp = await supabase.auth.verifyOtp({
    phone,
    token: otp,
    type: 'sms',
  })
  if (verifyAfterSignUp.data.session) {
    return verifyAfterSignUp.data.session
  }

  const retrySignIn = await supabase.auth.signInWithPassword({ phone, password })
  if (retrySignIn.data.session) {
    return retrySignIn.data.session
  }

  const errMsg =
    verifyAfterSignUp.error?.message ??
    verify.error?.message ??
    retrySignIn.error?.message ??
    signIn.error?.message ??
    '登录失败，请检查手机号、密码与验证码'

  if (needsOtp(errMsg)) {
    throw new Error('验证失败，请确认 Supabase 测试手机号与测试验证码配置正确')
  }

  throw new Error(errMsg)
}

/** Supabase 匿名登录（临时降级方案） */
export async function signInAnonymously(): Promise<Session> {
  const { data, error } = await supabase.auth.signInAnonymously()
  if (error) throw error
  if (!data.session) throw new Error('匿名登录失败，未获取到会话')
  return data.session
}

export type AuthResult =
  | { mode: 'supabase'; session: Session; notice?: string }
  | { mode: 'local'; profile: ReturnType<typeof localMockSignIn>; notice?: string }

/** 完整登录流程：Supabase 手机认证 → 匿名登录 → 本地模拟 */
export async function authenticateWithPhone(params: {
  phone: string
  password: string
  role: UserRole
  otp: string
  otpSent: boolean
}): Promise<AuthResult> {
  const { phone, password, role, otp, otpSent } = params

  if (isSupabaseConfigured()) {
    try {
      if (!otpSent) {
        const direct = await supabase.auth.signInWithPassword({ phone, password })
        if (direct.data.session) {
          return { mode: 'supabase', session: direct.data.session }
        }
        const msg = direct.error?.message ?? ''
        if (needsOtp(msg) || msg.includes('Invalid login credentials')) {
          throw new Error('请先点击「发送验证码」，输入测试验证码后再登录')
        }
        throw direct.error ?? new Error('登录失败')
      }

      const session = await confirmPhoneAuth({ phone, password, role, otp })
      return { mode: 'supabase', session }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Supabase 登录失败'
      if (message !== 'SUPABASE_NOT_CONFIGURED') {
        console.warn('Supabase 手机登录失败，尝试匿名登录:', message)
        try {
          const session = await signInAnonymously()
          return {
            mode: 'supabase',
            session,
            notice: `Supabase 手机认证不可用（${message}），已切换为匿名登录`,
          }
        } catch (anonErr) {
          console.warn('匿名登录失败，使用本地模拟:', anonErr)
        }
      }
    }
  }

  const profile = localMockSignIn(phone, role)
  return {
    mode: 'local',
    profile,
    notice: isSupabaseConfigured()
      ? 'Supabase 不可用，已使用本地模拟登录'
      : '未配置 Supabase 环境变量，已使用本地模拟登录',
  }
}
