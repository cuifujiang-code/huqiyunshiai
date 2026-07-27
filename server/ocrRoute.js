import { handwritingToHandout } from './teacher/handoutOcrService.js'
import { handwritingToBook } from './teacher/bookOcrService.js'
import handoutOcrProcess from '../api/handouts/ocr-process.js'
import { validateDoubaoConnection, getDoubaoConfigSummary } from './doubaoClient.js'

export function registerOcrRoutes(app) {
  app.get('/api/ocr/doubao-health', async (_req, res) => {
    const result = await validateDoubaoConnection()
    return res.status(result.ok ? 200 : 503).json({ success: result.ok, ...result })
  })

  app.get('/api/ocr/doubao-config', (_req, res) => {
    return res.json({ success: true, config: getDoubaoConfigSummary() })
  })

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

  app.post('/api/ocr/handwriting-to-book', async (req, res) => {
    try {
      const body = req.body ?? {}
      const result = await handwritingToBook(body)
      return res.status(200).json({ success: true, ...result })
    } catch (error) {
      console.error('[ocr/handwriting-to-book]', error)
      return res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : '辅导书 OCR 识别失败',
      })
    }
  })

  app.all('/api/handouts/ocr-process', (req, res) => handoutOcrProcess(req, res))
}
