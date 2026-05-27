/**
 * 触发后台 process API（fire-and-forget）
 */
export function getDiagnosisProcessUrl() {
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}/api/diagnosis/process`
  }
  const port = process.env.PORT || 3001
  return `http://127.0.0.1:${port}/api/diagnosis/process`
}

export function getDiagnosisProcessSecret() {
  return process.env.DIAGNOSIS_PROCESS_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || ''
}

export function triggerDiagnosisProcess(taskId) {
  const url = getDiagnosisProcessUrl()
  const secret = getDiagnosisProcessSecret()

  console.log('[diagnosisTrigger] 触发后台处理', { taskId, url: url.replace(/\/\/[^/]+/, '//***') })

  const headers = { 'Content-Type': 'application/json' }
  if (secret) {
    headers['x-diagnosis-process-secret'] = secret
  }

  fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ taskId }),
  }).catch((err) => {
    console.error('[diagnosisTrigger] 触发失败', err)
  })
}

export function verifyDiagnosisProcessSecret(req) {
  const secret = getDiagnosisProcessSecret()
  if (!secret) return true
  const header = req.headers?.['x-diagnosis-process-secret']
  return header === secret
}
