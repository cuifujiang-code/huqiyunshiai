/**
 * POST /api/teacher/book/smart-generate
 * 教辅书智能生成主端点（最强版）
 */
import { smartGenerateBook } from '../../server/teacher/bookSmartGenerator.js'
import { saveBook } from '../../server/teacher/bookStore.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed' })
  }

  const {
    teacherId,
    title,
    subject = '数学',
    grade = '高一',
    level = '基础',
    chapters,        // 原稿章节（OCR 导入或手动创建）
    options = {},
  } = req.body

  if (!teacherId) {
    return res.status(400).json({ success: false, message: '缺少 teacherId' })
  }
  if (!chapters || !Array.isArray(chapters) || chapters.length === 0) {
    return res.status(400).json({ success: false, message: '请提供原稿章节（chapters）' })
  }
  if (!title?.trim()) {
    return res.status(400).json({ success: false, message: '请提供书名（title）' })
  }

  try {
    const result = await smartGenerateBook({
      title,
      subject,
      grade,
      level,
      chapters,
      teacherId,
      options: {
        preserveAllQuestions: options.preserveAllQuestions !== false,
        generateDualVersion: options.generateDualVersion !== false,
        augmentFromBank: options.augmentFromBank !== false,
      },
    })

    // 将结果保存到数据库（学生版 + 教师版）
    const saved = []

    if (result.studentVersion) {
      try {
        const savedBook = await saveBook(teacherId, {
          title: result.studentVersion.title,
          grade: result.studentVersion.grade,
          level: result.studentVersion.level,
          chapters: result.studentVersion.chapters,
          coverStyle: result.studentVersion.coverStyle || 'academic',
          layoutTemplate: result.studentVersion.layoutTemplate || 'knowledge-example',
          foreword: result.studentVersion.foreword,
          exportMode: 'print',
        })
        saved.push({ type: 'student', id: savedBook?.id, title: result.studentVersion.title })
      } catch (saveErr) {
        console.warn('[bookSmartGenerate] 学生版保存失败：', saveErr.message)
      }
    }

    if (result.teacherVersion) {
      try {
        const savedBook = await saveBook(teacherId, {
          title: result.teacherVersion.title,
          grade: result.teacherVersion.grade,
          level: result.teacherVersion.level,
          chapters: result.teacherVersion.chapters,
          coverStyle: result.teacherVersion.coverStyle || 'academic',
          layoutTemplate: result.teacherVersion.layoutTemplate || 'knowledge-example',
          foreword: result.teacherVersion.foreword,
          exportMode: 'digital',
        })
        saved.push({ type: 'teacher', id: savedBook?.id, title: result.teacherVersion.title })
      } catch (saveErr) {
        console.warn('[bookSmartGenerate] 教师版保存失败：', saveErr.message)
      }
    }

    return res.status(200).json({
      success: true,
      message: '智能生成完成',
      result: {
        coreIdea: result.coreIdea,
        reorganizationPlan: result.reorganizationPlan,
        augmentationResult: {
          ...result.augmentationResult,
          executions: (result.augmentationResult.executions || []).map(e => ({
            ...e,
            matchedQuestions: (e.matchedQuestions || []).map(q => ({
              id: q.id,
              difficulty: q.difficulty,
              question_type: q.question_type,
              knowledge_point: q.knowledge_point,
            })),
          })),
        },
        previewChapters: result.previewChapters,
        studentVersionId: saved.find(s => s.type === 'student')?.id || null,
        teacherVersionId: saved.find(s => s.type === 'teacher')?.id || null,
        adjustmentReport: result.adjustmentReport,
        report: result.report,
      },
    })
  } catch (err) {
    console.error('[bookSmartGenerate] 错误：', err)
    return res.status(500).json({
      success: false,
      message: err instanceof Error ? err.message : '智能生成失败',
      stack: process.env.NODE_ENV === 'development' ? (err instanceof Error ? err.stack : '') : undefined,
    })
  }
}
