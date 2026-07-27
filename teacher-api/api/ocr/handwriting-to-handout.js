import { handwritingToHandout } from '../../server/teacher/handoutOcrService.js'

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*')
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    return res.status(204).end()
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' })
  }
  try {
    const result = await handwritingToHandout(req.body ?? {})
    return res.status(200).json({ success: true, ...result })
  } catch (error) {
    console.error('[ocr/handwriting-to-handout]', error)
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : '手写解析转换失败',
    })
  }
}
