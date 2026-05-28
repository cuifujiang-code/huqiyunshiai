/**
 * 统一 API 错误序列化与日志（Vercel Function Logs 可检索）
 */
export function serializeApiError(error) {
  if (!error) return { message: '未知错误' }

  if (typeof error === 'object' && typeof error.toJSON === 'function') {
    return error.toJSON()
  }

  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      code: error.code,
      stack: error.stack?.split('\n').slice(0, 10),
    }
  }

  return { message: String(error) }
}

export function logStepError(step, error) {
  const detail = serializeApiError(error)
  console.error(`[诊断] 步骤失败: ${step}`, detail)
  return { ...detail, step }
}

export function buildPrepareFailure(step, error, extra = {}) {
  const errorDetail = logStepError(step, error)
  const message =
    error instanceof Error ? error.message : typeof error === 'string' ? error : `${step} 失败`

  return {
    success: false,
    isMockFallback: true,
    message,
    errorDetail,
    step,
    ...extra,
  }
}
