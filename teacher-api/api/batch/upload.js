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
} from '../../server/batch/batchTaskStore.js'
import { startBatchProcessing } from '../../server/batch/batchStart.js'

function buildUploadPayload({
  batchId,
  id,
  chunkCount,
  status,
  message,
  success = true,
  autoStarted = false,
  startFailed = false,
  startError,
}) {
  const normalizedBatchId = String(batchId ?? '').trim()
  if (!normalizedBatchId) {
    throw new Error('buildUploadPayload: batchId 不能为空')
  }
  return {
    success,
    batchId: normalizedBatchId,
    taskId: normalizedBatchId,
    ...(id ? { id: String(id) } : {}),
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

function sendUploadResponse(res, statusCode, payload) {
  const body = buildUploadPayload(payload)
  console.log('[upload] 返回 batchId:', body.batchId, {
    statusCode,
    chunkCount: body.chunkCount,
    status: body.status,
    autoStarted: body.autoStarted,
    startFailed: body.startFailed,
    id: body.id,
  })
  return res.status(statusCode).json(body)
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
  console.log('[batch/upload] 解析文件', {
    examFileName,
    bufferBytes: buffer.length,
  })
  const text = await parseExamText(buffer, examFileName)
  console.log('[batch/upload] 解析完成', { examFileName, textLength: text.length })
  return { text, fileName: examFileName }
}

export default async function handler(req, res) {
  if (handleOptions(req, res)) return
  applyApiHeaders(req, res)
  res.setHeader('Content-Type', 'application/json; charset=utf-8')

  if (req.method === 'GET') {
    const teacherId = req.query?.teacherId
    console.log('[batch/upload] GET 任务列表', { teacherId })
    if (!teacherId) {
      return res.status(400).json({ success: false, message: '缺少 teacherId', tasks: [] })
    }
    if (!isBatchStoreConfigured()) {
      return res.status(503).json({ success: false, message: 'Supabase 未配置', tasks: [] })
    }
    try {
      const tasks = await listBatchTasksByTeacher(teacherId)
      console.log('[batch/upload] 任务列表', { teacherId, count: tasks.length })
      const summaries = await Promise.all(
        tasks.map(async (t) => {
          const counts = await countItemsByStatus(t.batch_id)
          return formatBatchProgress(t, counts)
        }),
      )
      return res.status(200).json({ success: true, tasks: summaries })
    } catch (error) {
      const msg = error instanceof Error ? error.message : '查询失败'
      console.error('[batch/upload] GET 失败', { teacherId, msg })
      return res.status(500).json({ success: false, message: msg, tasks: [] })
    }
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed' })
  }

  if (!isBatchStoreConfigured()) {
    console.error('[batch/upload] Supabase 未配置', {
      hasSupabaseUrl: Boolean(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL),
      hasServiceRoleKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    })
    return res.status(503).json({ success: false, message: '请配置 SUPABASE_URL 与 SUPABASE_SERVICE_ROLE_KEY' })
  }

  const body = req.body ?? {}
  const { teacherId, subject, grade, autoStart = true } = body

  console.log('[batch/upload] POST 收到上传', {
    teacherId,
    subject,
    grade,
    autoStart,
    hasFile: Boolean(body.examFileBase64),
    fileName: body.examFileName,
  })

  if (!teacherId) {
    return res.status(400).json({ success: false, message: '缺少 teacherId' })
  }

  try {
    const { text, fileName } = await parseUploadToText(body)
    const chunks = splitTextIntoChunks(text)
    const chunkCount = chunks.length

    console.log('[batch/upload] 分块完成', { teacherId, fileName, chunkCount })

    if (!chunkCount) {
      return res.status(400).json({ success: false, message: '试卷内容为空' })
    }

    const batchId = randomUUID()
    console.log('[batch/upload] 创建任务 → batch_decompose_tasks', { batchId, teacherId, chunkCount })

    const created = await createBatchTask({
      batchId,
      teacherId,
      fileName,
      subject: subject || '数学',
      grade: grade || '八年级',
      chunks,
      meta: { chunkCount, textLength: text.length },
    })

    console.log('[batch/upload] 任务已入库', { batchId, teacherId, ...created })

    let startResult = null
    if (autoStart !== false) {
      console.log('[batch/upload] 自动启动 worker', { batchId, teacherId })
      startResult = await startBatchProcessing(batchId, teacherId, req)
      console.log('[batch/upload] 自动启动结果', { batchId, startResult })
    }

    if (startResult && !startResult.ok) {
      return sendUploadResponse(res, 200, {
        batchId,
        id: created.id,
        chunkCount,
        status: startResult.taskStatus ?? 'pending',
        autoStarted: false,
        startFailed: true,
        startError: startResult.message,
        message: `任务已创建（${chunkCount} 个分块），Worker 启动失败：${startResult.message}。请在列表中点击「启动」重试。`,
      })
    }

    const running = startResult?.ok && startResult.taskStatus === 'running'
    return sendUploadResponse(res, 200, {
      batchId,
      id: created.id,
      chunkCount,
      status: startResult?.taskStatus ?? 'pending',
      autoStarted: running,
      message: running
        ? `批量任务已创建并启动，共 ${chunkCount} 个处理分块`
        : `批量任务已创建，共 ${chunkCount} 个处理分块${autoStart === false ? '，请手动启动' : ''}`,
    })
  } catch (error) {
    console.error('[batch/upload] POST 失败', error)
    const msg = error instanceof Error ? error.message : '上传失败'
    return res.status(500).json({ success: false, message: msg })
  }
}

export const config = {
  maxDuration: 60,
  api: { bodyParser: { sizeLimit: '50mb' } },
}
