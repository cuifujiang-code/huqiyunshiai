import { createClient } from '@supabase/supabase-js'
import ws from 'ws'

/** 仅使用 service_role URL/key，禁止 anon key */
export function getSupabaseUrl() {
  return process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
}

export function getServiceRoleKey() {
  // 支持多种常见拼写变体
  return (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    ''
  )
}

function decodeJwtRole(key) {
  try {
    const parts = String(key).split('.')
    if (parts.length < 2) return null
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const json = JSON.parse(Buffer.from(payload, 'base64').toString('utf8'))
    return json?.role ?? null
  } catch {
    return null
  }
}

/** 确保 key 为 service_role，拒绝 ANON_KEY / VITE_SUPABASE_ANON_KEY */
export function assertServiceRoleKey(key = getServiceRoleKey()) {
  if (!key) {
    throw new Error(
      'Supabase 未配置：请设置 SUPABASE_SERVICE_ROLE_KEY（service_role secret，非 anon key）' +
      '。已检查变量名：SUPABASE_SERVICE_ROLE_KEY / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_SERVICE_KEY'
    )
  }
  // 支持多种 anon key 拼写变体
  const anonKey =
    process.env.SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    ''
  if (anonKey && key === anonKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY 与 ANON_KEY 相同，请使用 Settings → API → service_role secret')
  }
  const role = decodeJwtRole(key)
  if (role === 'anon') {
    throw new Error('当前 key 为 anon 角色，无法绕过 RLS，请改用 SUPABASE_SERVICE_ROLE_KEY')
  }
  return role
}

export function isSupabaseAdminConfigured() {
  const url = getSupabaseUrl()
  const key = getServiceRoleKey()
  if (!url || !key) return false
  try {
    assertServiceRoleKey(key)
    return true
  } catch {
    return false
  }
}

/** 唯一 Supabase 客户端入口：SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY */
export function createServiceRoleClient() {
  const url = getSupabaseUrl()
  const key = getServiceRoleKey()
  if (!url || !key) {
    throw new Error('Supabase 未配置：请设置 SUPABASE_URL（或 VITE_SUPABASE_URL）与 SUPABASE_SERVICE_ROLE_KEY')
  }
  assertServiceRoleKey(key)
  // 打印客户端配置（脱敏），便于排查
  const logUrl = String(url).replace(/\/\/.*?@/, '//***@')
  console.log('[Supabase] 创建 service_role 客户端', { url: logUrl, keyLen: String(key).length })
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { WebSocket: ws },
  })
}

/** @deprecated 别名，与 createServiceRoleClient 相同 */
export function getSupabaseAdmin() {
  return createServiceRoleClient()
}

const BATCH_IMAGES_BUCKET = process.env.SUPABASE_BATCH_IMAGES_BUCKET || 'batch-exam-images'

/** Storage 是否可用（依赖 service_role 客户端） */
export function isSupabaseStorageConfigured() {
  return isSupabaseAdminConfigured()
}

export function getBatchImagesBucket() {
  return BATCH_IMAGES_BUCKET
}

/** 确保批量拆题图片 bucket 存在（service_role 需有 storage 管理权限） */
export async function ensureBatchImagesBucket() {
  const admin = createServiceRoleClient()
  const { data: bucket, error: getErr } = await admin.storage.getBucket(BATCH_IMAGES_BUCKET)
  if (bucket) return bucket
  if (getErr && !/not found|404/i.test(getErr.message)) {
    console.warn('[Supabase Storage] getBucket 异常，尝试创建', { message: getErr.message })
  }
  const { data: created, error: createErr } = await admin.storage.createBucket(BATCH_IMAGES_BUCKET, {
    public: true,
    fileSizeLimit: 10 * 1024 * 1024,
  })
  if (createErr && !/already exists|duplicate/i.test(createErr.message)) {
    throw new Error(`创建 Storage bucket 失败：${createErr.message}`)
  }
  console.log('[Supabase Storage] bucket 就绪', { bucket: BATCH_IMAGES_BUCKET, created: Boolean(created) })
  return created ?? { name: BATCH_IMAGES_BUCKET }
}

/**
 * 上传批量拆题图片到 Supabase Storage
 * @returns {string} 公开访问 URL
 */
export async function uploadBatchImage(batchId, index, buffer, mimeType, kind = 'image') {
  if (!buffer?.length) throw new Error('图片 buffer 为空')
  const admin = createServiceRoleClient()
  await ensureBatchImagesBucket()

  const ext = (mimeType || 'image/png').split('/').pop()?.replace(/[^a-z0-9]/gi, '') || 'png'
  const objectPath = `${String(batchId).trim()}/${kind}_${index}.${ext}`

  const { error: uploadErr } = await admin.storage
    .from(BATCH_IMAGES_BUCKET)
    .upload(objectPath, buffer, { contentType: mimeType || 'image/png', upsert: true })

  if (uploadErr) {
    throw new Error(`Storage 上传失败：${uploadErr.message}`)
  }

  const { data: urlData } = admin.storage.from(BATCH_IMAGES_BUCKET).getPublicUrl(objectPath)
  const publicUrl = urlData?.publicUrl
  if (!publicUrl) throw new Error('无法获取 Storage 公开 URL')
  return publicUrl
}

/**
 * 上传题库编辑图片到 Supabase Storage
 * @returns {string} 公开访问 URL
 */
export async function uploadQuestionImage(teacherId, buffer, mimeType, fileName = 'image.png') {
  if (!buffer?.length) throw new Error('图片 buffer 为空')
  const admin = createServiceRoleClient()
  await ensureBatchImagesBucket()

  const safeName = String(fileName).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80)
  const ext = safeName.includes('.')
    ? safeName.split('.').pop()
    : (mimeType || 'image/png').split('/').pop()?.replace(/[^a-z0-9]/gi, '') || 'png'
  const objectPath = `questions/${String(teacherId).trim()}/${Date.now()}_${safeName || `img.${ext}`}`

  const { error: uploadErr } = await admin.storage
    .from(BATCH_IMAGES_BUCKET)
    .upload(objectPath, buffer, { contentType: mimeType || 'image/png', upsert: true })

  if (uploadErr) {
    throw new Error(`Storage 上传失败：${uploadErr.message}`)
  }

  const { data: urlData } = admin.storage.from(BATCH_IMAGES_BUCKET).getPublicUrl(objectPath)
  const publicUrl = urlData?.publicUrl
  if (!publicUrl) throw new Error('无法获取 Storage 公开 URL')
  return publicUrl
}
