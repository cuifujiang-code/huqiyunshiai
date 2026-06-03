import { getSupabaseAdmin } from '../supabaseAdmin.js'

function startOfTodayUtc() {
  const d = new Date()
  d.setUTCHours(0, 0, 0, 0)
  return d.toISOString()
}

export function maskPhone(phone) {
  const raw = String(phone ?? '').replace(/\s/g, '')
  const digits = raw.replace(/\D/g, '')
  const core = digits.length >= 11 ? digits.slice(-11) : digits
  if (core.length < 7) return raw || '—'
  return `${core.slice(0, 3)}****${core.slice(-4)}`
}

function defaultMembershipTypeForRole(role) {
  if (role === 'student') return 'student_yearly'
  return 'teacher_yearly'
}

export async function getAdminStats() {
  const admin = getSupabaseAdmin()
  const todayStart = startOfTodayUtc()

  const [{ count: totalUsers }, { count: todayNew }, { data: payments }] = await Promise.all([
    admin.from('profiles').select('*', { count: 'exact', head: true }),
    admin.from('profiles').select('*', { count: 'exact', head: true }).gte('created_at', todayStart),
    admin.from('payment_records').select('amount_cents').gte('created_at', todayStart),
  ])

  const todayRevenueCents = (payments ?? []).reduce((sum, row) => sum + (row.amount_cents ?? 0), 0)

  return {
    totalUsers: totalUsers ?? 0,
    todayNew: todayNew ?? 0,
    todayRevenueCents,
    todayRevenueYuan: (todayRevenueCents / 100).toFixed(2),
  }
}

export async function listUsers({ page = 1, pageSize = 20, keyword = '' }) {
  const admin = getSupabaseAdmin()
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  let query = admin
    .from('profiles')
    .select('id, phone, role, created_at', { count: 'exact' })
    .order('created_at', { ascending: false })

  const kw = String(keyword).trim()
  if (kw) {
    query = query.ilike('phone', `%${kw}%`)
  }

  const { data: profiles, error, count } = await query.range(from, to)
  if (error) throw new Error(error.message)

  const ids = (profiles ?? []).map((p) => p.id)
  let membershipMap = {}

  if (ids.length > 0) {
    const { data: memberships, error: memErr } = await admin
      .from('user_memberships')
      .select('user_id, membership_type, expires_at, subscription_start')
      .in('user_id', ids)

    if (memErr) throw new Error(memErr.message)
    membershipMap = Object.fromEntries((memberships ?? []).map((m) => [m.user_id, m]))
  }

  const items = (profiles ?? []).map((p) => {
    const m = membershipMap[p.id]
    return {
      id: p.id,
      phone: p.phone,
      phoneMasked: maskPhone(p.phone),
      role: p.role,
      created_at: p.created_at,
      membership_type: m?.membership_type ?? 'free',
      expires_at: m?.expires_at ?? null,
      subscription_start: m?.subscription_start ?? null,
    }
  })

  return {
    items,
    total: count ?? 0,
    page,
    pageSize,
  }
}

async function getProfileRole(userId) {
  const admin = getSupabaseAdmin()
  const { data, error } = await admin.from('profiles').select('role').eq('id', userId).maybeSingle()
  if (error) throw new Error(error.message)
  return data?.role ?? 'teacher'
}

export async function upsertMembership(userId, patch) {
  const admin = getSupabaseAdmin()
  const now = new Date().toISOString()

  const { data: existing } = await admin
    .from('user_memberships')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()

  const row = {
    user_id: userId,
    membership_type: patch.membership_type ?? existing?.membership_type ?? 'free',
    expires_at: patch.expires_at !== undefined ? patch.expires_at : existing?.expires_at ?? null,
    subscription_start: patch.subscription_start ?? existing?.subscription_start ?? (patch.expires_at ? now : null),
    per_use_diagnosis_credits: existing?.per_use_diagnosis_credits ?? 0,
    has_used_free_diagnosis: existing?.has_used_free_diagnosis ?? false,
    exam_generations_used: existing?.exam_generations_used ?? 0,
    diagnosis_used: existing?.diagnosis_used ?? 0,
    last_usage_reset_month: existing?.last_usage_reset_month ?? null,
    updated_at: now,
  }

  const { data, error } = await admin
    .from('user_memberships')
    .upsert(row, { onConflict: 'user_id' })
    .select()
    .single()

  if (error) throw new Error(error.message)
  return data
}

/** 设置会员到期时间 */
export async function setMembershipExpiry(userId, expiresAtIso, membershipType) {
  const role = await getProfileRole(userId)
  const type = membershipType || defaultMembershipTypeForRole(role)
  const expires_at = expiresAtIso ? new Date(expiresAtIso).toISOString() : null
  const membership_type = expires_at ? type : 'free'

  return upsertMembership(userId, {
    membership_type,
    expires_at,
    subscription_start: expires_at ? new Date().toISOString() : null,
  })
}

/** 赠送会员天数 */
export async function giftMembershipDays(userId, days, membershipType) {
  const n = Math.max(1, Math.floor(Number(days) || 0))
  const role = await getProfileRole(userId)
  const type = membershipType || defaultMembershipTypeForRole(role)

  const admin = getSupabaseAdmin()
  const { data: existing } = await admin
    .from('user_memberships')
    .select('expires_at, membership_type')
    .eq('user_id', userId)
    .maybeSingle()

  const base = existing?.expires_at && new Date(existing.expires_at) > new Date()
    ? new Date(existing.expires_at)
    : new Date()
  base.setDate(base.getDate() + n)

  const result = await upsertMembership(userId, {
    membership_type: type,
    expires_at: base.toISOString(),
    subscription_start: existing?.subscription_start ?? new Date().toISOString(),
  })

  await admin.from('payment_records').insert({
    user_id: userId,
    amount_cents: 0,
    plan_id: 'admin_gift',
    note: `管理员赠送 ${n} 天会员`,
  })

  return result
}
