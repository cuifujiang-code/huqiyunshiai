import '../../server/applyUrlShim.js'
import { orchestrateAITask } from '../../server/aiOrchestrator.js'
import { applyApiHeaders, handleOptions } from '../../server/apiResponse.js'

export default async function handler(req, res) {
  if (handleOptions(req, res)) return
  applyApiHeaders(req, res)

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed' })
  }

  const { userId, imageBase64, imageName } = req.body ?? {}
  if (!imageBase64?.trim()) {
    return res.status(400).json({ success: false, message: '请上传题目图片' })
  }

  try {
    const outcome = await orchestrateAITask('photo-search', {
      userId: userId?.trim() || null,
      imageBase64,
      imageName: imageName?.trim() || 'photo.jpg',
    })

    if (!outcome.success) {
      return res.status(500).json({
        success: false,
        message: outcome.error || '拍照搜题失败',
        meta: outcome.meta,
      })
    }

    return res.status(200).json({
      success: true,
      message: outcome.result?.reviewRequired ? '搜题完成（答案需审阅）' : '搜题完成',
      result: outcome.result,
      meta: outcome.meta,
    })
  } catch (err) {
    const searchStatus = err?.searchStatus
    console.error('[api/student/photo-search]', err)
    return res.status(500).json({
      success: false,
      message: err instanceof Error ? err.message : '拍照搜题失败',
      searchStatus,
    })
  }
}

export const config = {
  maxDuration: 120,
  api: { bodyParser: { sizeLimit: '20mb' } },
}
