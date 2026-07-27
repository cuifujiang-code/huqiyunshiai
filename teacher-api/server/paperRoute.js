/**
 * 试题试卷 API 路由
 */
import { isSupabaseAdminConfigured } from './supabaseAdmin.js'
import * as paperStore from './teacher/paperStore.js'

function requireUser(body, query) {
  const userId = body?.userId?.trim() || body?.teacherId?.trim() || query?.userId?.trim() || query?.teacherId?.trim()
  if (!userId) throw new Error('缺少 userId')
  return userId
}

function notConfigured(res) {
  return res.status(503).json({ success: false, message: '请配置 Supabase 环境变量' })
}

export function registerPaperRoutes(app) {
  app.get('/api/papers/categories', async (req, res) => {
    if (!isSupabaseAdminConfigured()) return notConfigured(res)
    try {
      const categories = await paperStore.listCategories(req.query)
      res.json({ success: true, categories, subjects: ['语文', '数学', '英语', '物理', '化学', '生物', '历史', '地理'] })
    } catch (e) {
      res.status(500).json({ success: false, message: e.message })
    }
  })

  app.get('/api/papers', async (req, res) => {
    if (!isSupabaseAdminConfigured()) return notConfigured(res)
    try {
      const userId = req.query.userId || req.query.teacherId || ''
      const result = await paperStore.listPapers(userId, req.query)
      res.json({ success: true, ...result })
    } catch (e) {
      res.status(500).json({ success: false, message: e.message })
    }
  })

  app.get('/api/papers/collection', async (req, res) => {
    if (!isSupabaseAdminConfigured()) return notConfigured(res)
    try {
      const userId = requireUser({}, req.query)
      const items = await paperStore.listCollection(userId)
      res.json({ success: true, items })
    } catch (e) {
      res.status(400).json({ success: false, message: e.message })
    }
  })

  app.get('/api/papers/:id', async (req, res) => {
    if (!isSupabaseAdminConfigured()) return notConfigured(res)
    try {
      const userId = req.query.userId || req.query.teacherId || ''
      const paper = await paperStore.getPaperById(req.params.id, userId)
      if (!paper) return res.status(404).json({ success: false, message: '试卷不存在' })
      await paperStore.incrementView(req.params.id)
      res.json({ success: true, paper })
    } catch (e) {
      res.status(500).json({ success: false, message: e.message })
    }
  })

  app.post('/api/papers', async (req, res) => {
    if (!isSupabaseAdminConfigured()) return notConfigured(res)
    try {
      const userId = requireUser(req.body, req.query)
      const { fileBase64, fileName, ...meta } = req.body
      const paper = await paperStore.createPaper(userId, meta, fileBase64, fileName)
      res.json({ success: true, paper })
    } catch (e) {
      res.status(400).json({ success: false, message: e.message })
    }
  })

  app.put('/api/papers/:id', async (req, res) => {
    if (!isSupabaseAdminConfigured()) return notConfigured(res)
    try {
      const userId = requireUser(req.body, req.query)
      const paper = await paperStore.updatePaper(userId, req.params.id, req.body)
      res.json({ success: true, paper })
    } catch (e) {
      res.status(400).json({ success: false, message: e.message })
    }
  })

  app.delete('/api/papers/:id', async (req, res) => {
    if (!isSupabaseAdminConfigured()) return notConfigured(res)
    try {
      const userId = requireUser(req.body, req.query)
      await paperStore.deletePaper(userId, req.params.id)
      res.json({ success: true })
    } catch (e) {
      res.status(400).json({ success: false, message: e.message })
    }
  })

  app.post('/api/papers/batch-delete', async (req, res) => {
    if (!isSupabaseAdminConfigured()) return notConfigured(res)
    try {
      const userId = requireUser(req.body, req.query)
      await paperStore.batchDeletePapers(userId, req.body.ids ?? [])
      res.json({ success: true })
    } catch (e) {
      res.status(400).json({ success: false, message: e.message })
    }
  })

  app.post('/api/papers/:id/collect', async (req, res) => {
    if (!isSupabaseAdminConfigured()) return notConfigured(res)
    try {
      const userId = requireUser(req.body, req.query)
      await paperStore.toggleCollection(userId, req.params.id, req.body.collect !== false)
      res.json({ success: true })
    } catch (e) {
      res.status(400).json({ success: false, message: e.message })
    }
  })

  app.post('/api/papers/:id/download', async (req, res) => {
    if (!isSupabaseAdminConfigured()) return notConfigured(res)
    try {
      const userId = req.body?.userId || req.query.userId || ''
      const paper = await paperStore.getPaperById(req.params.id, userId)
      if (!paper) return res.status(404).json({ success: false, message: '试卷不存在' })
      await paperStore.incrementDownload(req.params.id)
      res.json({ success: true, url: paper.file_url, fileName: paper.title })
    } catch (e) {
      res.status(500).json({ success: false, message: e.message })
    }
  })
}
