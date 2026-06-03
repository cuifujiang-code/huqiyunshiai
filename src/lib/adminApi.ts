import { postApiJson } from './postApiJson'
import { supabase } from './supabase'

function adminApiUrl(path: string) {
  const normalized = path.replace(/^\//, '')
  return `/api/admin/${normalized}`
}

async function getAccessToken(): Promise<string> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('请先登录管理员账号')
  return token
}

async function adminRequest<T>(
  path: string,
  body: unknown,
  label: string,
  method: 'GET' | 'POST' | 'PUT' = 'GET',
) {
  const token = await getAccessToken()
  const r = await postApiJson<T>(adminApiUrl(path), body, label, {
    method,
    headers: { Authorization: `Bearer ${token}` },
    timeoutMs: 30000,
  })
  if (r.kind === 'success') return r.data
  throw new Error(r.kind === 'fallback' ? r.reason : `${label}失败`)
}

export interface AdminStats {
  totalUsers: number
  todayNew: number
  todayRevenueCents: number
  todayRevenueYuan: string
}

export interface AdminUserRow {
  id: string
  phone: string
  phoneMasked: string
  role: string
  created_at: string
  membership_type: string
  expires_at: string | null
  subscription_start: string | null
}

export async function fetchAdminStats() {
  const data = await adminRequest<{ success: boolean; stats: AdminStats }>(
    'stats',
    null,
    '管理统计',
    'GET',
  )
  if (!data.success) throw new Error('加载统计失败')
  return data.stats
}

export async function fetchAdminUsers(params: {
  page?: number
  pageSize?: number
  keyword?: string
}) {
  const qs = new URLSearchParams()
  qs.set('page', String(params.page ?? 1))
  qs.set('pageSize', String(params.pageSize ?? 20))
  if (params.keyword?.trim()) qs.set('keyword', params.keyword.trim())

  const data = await adminRequest<{
    success: boolean
    items: AdminUserRow[]
    total: number
    page: number
    pageSize: number
  }>(`users?${qs}`, null, '用户列表', 'GET')

  if (!data.success) throw new Error('加载用户列表失败')
  return data
}

export async function setUserMembershipExpiry(
  userId: string,
  expiresAt: string | null,
  membershipType?: string,
) {
  const data = await adminRequest<{ success: boolean; message?: string }>(
    `users/${userId}/membership`,
    { expiresAt, membershipType },
    '更新会员',
    'PUT',
  )
  if (!data.success) throw new Error('更新会员失败')
  return data
}

export async function giftUserMembershipDays(
  userId: string,
  days: number,
  membershipType?: string,
) {
  const data = await adminRequest<{ success: boolean; message?: string }>(
    `users/${userId}/gift-days`,
    { days, membershipType },
    '赠送会员',
    'POST',
  )
  if (!data.success) throw new Error('赠送失败')
  return data
}
