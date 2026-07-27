/** 教师端 / 拆题 / 题库 独立 API 域名（备案通过后使用） */
export const DEFAULT_TEACHER_API_BASE = 'https://api.huqiyunshiai.online'

/** 备案期间 Vercel 主站代理腾讯云（见根目录 vercel.json beforeFiles） */
export const ICP_PROXY_TENCENT_ORIGIN = 'http://106.54.29.9:3001'

/**
 * 备案期间：www 主站重接口走同源 /api/*，由 Vercel 转发到腾讯云 IP。
 * 备案完成后改为 false，并恢复 vercel.json / DEFAULT_TEACHER_API_BASE。
 */
export const ICP_PROXY_VIA_MAIN_SITE = true

/**
 * 规范化基址：去掉尾部 /api，纠正误配的主站域名
 */
function normalizeTeacherApiBase(raw: string): string {
  let base = raw.trim().replace(/\/+$/, '')
  if (!base) return DEFAULT_TEACHER_API_BASE

  if (/\/api$/i.test(base)) {
    base = base.replace(/\/api$/i, '')
  }

  if (ICP_PROXY_VIA_MAIN_SITE && isProductionMainSiteHost(base)) {
    return base
  }

  if (/www\.huqiyunshiai\.online/i.test(base)) {
    console.warn('[apiBase] 检测到主站域名 www，已改用独立 API 域', {
      configured: raw,
      resolved: DEFAULT_TEACHER_API_BASE,
    })
    return DEFAULT_TEACHER_API_BASE
  }

  if (/huqiyunshiai\.online/i.test(base) && !/api\.huqiyunshiai\.online/i.test(base)) {
    console.warn('[apiBase] 检测到非 api 子域，已改用独立 API 域', {
      configured: raw,
      resolved: DEFAULT_TEACHER_API_BASE,
    })
    return DEFAULT_TEACHER_API_BASE
  }

  return base
}

function isProductionMainSiteHost(hostOrUrl: string): boolean {
  const h = hostOrUrl.replace(/^https?:\/\//i, '').split('/')[0].split(':')[0].toLowerCase()
  return h === 'huqiyunshiai.online' || h === 'www.huqiyunshiai.online'
}

/** 本地开发或备案期主站：重 API 走当前站点同源（由 Vercel /api/* 或 dev 代理） */
function isSameOriginTeacherApiHost(hostname: string): boolean {
  if (hostname === 'localhost' || hostname === '127.0.0.1') return true
  if (ICP_PROXY_VIA_MAIN_SITE && isProductionMainSiteHost(hostname)) return true
  return false
}

/** 解析教师/拆题 API 基址（不含 /api 后缀） */
export function getTeacherApiBase(): string {
  if (typeof window !== 'undefined') {
    const host = window.location.hostname
    if (isSameOriginTeacherApiHost(host)) {
      const base = window.location.origin.replace(/\/$/, '')
      console.log('[apiBase] 教师端 API 基址', { base, source: 'same-origin' })
      return base
    }
  }

  const fromEnv = import.meta.env.VITE_TEACHER_API_URL ?? ''
  const base = fromEnv
    ? normalizeTeacherApiBase(fromEnv)
    : DEFAULT_TEACHER_API_BASE

  console.log('[apiBase] 教师端 API 基址', {
    base,
    source: fromEnv ? 'VITE_TEACHER_API_URL' : 'default',
  })

  return base
}

/** 拼接教师端完整 URL：{base}/api/teacher/{path} */
export function buildTeacherApiUrl(path: string): string {
  const normalized = path.replace(/^\//, '').replace(/^api\/teacher\/?/i, '')
  const url = `${getTeacherApiBase()}/api/teacher/${normalized}`
  console.log('[apiBase] buildTeacherApiUrl', { path, url })
  return url
}

/** 拼接 teacher-api 根路径 API：{base}/api/{path}（批量拆题、目录等） */
export function buildTeacherRootApiUrl(path: string): string {
  const normalized = path.replace(/^\//, '').replace(/^api\/?/i, '')
  const url = `${getTeacherApiBase()}/api/${normalized}`
  console.log('[apiBase] buildTeacherRootApiUrl', { path, url })
  return url
}

/**
 * 拆题任务 API：备案期主站 / 腾讯云均为 /api/decompose-*（主站经 Vercel 代理到腾讯云）
 */
export function buildTeacherDecomposeApiUrl(path: string): string {
  const normalized = path.replace(/^\//, '').replace(/^api\/(teacher\/)?/i, '')
  const url = buildTeacherRootApiUrl(normalized)
  console.log('[apiBase] buildTeacherDecomposeApiUrl', { path, url })
  return url
}
