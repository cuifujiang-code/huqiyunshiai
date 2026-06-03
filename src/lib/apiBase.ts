/** 解析教师/拆题 API 基址（不含 /api 后缀） */
export function getTeacherApiBase(): string {
  const fromEnv = (import.meta.env.VITE_TEACHER_API_URL ?? '').replace(/\/$/, '')
  if (fromEnv) return fromEnv
  if (typeof window !== 'undefined') {
    return window.location.origin.replace(/\/$/, '')
  }
  return 'https://api.huqiyunshiai.online'
}
