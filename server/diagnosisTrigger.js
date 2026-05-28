import { buildServerUrl } from './urlUtil.js'

export function getDiagnosisProcessSecret() {
  return process.env.DIAGNOSIS_PROCESS_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || ''
}

function buildProcessHeaders() {
  const headers = { 'Content-Type': 'application/json' }
  const secret = getDiagnosisProcessSecret()
  if (secret) {
    headers['x-diagnosis-process-secret'] = secret
  }
  return headers
}

function fireProcessRequest(path, taskId, label) {
  const url = buildServerUrl(path)
  console.log(`[diagnosisTrigger] 触发${label}`, { taskId, path })

  fetch(url, {
    method: 'POST',
    headers: buildProcessHeaders(),
    body: JSON.stringify({ taskId }),
  }).catch((err) => {
    console.error(`[diagnosisTrigger] ${label} 触发失败`, err)
  })
}

/** 步骤一：OCR 识别 */
export function triggerDiagnosisProcessOcr(taskId) {
  fireProcessRequest('/api/diagnosis/process-ocr', taskId, 'OCR')
}

/** 步骤二：AI 对比分析 */
export function triggerDiagnosisProcessAnalysis(taskId) {
  fireProcessRequest('/api/diagnosis/process-analysis', taskId, 'AI分析')
}

/** @deprecated 使用 triggerDiagnosisProcessOcr */
export function triggerDiagnosisProcess(taskId) {
  triggerDiagnosisProcessOcr(taskId)
}

export function verifyDiagnosisProcessSecret(req) {
  const secret = getDiagnosisProcessSecret()
  if (!secret) return true
  const header = req.headers?.['x-diagnosis-process-secret']
  return header === secret
}
