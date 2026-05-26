import { supabase, type UserRole } from './supabase'
import { localMockSignIn } from './localMockAuth'
import type { Session } from '@supabase/supabase-js'

/** 虚拟账号邮箱域名：Supabase 内部域名，不触发外部邮件 */
const MOCK_EMAIL_DOMAIN = 'supabase.co'

/** 根据手机号生成虚拟账号邮箱与密码（仅用于开发模拟登录） */
export function getVirtualCredentials(phone: string) {
  const digits = phone.replace(/\D/g, '').slice(-11)
  const email = `${digits}@${MOCK_EMAIL_DOMAIN}`
  const password = `HuaqiMock_${digits}!`
  return { email, password, digits }
}

async function signInWithVirtualAccount(email: string, password: string): Promise<Session> {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  if (!data.session) throw new Error('登录失败，未获取到会话')
  return data.session
}

async function signUpVirtualAccount(
  email: string,
  password: string,
  formattedPhone: string,
  role: UserRole,
): Promise<Session | null> {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { role, phone: formattedPhone } },
  })
  if (error) throw error
  return data.session
}

async function parseApiResponse(response: Response): Promise<{ error?: string; ok?: boolean }> {
  const contentType = response.headers.get('content-type') ?? ''
  const text = await response.text()

  if (contentType.includes('application/json')) {
    try {
      return JSON.parse(text) as { error?: string; ok?: boolean }
    } catch {
      throw new Error('后端返回了无效的 JSON 数据')
    }
  }

  if (text.trimStart().startsWith('<!DOCTYPE') || text.trimStart().startsWith('<html')) {
    if (response.status === 404) {
      throw new Error('后端 API 未就绪')
    }
    throw new Error(`后端返回异常页面（HTTP ${response.status}）`)
  }

  return { error: text || `请求失败（HTTP ${response.status}）` }
}

async function ensureUserViaBackend(formattedPhone: string, role: UserRole): Promise<boolean> {
  try {
    const response = await fetch('/api/auth/ensure-mock-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: formattedPhone, role }),
    })
    const result = await parseApiResponse(response)
    return response.ok && !!result.ok
  } catch {
    return false
  }
}

export type MockSignInResult =
  | { mode: 'supabase'; session: Session }
  | { mode: 'local'; profile: ReturnType<typeof localMockSignIn> }

/**
 * 模拟登录：优先 signInWithPassword，依次尝试后端创建、客户端注册，最后本地降级。
 * UI 保持不变，任意 11 位手机号 + 任意验证码即可登录。
 */
export async function mockSignInWithPhone(
  formattedPhone: string,
  role: UserRole,
): Promise<MockSignInResult> {
  const { email, password } = getVirtualCredentials(formattedPhone)

  // 1. 已有虚拟账号，直接登录
  try {
    const session = await signInWithVirtualAccount(email, password)
    return { mode: 'supabase', session }
  } catch (signInError) {
    const msg = signInError instanceof Error ? signInError.message : ''
    const canRegister =
      msg.includes('Invalid login credentials') || msg.includes('invalid_credentials')
    if (!canRegister) throw signInError
  }

  // 2. 后端 Admin API 静默创建（需 service_role）
  const createdViaBackend = await ensureUserViaBackend(formattedPhone, role)
  if (createdViaBackend) {
    const session = await signInWithVirtualAccount(email, password)
    return { mode: 'supabase', session }
  }

  // 3. 客户端 signUp（@supabase.co 不发送外部邮件）
  try {
    const session = await signUpVirtualAccount(email, password, formattedPhone, role)
    if (session) return { mode: 'supabase', session }
    const retrySession = await signInWithVirtualAccount(email, password)
    return { mode: 'supabase', session: retrySession }
  } catch {
    // 频率限制或 profiles 表未创建时降级
  }

  // 4. 本地模拟登录（无需 Supabase 配置）
  const profile = localMockSignIn(formattedPhone, role)
  return { mode: 'local', profile }
}
