import { createClient } from '@supabase/supabase-js'
import { createHash } from 'crypto'

export function getSupabaseUrl() {
  return process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
}

export function getServiceRoleKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || ''
}

export function isSupabaseAdminConfigured() {
  return Boolean(getSupabaseUrl() && getServiceRoleKey())
}

export function createServiceRoleClient() {
  const url = getSupabaseUrl()
  const key = getServiceRoleKey()
  if (!url || !key) {
    throw new Error('Supabase 未配置：请设置 SUPABASE_URL 与 SUPABASE_SERVICE_ROLE_KEY')
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

export function getSupabaseAdmin() {
  return createServiceRoleClient()
}

const BATCH_IMAGES_BUCKET = process.env.SUPABASE_BATCH_IMAGES_BUCKET || 'batch-exam-images'
const QUESTION_BANK_IMAGE_PREFIX = 'question-bank/import'

export function getQuestionBankImagePrefix() {
  return QUESTION_BANK_IMAGE_PREFIX
}

export async function uploadQuestionBankImage(refName, buffer, mimeType = 'image/png') {
  if (!buffer?.length) throw new Error('图片 buffer 为空')
  const admin = createServiceRoleClient()
  await ensureBatchImagesBucket()

  const ext = (mimeType || 'image/png').split('/').pop()?.replace(/[^a-z0-9]/gi, '') || 'png'
  const { createHash } = await import('crypto')
  const hash = createHash('md5').update(String(refName).trim()).digest('hex')
  const objectPath = `${QUESTION_BANK_IMAGE_PREFIX}/${hash}.${ext}`

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

export function isSupabaseStorageConfigured() {
  return isSupabaseAdminConfigured()
}

export function getBatchImagesBucket() {
  return BATCH_IMAGES_BUCKET
}

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
  return created ?? { name: BATCH_IMAGES_BUCKET }
}

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

const PAPER_BUCKET = process.env.SUPABASE_PAPER_BUCKET || 'exam-papers'

/** Supabase 免费版全局单文件上限约 50MB，勿超过项目 Storage 设置 */
export function getPaperMaxBytes() {
  const mb = Number(process.env.SUPABASE_PAPER_MAX_MB || 50)
  return Math.max(1, mb) * 1024 * 1024
}

export async function ensurePaperBucket() {
  const admin = createServiceRoleClient()
  const maxBytes = getPaperMaxBytes()
  const { data: bucket } = await admin.storage.getBucket(PAPER_BUCKET)
  if (bucket) return bucket

  let { data: created, error: createErr } = await admin.storage.createBucket(PAPER_BUCKET, {
    public: true,
    fileSizeLimit: maxBytes,
  })

  // 若超过项目全局上限，降级为默认限制重试
  if (createErr && /maximum allowed size|exceeded.*size/i.test(createErr.message)) {
    ;({ data: created, error: createErr } = await admin.storage.createBucket(PAPER_BUCKET, { public: true }))
  }

  if (createErr && !/already exists|duplicate/i.test(createErr.message)) {
    throw new Error(
      `创建试卷 bucket 失败：${createErr.message}。请在 Supabase Dashboard → Storage 手动创建公开 bucket「${PAPER_BUCKET}」`,
    )
  }
  return created ?? { name: PAPER_BUCKET }
}

/** Storage object key 仅允许 ASCII，中文文件名用 hash 替代 */
function buildPaperObjectPath(userId, fileName) {
  const raw = String(fileName || 'paper').trim()
  const extMatch = raw.match(/\.([a-z0-9]+)$/i)
  const ext = extMatch ? extMatch[1].toLowerCase() : 'bin'
  const base = raw.replace(/\.[^.]+$/, '')
  const ascii = base.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '').slice(0, 60)
  const namePart = ascii && !/^_*$/.test(ascii)
    ? ascii
    : createHash('md5').update(base || raw).digest('hex').slice(0, 16)
  return `${String(userId).trim()}/${Date.now()}_${namePart}.${ext}`
}

export async function uploadPaperFile(userId, fileName, buffer, mimeType) {
  const admin = createServiceRoleClient()
  const maxBytes = getPaperMaxBytes()
  await ensurePaperBucket()
  const objectPath = buildPaperObjectPath(userId, fileName)
  const { error: uploadErr } = await admin.storage
    .from(PAPER_BUCKET)
    .upload(objectPath, buffer, { contentType: mimeType || 'application/octet-stream', upsert: true })
  if (uploadErr) {
    const msg = /maximum allowed size|exceeded.*size/i.test(uploadErr.message)
      ? `文件超过 Storage 允许大小（约 ${Math.floor(maxBytes / 1024 / 1024)}MB），请压缩 PDF 后重试`
      : uploadErr.message
    throw new Error(`试卷上传失败：${msg}`)
  }
  const { data: urlData } = admin.storage.from(PAPER_BUCKET).getPublicUrl(objectPath)
  return urlData?.publicUrl || ''
}

/** 兼容 teacherApiHandler 旧命名 */
export const uploadQuestionImage = uploadQuestionBankImage
