import { isSupabaseAdminConfigured } from './supabaseAdmin.js'
import * as questionBank from './teacher/questionBankStore.js'
import { splitExamToQuestions } from './teacher/questionImportService.js'
import { buildSmartExam } from './teacher/examBuilderService.js'
import * as lessonPlan from './teacher/lessonPlanStore.js'
import * as handout from './teacher/handoutStore.js'
import * as book from './teacher/bookStore.js'
import * as bookAi from './teacher/bookAi.js'
import { callDeepSeekAI, extractJson } from './deepseekClient.js'

function requireTeacher(body, query) {
  const teacherId = body?.teacherId?.trim() || query?.teacherId?.trim()
  if (!teacherId) throw new Error('缺少 teacherId')
  return teacherId
}

function notConfigured(res) {
  return res.status(503).json({ success: false, message: '请配置 VITE_SUPABASE_URL 与 SUPABASE_SERVICE_ROLE_KEY' })
}

function needsSupabase(path) {
  return !path.startsWith('questions-import/') && path !== 'questions/generate'
}

/** Vercel / Express 统一教师 API 路由 */
export async function handleTeacherApi(req, res, pathSegments = []) {
  const method = req.method
  const path = pathSegments.join('/')
  const body = req.body ?? {}
  const query = req.query ?? {}

  if (needsSupabase(path) && !isSupabaseAdminConfigured()) return notConfigured(res)

  try {
    // GET /questions
    if (path === 'questions' && method === 'GET') {
      const teacherId = query.teacherId
      if (!teacherId) return res.status(400).json({ success: false, message: '缺少 teacherId' })
      const result = await questionBank.listQuestions(teacherId, query)
      return res.status(200).json({ success: true, ...result })
    }

    // POST /questions
    if (path === 'questions' && method === 'POST') {
      const teacherId = requireTeacher(body, query)
      const data = await questionBank.createQuestion(teacherId, body)
      return res.status(200).json({ success: true, question: data })
    }

    // PUT /questions/:id
    if (path.startsWith('questions/') && method === 'PUT') {
      const id = path.split('/')[1]
      const teacherId = requireTeacher(body, query)
      const data = await questionBank.updateQuestion(teacherId, id, body)
      return res.status(200).json({ success: true, question: data })
    }

    // DELETE /questions
    if (path === 'questions' && method === 'DELETE') {
      const teacherId = requireTeacher(body, query)
      await questionBank.deleteQuestions(teacherId, body.ids ?? [])
      return res.status(200).json({ success: true })
    }

    if (path === 'questions/batch-tags' && method === 'POST') {
      const teacherId = requireTeacher(body, query)
      await questionBank.updateQuestionsTags(teacherId, body.ids ?? [], body.tags ?? [])
      return res.status(200).json({ success: true })
    }

    if (path === 'questions/batch' && method === 'POST') {
      const teacherId = requireTeacher(body, query)
      const data = await questionBank.createQuestionsBatch(teacherId, body.questions ?? [])
      return res.status(200).json({ success: true, questions: data })
    }

    if (path === 'questions-import/split' && method === 'POST') {
      const { examFileBase64, examFileName, subject, grade } = body
      if (!examFileBase64 || !examFileName) {
        return res.status(400).json({ success: false, message: '请上传试卷文件' })
      }
      const buffer = Buffer.from(examFileBase64, 'base64')
      const questions = await splitExamToQuestions(buffer, examFileName, { subject, grade })
      return res.status(200).json({ success: true, questions })
    }

    if (path === 'questions/generate' && method === 'POST') {
      const { subject, grade, question_type, difficulty, knowledge_point } = body
      const prompt = `生成一道${grade}${subject}${question_type}，难度${difficulty}，知识点${knowledge_point}。返回 JSON: content, options, answer, analysis, knowledge_point`
      const content = await callDeepSeekAI('只输出 JSON', prompt)
      const q = JSON.parse(extractJson(content))
      return res.status(200).json({
        success: true,
        question: {
          subject,
          grade,
          question_type,
          difficulty,
          knowledge_point: q.knowledge_point || knowledge_point,
          content: q.content,
          options: q.options ?? [],
          answer: q.answer,
          analysis: q.analysis,
          source: 'AI生成',
          tags: [],
        },
      })
    }

    if (path === 'exam-builder' && method === 'POST') {
      const teacherId = requireTeacher(body, query)
      const exam = await buildSmartExam(teacherId, body)
      return res.status(200).json({ success: true, exam })
    }

    if (path === 'lesson-plans' && method === 'GET') {
      const data = await lessonPlan.listLessonPlans(query.teacherId)
      return res.status(200).json({ success: true, plans: data })
    }

    if (path === 'lesson-plans' && method === 'POST') {
      const teacherId = requireTeacher(body, query)
      const data = await lessonPlan.saveLessonPlan(teacherId, body)
      return res.status(200).json({ success: true, plan: data })
    }

    if (path.startsWith('lesson-plans/') && method === 'DELETE') {
      const id = path.split('/')[1]
      await lessonPlan.deleteLessonPlan(body.teacherId || query.teacherId, id)
      return res.status(200).json({ success: true })
    }

    if (path === 'handouts' && method === 'GET') {
      const data = await handout.listHandouts(query.teacherId)
      return res.status(200).json({ success: true, handouts: data })
    }

    if (path.startsWith('handouts/') && method === 'GET') {
      const id = path.split('/')[1]
      const data = await handout.getHandout(query.teacherId, id)
      return res.status(200).json({ success: true, handout: data })
    }

    if (path === 'handouts' && method === 'POST') {
      const teacherId = requireTeacher(body, query)
      if (body.action === 'generate') {
        const draft = await handout.generateHandoutDraft(body.mode, body)
        return res.status(200).json({ success: true, draft })
      }
      const data = await handout.saveHandout(teacherId, body)
      return res.status(200).json({ success: true, handout: data })
    }

    if (path.startsWith('handouts/') && method === 'DELETE') {
      const id = path.split('/')[1]
      await handout.deleteHandout(body.teacherId || query.teacherId, id)
      return res.status(200).json({ success: true })
    }

    if (path === 'books' && method === 'GET') {
      const data = await book.listBooks(query.teacherId)
      return res.status(200).json({ success: true, books: data })
    }

    if (path.startsWith('books/') && method === 'GET') {
      const id = path.split('/')[1]
      const data = await book.getBook(query.teacherId, id)
      return res.status(200).json({ success: true, book: data })
    }

    if (path === 'books/knowledge-graph' && method === 'POST') {
      requireTeacher(body, query)
      const questions = body.questions ?? []
      const graph = await bookAi.generateKnowledgeGraph(questions)
      return res.status(200).json({ success: true, graph })
    }

    if (path === 'books' && method === 'POST') {
      const teacherId = requireTeacher(body, query)
      const data = await book.saveBook(teacherId, body)
      return res.status(200).json({ success: true, book: data })
    }

    if (path.startsWith('books/') && method === 'DELETE') {
      const id = path.split('/')[1]
      await book.deleteBook(body.teacherId || query.teacherId, id)
      return res.status(200).json({ success: true })
    }

    return res.status(404).json({ success: false, message: `未知路由: ${path}` })
  } catch (error) {
    console.error('[teacherApi]', path, error)
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : '服务器错误',
    })
  }
}
