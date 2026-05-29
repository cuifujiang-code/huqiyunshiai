import '../../server/applyUrlShim.js'
import { randomUUID } from 'crypto'
import { applyApiHeaders, handleOptions } from '../../server/apiResponse.js'
import { parseExamText } from '../../server/teacher/questionImportService.js'
import { splitTextIntoChunks } from '../../server/batch/batchChunker.js'
import {
  createBatchTask,
  isBatchStoreConfigured,
  listBatchTasksByTeacher,
  formatBatchProgress,
  countItemsByStatus,
  markBatchFailed,
} from '../../server/batch/batchTaskStore.js'
import { startBatchProcessing } from '../../server/batch/batchStart.js'

async function parseUploadToText(body) {
  const { examFileBase64, examFileName, rawText } = body ?? {}

  if (rawText && typeof rawText === 'string' && rawText.trim()) {
    return { text: rawText.trim(), fileName: examFileName || 'paste.txt' }
  }

  if (!examFileBase64 || !examFileName) {
    throw new Error('请提供 examFileBase64+examFileName 或 rawText')
  }

  const buffer = Buffer.from(examFileBase64, 'base64')
  const text = await parseExamText(buffer, examFileName)
  return { text, fileName: examFileName }
}

export default async function handler(req, res) {
  if (handleOptions(req, res)) return
  applyApiHeaders(req, res)

  if (req.method === 'GET') {
    const teacherId = req.query?.teacherId
    if (!teacherId) {
      return res.status(400).json({ success: false, message: '缺少 teacherId' })
    }
    if (!isBatchStoreConfigured()) {
      return res.status(503).json({ success: false, message: 'Supabase 未配置' })
    }
    try {
      const tasks = await listBatchTasksByTeacher(teacherId)
      const summaries = await Promise.all(
        tasks.map(async (t) => {
          const counts = await countItemsByStatus(t.batch_id)
          return formatBatchProgress(t, counts)
        }),
      )
      return res.status(200).json({ success: true, tasks: summaries })
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message })
    }
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed' })
  }

  if (!isBatchStoreConfigured()) {
    return res.status(503).json({ success: false, message: '请配置 Supabase' })
  }

  const body = req.body ?? {}
  const { teacherId, subject, grade, autoStart = true } = body

  if (!teacherId) {
    return res.status(400).json({ success: false, message: '缺少 teacherId' })
  }

  try {
    const { text, fileName } = await parseUploadToText(body)
    const chunks = splitTextIntoChunks(text)
    if (!chunks.length) {
      return res.status(400).json({ success: false, message: '试卷内容为空' })
    }

    const batchId = randomUUID()
    await createBatchTask({
      batchId,
      teacherId,
      fileName,
      subject: subject || '数学',
      grade: grade || '八年级',
      chunks,
      meta: { chunkCount: chunks.length, textLength: text.length },
    })

    let startResult = null
    if (autoStart !== false) {
      console.log('[batch/upload] 自动启动 worker', { batchId, teacherId })
      startResult = await startBatchProcessing(batchId, teacherId, req)
      if (!startResult.ok) {
        return res.status(startResult.httpStatus ?? 500).json({
          success: false,
          batchId,
          status: startResult.taskStatus ?? 'failed',
          message: startResult.message || '任务已创建但 worker 启动失败',
        })
      }
    }

    return res.status(200).json({
      success: true,
      batchId,
      status: startResult?.taskStatus ?? 'pending',
      totalItems: chunks.length,
      message: startResult?.ok
        ? `批量任务已创建并启动，共 ${chunks.length} 个处理分块`
        : `批量任务已创建，共 ${chunks.length} 个处理分块，请调用 /api/batch/start 启动`,
    })
  } catch (error) {
    console.error('[batch/upload]', error)
    const msg = error instanceof Error ? error.message : '上传失败'
    return res.status(500).json({
      success: false,
      message: msg,
    })
  }
}

export const config = {
  maxDuration: 60,
  api: { bodyParser: { sizeLimit: '50mb' } },
}
