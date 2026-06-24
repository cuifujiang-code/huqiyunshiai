/**
 * POST /api/teacher/book/docx-clean-chapters
 * Body: { chapters: BookChapter[] }
 * 对已导入章节执行二次水印清除与段落规整
 */
import { cleanBookChapters, buildCleanSummaryMessage } from '../../../server/teacher/bookDocxClean.js'

export default async function handleDocxCleanChapters(req, res) {
  if (req.method && req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' })
  }

  try {
    const chapters = req.body?.chapters
    if (!Array.isArray(chapters) || !chapters.length) {
      return res.status(400).json({ success: false, error: '请提供 chapters 数组' })
    }

    const { chapters: cleaned, stats } = cleanBookChapters(chapters)
    return res.status(200).json({
      success: true,
      chapters: cleaned,
      cleanStats: stats,
      cleanSummary: buildCleanSummaryMessage(stats),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : '章节清洗失败'
    console.error('[docx-clean-chapters]', message)
    return res.status(500).json({ success: false, error: message })
  }
}
