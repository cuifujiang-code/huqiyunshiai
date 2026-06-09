/**
 * POST /api/handouts/ocr-process
 * 手写讲义 OCR 核心入口 — 豆包视觉模型
 */
import { processHandoutOcrImages } from '../../server/teacher/handoutDoubaoOcr.js'

export { processHandoutOcrImages as processHandoutOcr } from '../../server/teacher/handoutDoubaoOcr.js'

function setCors(req, res) {
  const origin = req.headers?.origin || '*'
  res.setHeader('Access-Control-Allow-Origin', origin)
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
}

export default async function handler(req, res) {
  setCors(req, res)
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' })
  }

  try {
    const body = req.body ?? {}
    const { pageImages = [], title, subject, grade } = body
    const result = await processHandoutOcrImages(pageImages, { title, subject, grade })
    return res.status(200).json({ success: true, ...result })
  } catch (error) {
    console.error('[handouts/ocr-process]', error)
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : '手写讲义 OCR 失败',
    })
  }
}
