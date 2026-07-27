import { handwritingToBook } from '../../server/teacher/bookOcrService.js'

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
    const result = await handwritingToBook(req.body ?? {})
    return res.status(200).json({ success: true, ...result })
  } catch (error) {
    console.error('[ocr/handwriting-to-book]', error)
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : '辅导书 OCR 识别失败',
    })
  }
}
