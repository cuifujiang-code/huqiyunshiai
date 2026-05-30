import '../../server/applyUrlShim.js'
import { randomUUID } from 'crypto'
import { setNoCacheHeaders } from '../../server/apiResponse.js'
import { splitTextIntoChunks } from '../../server/batch/batchChunker.js'
import { parseExamText } from '../../server/teacher/questionImportService.js'
import {
  createBatchTask,
  isBatchStoreConfigured,
  listBatchTasksByTeacher,
  formatBatchProgress,
  countItemsByStatus,
} from '../../server/batch/batchTaskStore.js'
import { startBatchProcessing } from '../../server/batch/batchStart.js'

function buildUploadPayload({
  batchId,
  chunkCount,
  status,
  message,
  success = true,
  autoStarted = false,
  startFailed = false,
  startError,
}) {
  return {
    success,
    batchId,
    taskId: batchId,
    status: status ?? 'pending',
    totalItems: chunkCount,
    total_items: chunkCount,
    total_chunks: chunkCount,
    chunkCount,
    autoStarted,
    startFailed,
    ...(startError ? { startError } : {}),
    message: message ?? `批量任务已创建，共 ${chunkCount} 个处理分块`,
  }
}

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
  setNoCacheHeaders(res)

  if (req.method === 'GET') {
    const teacherId = req.query?.teacherId
    if (!teacherId) {
      return res.status(400).json({ success: false, message: '缺少 teacherId', tasks: [] })
    }
    if (!isBatchStoreConfigured()) {
      return res.status(503).json({ success: false, message: 'Supabase 未配置', tasks: [] })
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
      return res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : '查询失败',
        tasks: [],
      })
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
    const chunkCount = chunks.length
    if (!chunkCount) {
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
      meta: { chunkCount, textLength: text.length },
    })

    let startResult = null
    if (autoStart !== false) {
      startResult = await startBatchProcessing(batchId, teacherId, req)
    }

    if (startResult && !startResult.ok) {
      return res.status(200).json(
        buildUploadPayload({
          batchId,
          chunkCount,
          status: startResult.taskStatus ?? 'pending',
          autoStarted: false,
          startFailed: true,
          startError: startResult.message,
          message: `任务已创建（${chunkCount} 个分块），Worker 启动失败：${startResult.message}`,
        }),
      )
    }

    const running = startResult?.ok && startResult.taskStatus === 'running'
    return res.status(200).json(
      buildUploadPayload({
        batchId,
        chunkCount,
        status: startResult?.taskStatus ?? 'pending',
        autoStarted: running,
        message: running
          ? `批量任务已创建并启动，共 ${chunkCount} 个处理分块`
          : `批量任务已创建，共 ${chunkCount} 个处理分块`,
      }),
    )
  } catch (error) {
    console.error('[batch/upload]', error)
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : '上传失败',
    })
  }
}

export const config = {
  maxDuration: 60,
  api: { bodyParser: { sizeLimit: '50mb' } },
}
