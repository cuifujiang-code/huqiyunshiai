import '../../server/applyUrlShim.js'
import { setNoCacheHeaders } from '../../server/apiResponse.js'
import {
  getPhotoSearchRecord,
  isPhotoSearchStoreConfigured,
  listPhotoSearchHistory,
} from '../../server/student/photoSearchStore.js'

export default async function handler(req, res) {
  setNoCacheHeaders(res)

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed' })
  }

  if (!isPhotoSearchStoreConfigured()) {
    return res.status(503).json({
      success: false,
      message: '历史记录服务未配置 Supabase',
    })
  }

  const userId = String(req.query.userId || '').trim()
  const id = String(req.query.id || '').trim()

  if (!userId) {
    return res.status(400).json({ success: false, message: '缺少 userId' })
  }

  try {
    if (id) {
      const item = await getPhotoSearchRecord(userId, id)
      if (!item) return res.status(404).json({ success: false, message: '记录不存在' })
      return res.status(200).json({ success: true, item })
    }

    const data = await listPhotoSearchHistory(userId, {
      page: req.query.page,
      pageSize: req.query.pageSize,
    })
    return res.status(200).json({ success: true, ...data })
  } catch (error) {
    console.error('[api/student/photo-search-history]', error)
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : '加载历史失败',
    })
  }
}

export const config = {
  maxDuration: 30,
}
