import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

export function getVirtualCredentials(phone) {
  const digits = phone.replace(/\D/g, '').slice(-11)
  const email = `${digits}@supabase.co`
  const password = `HuaqiMock_${digits}!`
  const formattedPhone = phone.startsWith('+') ? phone : `+86${digits}`
  return { email, password, digits, formattedPhone }
}

function getAdminClient() {
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY 未配置，请在 .env 中填写')
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

async function findUserByEmail(admin, email) {
  let page = 1
  while (page <= 10) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw error
    const user = data.users.find((u) => u.email === email)
    if (user) return user
    if (data.users.length < 200) return null
    page++
  }
  return null
}

/** 通过 Admin API 创建或更新虚拟用户，不发送确认邮件，不受注册频率限制 */
export async function ensureMockUser(phone, role) {
  const admin = getAdminClient()
  const { email, password, formattedPhone } = getVirtualCredentials(phone)

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { role, phone: formattedPhone },
  })

  if (!error) {
    return { userId: data.user.id, created: true }
  }

  const isDuplicate =
    error.message?.includes('already') ||
    error.message?.includes('registered') ||
    error.status === 422

  if (!isDuplicate) {
    throw error
  }

  const existing = await findUserByEmail(admin, email)
  if (!existing) {
    throw new Error('用户已存在但无法查询，请稍后重试')
  }

  const { error: updateError } = await admin.auth.admin.updateUserById(existing.id, {
    password,
    user_metadata: { role, phone: formattedPhone },
  })

  if (updateError) throw updateError
  return { userId: existing.id, created: false }
}
