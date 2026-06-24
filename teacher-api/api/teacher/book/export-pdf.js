/**
 * POST /api/teacher/book/export-pdf
 *
 * 接收前端生成的 HTML → 使用 Puppeteer 渲染 → 返回真实 PDF（文本可选 + 矢量公式 + 正确分页）
 *
 * 请求体 (JSON):
 *   { html, title, coverStyle, outline, studentVersion?, teacherVersion? }
 *
 * 响应:
 *   单版本: application/pdf 直接返回二进制
 *   双版本: application/json { studentBase64, teacherBase64 }
 */

import { generateBookPdf } from '../../teacher/bookPdfExporter.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
    const { html, title, coverStyle, outline, studentHtml, teacherHtml } = body || {}

    if (!html && !studentHtml && !teacherHtml) {
      res.status(400).json({ error: '缺少 html 参数' })
      return
    }

    const options = { title: title || '教辅书', coverStyle: coverStyle || 'academic', outline: outline || [] }

    // 双版本导出
    if (studentHtml && teacherHtml) {
      const { generateBookDualPdf } = await import('../../teacher/bookPdfExporter.js')
      const { studentBuffer, teacherBuffer } = await generateBookDualPdf({
        htmlStudent: studentHtml,
        htmlTeacher: teacherHtml,
        options,
      })

      res.status(200).json({
        success: true,
        studentBase64: studentBuffer.toString('base64'),
        teacherBase64: teacherBuffer.toString('base64'),
      })
      return
    }

    // 单版本导出
    if (!html) {
      res.status(400).json({ error: '缺少 html 参数' })
      return
    }

    const pdfBuffer = await generateBookPdf({ html, options })

    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(options.title)}.pdf"`)
    res.setHeader('Content-Length', pdfBuffer.length)
    res.status(200).send(pdfBuffer)
  } catch (err) {
    console.error('[book-export-pdf] 导出失败:', err.message)
    res.status(500).json({ error: `PDF 导出失败: ${err.message}` })
  }
}
