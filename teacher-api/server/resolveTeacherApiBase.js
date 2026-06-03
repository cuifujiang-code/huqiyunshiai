/** 生产环境对外 API 域名（勿用 VERCEL_URL 预览域，易触发部署保护/401） */
export const DEFAULT_TEACHER_API_ORIGIN = 'https://api.huqiyunshiai.online'

/**
 * 解析 teacher-api 对外基址（无尾部斜杠）
 * 优先级：TEACHER_API_URL > VITE_TEACHER_API_URL > DEFAULT_TEACHER_API_ORIGIN
 */
export function resolveTeacherApiBase() {
  return (
    process.env.TEACHER_API_URL ||
    process.env.VITE_TEACHER_API_URL ||
    DEFAULT_TEACHER_API_ORIGIN
  ).replace(/\/$/, '')
}
