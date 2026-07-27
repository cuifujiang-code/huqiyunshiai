import uploadHandler from '../api/batch/upload.js'
import startHandler from '../api/batch/start.js'
import progressHandler from '../api/batch/progress.js'
import healthHandler from '../api/batch/health.js'
import workerHandler from '../api/batch/worker.js'
import autoRetryHandler from '../api/batch/auto-retry.js'

export function registerBatchRoutes(app) {
  app.all('/api/batch/upload', uploadHandler)
  app.all('/api/batch/start', startHandler)
  app.all('/api/batch/progress', progressHandler)
  app.all('/api/batch/health', healthHandler)
  app.all('/api/batch/worker', workerHandler)
  app.all('/api/batch/auto-retry', autoRetryHandler)
}
