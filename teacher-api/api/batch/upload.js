import '../../server/applyUrlShim.js'
import { randomUUID } from 'crypto'
import { applyApiHeaders, handleOptions } from '../../server/apiResponse.js'
import { parseExamFile } from '../../server/examParser.js'
import { splitTextIntoChunks } from '../../server/batch/batchChunker.js'
import {
  createBatchTask,
  isBatchStoreConfigured,
  listBatchTasksByTeacher,
  formatBatchProgress,
  countItemsByStatus,
  reconcileBatchTaskFromBank,
} from '../../server/batch/batchTaskStore.js'
import { startBatchProcessing } from '../../server/batch/batchStart.js'
import { persistExamImages } from '../../server/batch/imageExtractor.js'

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
  const { examFileBase64, examFileName, rawText, subject, grade } = body ?? {}

  if (rawText && typeof rawText === 'string' && rawText.trim()) {
    return { text: rawText.trim(), fileName: examFileName || 'paste.txt', type: 'text', formulaImages: null, images: null }
  }

  if (!examFileBase64 || !examFileName) {
    throw new Error('请提供 examFileBase64+examFileName 或 rawText')
  }

  const buffer = Buffer.from(examFileBase64, 'base64')
  const meta = { subject: subject || '数学', grade: grade || '八年级' }
  console.log('[batch/upload] 解析文件', {
    examFileName,
    bufferBytes: buffer.length,
    subject: meta.subject,
    grade: meta.grade,
  })
  const result = await parseExamFile(buffer, examFileName, meta)
  console.log('[batch/upload] 解析完成', {
    examFileName,
    textLength: result.text.length,
    type: result.type,
    hasFormulaImages: Boolean(result.formulaImages?.length),
    hasImages: Boolean(result.images?.length),
  })
  return {
    text: result.text,
    fileName: examFileName,
    type: result.type,
    formulaImages: result.formulaImages || null,
    images: result.images || null,
  }
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
      const summaries = []
      for (const t of tasks) {
        try {
          const reconciled = await reconcileBatchTaskFromBank(t.batch_id)
          const taskRow = reconciled ?? t
          const counts = await countItemsByStatus(t.batch_id)
          summaries.push(formatBatchProgress(taskRow, counts))
        } catch (taskErr) {
          const msg = taskErr instanceof Error ? taskErr.message : String(taskErr)
          console.warn('[batch/upload] 单任务 reconcile 失败，使用原始数据', {
            batchId: t.batch_id,
            msg,
          })
          const counts = await countItemsByStatus(t.batch_id).catch(() => ({}))
          summaries.push(formatBatchProgress(t, counts))
        }
      }
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
  const { teacherId, subject, grade, autoStart = true, imagesJson } = body

  console.log('[batch/upload] POST 收到上传', {
    teacherId,
    subject,
    grade,
    autoStart,
    hasFile: Boolean(body.examFileBase64),
    fileName: body.examFileName,
    hasImages: Boolean(imagesJson),
  })

  if (!teacherId) {
    return res.status(400).json({ success: false, message: '缺少 teacherId' })
  }

  try {
    const { text, fileName, formulaImages: autoFormulaImages, images: autoImages } = await parseUploadToText(body)
    const chunks = splitTextIntoChunks(text)
    const chunkCount = chunks.length

    console.log('[batch/upload] 分块完成', { teacherId, fileName, chunkCount })

    if (!chunkCount) {
      return res.status(400).json({ success: false, message: '试卷内容为空' })
    }

    const batchId = randomUUID()

    // 合并：优先使用前端传入的 imagesJson，其次使用后端自动提取的
    let effectiveFormulaImages = (imagesJson?.formulas?.length > 0)
      ? imagesJson.formulas
      : autoFormulaImages || []
    let effectiveImages = (imagesJson?.images?.length > 0)
      ? imagesJson.images
      : autoImages || []

    // 上传图片到 Supabase Storage，替换为公开 URL（失败时保留 base64）
    try {
      const persisted = await persistExamImages(batchId, {
        formulaImages: effectiveFormulaImages,
        images: effectiveImages,
      })
      effectiveFormulaImages = persisted.formulaImages
      effectiveImages = persisted.images
    } catch (imgErr) {
      console.warn('[batch/upload] 图片上传 Storage 失败，使用 base64 回退', {
        batchId,
        error: imgErr instanceof Error ? imgErr.message : String(imgErr),
      })
    }

    console.log('[batch/upload] 创建任务 → batch_decompose_tasks', {
      batchId,
      teacherId,
      chunkCount,
      formulaCount: effectiveFormulaImages.length,
      imageCount: effectiveImages.length,
      source: (imagesJson?.formulas?.length > 0) ? '前端传入' : '后端自动提取',
    })

    const created = await createBatchTask({
      batchId,
      teacherId,
      fileName,
      subject: subject || '数学',
      grade: grade || '八年级',
      chunks,
      meta: {
        chunkCount,
        textLength: text.length,
        ...(effectiveFormulaImages.length > 0 || effectiveImages.length > 0 ? {
          formulaImages: effectiveFormulaImages,
          images: effectiveImages,
        } : {}),
      },
    })

    console.log('[batch/upload] 任务已入库', { batchId, teacherId, ...created })

    let startResult = null
    if (autoStart !== false) {
      console.log(`[启动] 正在触发 Worker，batchId=${batchId}`)
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
