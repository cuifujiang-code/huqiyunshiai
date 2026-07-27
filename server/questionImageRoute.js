/**
 * GET /api/teacher/question-images?name=xxx.jpeg
 * 本地附图回退服务（开发/Storage 未命中时使用）
 */
import {
  resolveImageFile,
  convertToPngBuffer,
  isFileLikeImageRef,
} from './teacher/questionImageIndex.js'

export async function handleQuestionImageRequest(req, res) {
  const name = String(req.query?.name || req.query?.file || '').trim()
  if (!name || !isFileLikeImageRef(name)) {
    return res.status(400).json({ error: '无效的图片名称' })
  }

  const filePath = resolveImageFile(name)
  if (!filePath) {
    return res.status(404).json({ error: '图片未找到', name })
  }

  try {
    const converted = convertToPngBuffer(filePath)
    if (!converted?.buffer?.length) {
      return res.status(415).json({ error: '图片无法转换', name })
    }
    res.setHeader('Cache-Control', 'public, max-age=86400')
    res.setHeader('Content-Type', converted.mime)
    return res.send(converted.buffer)
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : String(err) })
  }
}
