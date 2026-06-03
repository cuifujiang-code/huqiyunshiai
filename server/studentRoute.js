import { setNoCacheHeaders } from './apiResponse.js'
import { runPhotoSearch } from './student/photoSearchService.js'
import {
  getPhotoSearchRecord,
  isPhotoSearchStoreConfigured,
  listPhotoSearchHistory,
} from './student/photoSearchStore.js'

export function registerStudentRoutes(app) {
  app.post('/api/student/photo-search', async (req, res) => {
    setNoCacheHeaders(res)
    const { userId, imageBase64, imageName } = req.body ?? {}

    if (!imageBase64?.trim()) {
      return res.status(400).json({ success: false, message: '请上传题目图片' })
    }

    try {
      const result = await runPhotoSearch({
        userId: userId?.trim() || null,
        imageBase64,
        imageName: imageName?.trim() || 'photo.jpg',
      })
      return res.json({
        success: true,
        message: result.source === 'bank' ? '已从题库匹配标准答案' : '搜题完成',
        result,
      })
    } catch (error) {
      console.error('[student/photo-search]', error)
      const searchStatus = (error && typeof error === 'object' && 'searchStatus' in error)
        ? error.searchStatus
        : undefined
      return res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : '拍照搜题失败',
        searchStatus,
      })
    }
  })

  app.get('/api/student/photo-search/history', async (req, res) => {
    setNoCacheHeaders(res)
    if (!isPhotoSearchStoreConfigured()) {
      return res.status(503).json({
        success: false,
        message: '历史记录服务未配置 Supabase',
      })
    }

    const userId = String(req.query.userId || '').trim()
    if (!userId) {
      return res.status(400).json({ success: false, message: '缺少 userId' })
    }

    try {
      const data = await listPhotoSearchHistory(userId, {
        page: req.query.page,
        pageSize: req.query.pageSize,
      })
      return res.json({ success: true, ...data })
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : '加载历史失败',
      })
    }
  })

  app.get('/api/student/photo-search/history/:id', async (req, res) => {
    setNoCacheHeaders(res)
    const userId = String(req.query.userId || '').trim()
    const { id } = req.params

    try {
      const row = await getPhotoSearchRecord(userId, id)
      if (!row) return res.status(404).json({ success: false, message: '记录不存在' })
      return res.json({ success: true, item: row })
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : '加载记录失败',
      })
    }
  })
}
