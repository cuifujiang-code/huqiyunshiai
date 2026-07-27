import {
  getDecomposeTaskByTaskId,
  markDecomposeTaskCompleted,
  markDecomposeTaskFailed,
  markDecomposeTaskParsed,
  markDecomposeTaskPartialProgress,
} from './decomposeTaskStore.js'
import { repairQuestionsAfterDecompose } from '../batch/questionPostRepair.js'
import { aiSplitExamText, parseExamDocument, splitTextIntoBatches } from './questionImportService.js'
import { tryExtractStructuredQuestions } from './structuredExamExtractor.js'

/**
 * 拆题任务：解析试卷 → 分批 AI 拆题（每批更新 partial result）
 * status: processing → parsed → splitting → completed / failed
 */
export async function runDecomposeTask(taskId) {
  const task = await getDecomposeTaskByTaskId(taskId)
  if (!task) throw new Error('任务不存在')

  if (task.status === 'completed') {
    return { skipped: true, status: 'completed', questions: task.result?.questions ?? [] }
  }
  if (task.status === 'failed') {
    return { skipped: true, status: 'failed', message: task.error_message }
  }

  const batchProgress = task.result?.batchProgress
  const existingQuestions = Array.isArray(task.result?.questions) ? task.result.questions : []
  if (
    batchProgress?.total > 0
    && batchProgress.completed >= batchProgress.total
    && existingQuestions.length > 0
    && task.status !== 'completed'
  ) {
    console.log('[decomposeProcess] 批次已全部完成，补写 completed', {
      taskId,
      count: existingQuestions.length,
      batchProgress,
    })
    await markDecomposeTaskCompleted(taskId, existingQuestions)
    return { success: true, status: 'completed', questions: existingQuestions }
  }

  const payload = task.result?.payload
  if (!payload?.examFileBase64 || !payload?.examFileName) {
    await markDecomposeTaskFailed(taskId, '任务缺少试卷文件数据')
    return { success: false, status: 'failed', message: '任务缺少试卷文件数据' }
  }

  const baseMeta = {
    subject: payload.subject,
    grade: payload.grade,
    formulaImages: task.result?.meta?.formulaImages || [],
    images: task.result?.meta?.images || [],
    _formulaIdx: task.result?.meta?._formulaIdx ?? 0,
    _imageIdx: task.result?.meta?._imageIdx ?? 0,
  }

  try {
    let parsedText = task.result?.parsedText
    const resumeFromBatch = task.result?.batchProgress?.nextIndex ?? 0
    let startBatchIndex = 0
    let questions = []

    if (!parsedText) {
      console.log('[decomposeProcess] 解析试卷', { taskId })
      const buffer = Buffer.from(payload.examFileBase64, 'base64')
      const doc = await parseExamDocument(buffer, payload.examFileName, baseMeta)
      parsedText = doc.text
      baseMeta.formulaImages = doc.formulaImages
      baseMeta.images = doc.images
      console.log('[decomposeProcess] 解析完成', {
        taskId,
        textLength: parsedText.length,
        formulaImages: baseMeta.formulaImages.length,
        images: baseMeta.images.length,
      })
      await markDecomposeTaskParsed(taskId, parsedText, baseMeta)
    } else if (task.status === 'splitting' && resumeFromBatch > 0) {
      startBatchIndex = resumeFromBatch
      questions = Array.isArray(task.result?.questions) ? [...task.result.questions] : []
    }

    const structured = tryExtractStructuredQuestions(parsedText, baseMeta)
    if (structured?.length) {
      console.log('[decomposeProcess] 结构化试卷，跳过 AI 拆题', { taskId, count: structured.length })
      questions = await repairQuestionsAfterDecompose(structured, baseMeta)
      await markDecomposeTaskCompleted(taskId, questions)
      return { success: true, status: 'completed', questions, structured: true }
    }

    const batches = splitTextIntoBatches(parsedText)
    console.log('[decomposeProcess] AI 分批拆题（稳健管线）', {
      taskId,
      textLength: parsedText.length,
      batchCount: batches.length,
      startBatchIndex,
      formulaImages: baseMeta.formulaImages.length,
      images: baseMeta.images.length,
    })

    if (batches.length === 0) {
      await markDecomposeTaskFailed(taskId, '试卷解析后无有效文本，无法拆题')
      return { success: false, status: 'failed', message: '试卷解析后无有效文本' }
    }

    const splitMeta = { ...baseMeta, startSort: questions.length }

    for (let i = startBatchIndex; i < batches.length; i++) {
      splitMeta.startSort = questions.length
      const batchQuestions = await aiSplitExamText(batches[i], splitMeta)
      questions.push(...batchQuestions)

      await markDecomposeTaskPartialProgress(taskId, {
        payload,
        parsedText,
        meta: {
          subject: baseMeta.subject,
          grade: baseMeta.grade,
          formulaImages: baseMeta.formulaImages,
          images: baseMeta.images,
          _formulaIdx: splitMeta._formulaIdx,
          _imageIdx: splitMeta._imageIdx,
        },
        questions,
        batchProgress: { total: batches.length, completed: i + 1, nextIndex: i + 1 },
      })
    }

    if (questions.length === 0) {
      await markDecomposeTaskFailed(taskId, 'AI 未拆出任何题目，请检查试卷内容或重试')
      return { success: false, status: 'failed', message: 'AI 未拆出任何题目' }
    }

    console.log('[decomposeProcess] 二次修复（OCR + 公式视觉）', { taskId, count: questions.length })
    questions = await repairQuestionsAfterDecompose(questions, {
      subject: baseMeta.subject,
      grade: baseMeta.grade,
      formulaImages: baseMeta.formulaImages,
      images: baseMeta.images,
    })

    await markDecomposeTaskCompleted(taskId, questions)
    console.log('[decomposeProcess] 完成', { taskId, count: questions.length })
    return { success: true, status: 'completed', questions }
  } catch (error) {
    const message = error instanceof Error ? error.message : '拆题失败'
    console.error('[decomposeProcess] 失败', { taskId, message })
    await markDecomposeTaskFailed(taskId, message)
    return { success: false, status: 'failed', message }
  }
}
