const jobs = new Map()
const TTL_MS = 15 * 60 * 1000

function cleanup() {
  const now = Date.now()
  for (const [id, job] of jobs.entries()) {
    if (now - job.createdAt > TTL_MS) jobs.delete(id)
  }
}

export function createDiagnosisJob() {
  cleanup()
  const jobId = `diag_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  jobs.set(jobId, {
    jobId,
    status: 'processing',
    createdAt: Date.now(),
    result: null,
    error: null,
  })
  return jobId
}

export function completeDiagnosisJob(jobId, result) {
  const job = jobs.get(jobId)
  if (!job) return
  job.status = 'done'
  job.result = result
  job.finishedAt = Date.now()
}

export function failDiagnosisJob(jobId, error) {
  const job = jobs.get(jobId)
  if (!job) return
  job.status = 'failed'
  job.error = error instanceof Error ? error.message : String(error)
  job.finishedAt = Date.now()
}

export function getDiagnosisJob(jobId) {
  cleanup()
  return jobs.get(jobId) ?? null
}
