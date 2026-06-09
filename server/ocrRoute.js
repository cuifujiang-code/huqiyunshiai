import { handwritingToHandout } from '../teacher/handoutOcrService.js'

export function registerOcrRoutes(app) {
  app.post('/api/ocr/handwriting-to-handout', async (req, res) => {
    try {
      const body = req.body ?? {}
      const result = await handwritingToHandout(body)
      return res.status(200).json({ success: true, ...result })
    } catch (error) {
      console.error('[ocr/handwriting-to-handout]', error)
      return res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : '手写解析转换失败',
      })
    }
  })
}
