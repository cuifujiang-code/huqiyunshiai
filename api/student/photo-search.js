import '../../server/applyUrlShim.js'
import { setNoCacheHeaders } from '../../server/apiResponse.js'
import { runPhotoSearch } from '../../server/student/photoSearchService.js'

export default async function handler(req, res) {
  setNoCacheHeaders(res)

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed' })
  }

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
    return res.status(200).json({
      success: true,
      message: result.source === 'bank' ? '已从题库匹配标准答案' : '搜题完成',
      result,
    })
  } catch (error) {
    console.error('[api/student/photo-search]', error)
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : '拍照搜题失败',
    })
  }
}

export const config = {
  maxDuration: 60,
}
