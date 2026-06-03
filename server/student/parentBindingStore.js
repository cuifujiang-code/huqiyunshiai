import { randomBytes } from 'crypto'
import { getSupabaseAdmin, isSupabaseAdminConfigured } from '../supabaseAdmin.js'

const INVITE_TABLE = 'student_invite_codes'
const BINDING_TABLE = 'student_parent_bindings'
const PROFILES_TABLE = 'profiles'
const INVITE_TTL_DAYS = 7
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export { isSupabaseAdminConfigured as isParentBindingStoreConfigured }

function admin() {
  return getSupabaseAdmin()
}

function generateInviteCodeString() {
  const bytes = randomBytes(8)
  let code = ''
  for (let i = 0; i < 8; i++) {
    code += CODE_CHARS[bytes[i] % CODE_CHARS.length]
  }
  return code
}

function maskPhone(phone) {
  if (!phone) return '—'
  const digits = String(phone).replace(/\D/g, '')
  if (digits.length >= 7) {
    return `${digits.slice(0, 3)}****${digits.slice(-4)}`
  }
  return phone
}

async function getProfile(userId) {
  const { data, error } = await admin().from(PROFILES_TABLE).select('id, phone, role').eq('id', userId).maybeSingle()
  if (error) throw new Error(error.message)
  return data
}

export async function createStudentInviteCode(studentId) {
  const profile = await getProfile(studentId)
  if (!profile) throw new Error('学生账号不存在')
  if (profile.role !== 'student') throw new Error('仅学生账号可生成邀请码')

  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString()

  // 使旧邀请码失效（删除未过期同学生的码，保持单一有效码）
  await admin().from(INVITE_TABLE).delete().eq('student_id', studentId)

  let lastError = null
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateInviteCodeString()
    const { data, error } = await admin()
      .from(INVITE_TABLE)
      .insert({ student_id: studentId, code, expires_at: expiresAt })
      .select('id, student_id, code, expires_at, created_at')
      .single()

    if (!error) {
      return {
        inviteCode: data.code,
        expiresAt: data.expires_at,
        createdAt: data.created_at,
        validDays: INVITE_TTL_DAYS,
      }
    }
    lastError = error
    if (error.code !== '23505') break
  }

  throw new Error(lastError?.message || '生成邀请码失败')
}

export async function bindParentWithInviteCode(parentId, inviteCodeRaw) {
  const inviteCode = String(inviteCodeRaw || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')

  if (inviteCode.length < 6) throw new Error('请输入有效的邀请码')

  const parent = await getProfile(parentId)
  if (!parent) throw new Error('家长账号不存在')
  if (parent.role !== 'parent') throw new Error('仅家长账号可使用邀请码绑定')

  const { data: invite, error: inviteErr } = await admin()
    .from(INVITE_TABLE)
    .select('id, student_id, code, expires_at')
    .eq('code', inviteCode)
    .maybeSingle()

  if (inviteErr) throw new Error(inviteErr.message)
  if (!invite) throw new Error('邀请码无效或已失效')
  if (new Date(invite.expires_at).getTime() < Date.now()) throw new Error('邀请码已过期，请让学生重新生成')

  const student = await getProfile(invite.student_id)
  if (!student || student.role !== 'student') throw new Error('邀请码对应的学生不存在')

  const { data: existing } = await admin()
    .from(BINDING_TABLE)
    .select('id, created_at')
    .eq('student_id', invite.student_id)
    .eq('parent_id', parentId)
    .maybeSingle()

  if (existing) {
    return {
      alreadyBound: true,
      bindingId: existing.id,
      student: { id: student.id, phoneMasked: maskPhone(student.phone) },
      binding: {
        id: existing.id,
        student_user_id: invite.student_id,
        parent_user_id: parentId,
        bind_type: 'invite_code',
        status: 'active',
        bound_at: existing.created_at,
      },
      message: '已与该学生绑定',
    }
  }

  const { data: binding, error: bindErr } = await admin()
    .from(BINDING_TABLE)
    .insert({ student_id: invite.student_id, parent_id: parentId })
    .select('id, student_id, parent_id, created_at')
    .single()

  if (bindErr) throw new Error(bindErr.message)

  return {
    alreadyBound: false,
    bindingId: binding.id,
    student: { id: student.id, phoneMasked: maskPhone(student.phone) },
    binding: {
      id: binding.id,
      student_user_id: binding.student_id,
      parent_user_id: binding.parent_id,
      bind_type: 'invite_code',
      status: 'active',
      bound_at: binding.created_at,
    },
    message: '绑定成功',
  }
}

export async function listStudentParents(studentId) {
  const { data: bindings, error } = await admin()
    .from(BINDING_TABLE)
    .select('id, parent_id, created_at')
    .eq('student_id', studentId)
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  if (!bindings?.length) return []

  const parentIds = bindings.map((b) => b.parent_id)
  const { data: parents, error: pErr } = await admin()
    .from(PROFILES_TABLE)
    .select('id, phone, role')
    .in('id', parentIds)

  if (pErr) throw new Error(pErr.message)
  const parentMap = new Map((parents ?? []).map((p) => [p.id, p]))

  return bindings.map((b) => ({
    bindingId: b.id,
    parentId: b.parent_id,
    phoneMasked: maskPhone(parentMap.get(b.parent_id)?.phone),
    createdAt: b.created_at,
  }))
}

/** 供 /api/parent/bindings 使用，兼容前端 ParentBinding 类型 */
export async function listBindingsForUser(userId, role) {
  if (role === 'parent') {
    const rows = await listParentStudents(userId)
    return rows.map((r) => ({
      id: r.bindingId,
      student_user_id: r.studentId,
      parent_user_id: userId,
      bind_type: 'invite_code',
      status: 'active',
      bound_at: r.createdAt,
    }))
  }

  const rows = await listStudentParents(userId)
  return rows.map((r) => ({
    id: r.bindingId,
    student_user_id: userId,
    parent_user_id: r.parentId,
    bind_type: 'invite_code',
    status: 'active',
    bound_at: r.createdAt,
  }))
}

export async function unbindBinding(bindingId) {
  const { error } = await admin().from(BINDING_TABLE).delete().eq('id', bindingId)
  if (error) throw new Error(error.message)
}

export async function listParentStudents(parentId) {
  const { data: bindings, error } = await admin()
    .from(BINDING_TABLE)
    .select('id, student_id, created_at')
    .eq('parent_id', parentId)
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  if (!bindings?.length) return []

  const studentIds = bindings.map((b) => b.student_id)
  const { data: students, error: sErr } = await admin()
    .from(PROFILES_TABLE)
    .select('id, phone, role')
    .in('id', studentIds)

  if (sErr) throw new Error(sErr.message)
  const studentMap = new Map((students ?? []).map((s) => [s.id, s]))

  return bindings.map((b) => ({
    bindingId: b.id,
    studentId: b.student_id,
    phoneMasked: maskPhone(studentMap.get(b.student_id)?.phone),
    createdAt: b.created_at,
  }))
}
