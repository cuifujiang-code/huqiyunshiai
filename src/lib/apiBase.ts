/** 教师端 / 拆题 / 题库 独立 API 域名（勿用 www 主站） */
export const DEFAULT_TEACHER_API_BASE = 'https://api.huqiyunshiai.online'

/**
 * 规范化基址：去掉尾部 /api，纠正误配的主站域名
 */
function normalizeTeacherApiBase(raw: string): string {
  let base = raw.trim().replace(/\/+$/, '')
  if (!base) return DEFAULT_TEACHER_API_BASE

  if (/\/api$/i.test(base)) {
    base = base.replace(/\/api$/i, '')
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

/** 主站 / 本地开发：API 走当前站点同源（Vercel /api/*），避免误打到不可达的 api 子域 */
function isSameOriginTeacherApiHost(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === 'huqiyunshiai.online' ||
    /^www\.huqiyunshiai\.online$/i.test(hostname)
  )
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

/** 拼接 teacher-api 根路径 API：{base}/api/{path}（拆题等） */
export function buildTeacherRootApiUrl(path: string): string {
  const normalized = path.replace(/^\//, '').replace(/^api\/?/i, '')
  const url = `${getTeacherApiBase()}/api/${normalized}`
  console.log('[apiBase] buildTeacherRootApiUrl', { path, url })
  return url
}
