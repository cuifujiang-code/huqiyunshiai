/** 解析教师/拆题 API 基址（不含 /api 后缀） */
export function getTeacherApiBase(): string {
  const fromEnv = (import.meta.env.VITE_TEACHER_API_URL ?? '').replace(/\/$/, '')

  if (typeof window !== 'undefined') {
    const origin = window.location.origin.replace(/\/$/, '')
    // api 子域若误指向主站 SPA，题库/拆题改走主站同源（主站已具备 serverless API）
    if (!fromEnv || fromEnv.includes('api.huqiyunshiai.online')) {
      return origin
    }
    return fromEnv
  }

  return fromEnv || 'https://www.huqiyunshiai.online'
}
