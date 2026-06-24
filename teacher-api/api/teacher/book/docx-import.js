/**
 * POST /api/teacher/book/docx-import
 * Body JSON: { docxBase64, fileName? } 或 multipart/form-data 字段 docx|file
 */
import { importDocxBuffer } from '../../../server/teacher/docxImportService.js'

function readBufferFromBody(body) {
  if (body?.docxBase64) {
    return Buffer.from(String(body.docxBase64), 'base64')
  }
  return null
}

export default async function handleDocxImport(req, res) {
  if (req.method && req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' })
  }

  try {
    let buffer = readBufferFromBody(req.body)

    if (!buffer && req.file?.buffer) {
      buffer = req.file.buffer
    }

    if (!buffer) {
      return res.status(400).json({ success: false, error: '未找到 DOCX 文件（请传 docxBase64 或 multipart docx 字段）' })
    }

    if (buffer.length > 50 * 1024 * 1024) {
      return res.status(400).json({ success: false, error: 'DOCX 文件过大（最大 50MB）' })
    }

    const fileName = req.body?.fileName || 'import.docx'
    const result = await importDocxBuffer(buffer, fileName)
    return res.status(200).json({
      success: true,
      chapters: result.chapters,
      imageCount: result.imageCount,
      formulaCount: result.formulaCount,
      formulaImagesExtracted: result.formulaImagesExtracted,
      formulaImagesConvertedToPng: result.formulaImagesConvertedToPng,
      cleanStats: result.cleanStats,
      cleanSummary: result.cleanSummary,
      rawText: result.rawText,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'DOCX 导入失败'
    console.error('[docx-import]', message)
    return res.status(500).json({ success: false, error: message })
  }
}
