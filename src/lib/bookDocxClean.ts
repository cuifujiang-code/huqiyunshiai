/** 教辅书 Word 导入清洗 — 类型与客户端工具 */

import type { BookChapter } from '../types/teacher'
import { buildTeacherRootApiUrl } from './apiBase'

export interface BookDocxCleanStats {
  watermarksRemoved?: number
  formulasConverted?: number
  ommlConverted?: number
  imageFormulasKept?: number
  paragraphsNormalized?: number
  blocksCleaned?: number
}

export const WATERMARK_KEYWORDS = [
  '学科网',
  'ZXXK',
  'zxxk',
  'zzk',
  '来自学科网',
  '菁优网',
  '学科资源网',
  '百度文库',
  '原创力文档',
  '教习网',
  '资源站',
  '下载地址',
  'www.zxxk.com',
  'ZXXK.COM',
]

export function buildCleanResultMessage(stats: BookDocxCleanStats): string {
  const w = stats.watermarksRemoved || 0
  const f = (stats.ommlConverted || 0) + (stats.formulasConverted || 0)
  const p = stats.paragraphsNormalized || 0
  let msg = `已自动过滤水印广告 ${w} 处，转换数学公式 ${f} 个，规整段落格式 ${p} 处`
  if ((stats.imageFormulasKept || 0) > 30) {
    msg += '。部分公式为图片格式，可手动重新录入 LaTeX 优化显示'
  }
  return msg
}

/** 本地轻量水印过滤（离线手动清洗兜底） */
export function cleanChaptersLocally(chapters: BookChapter[]): {
  chapters: BookChapter[]
  stats: BookDocxCleanStats
} {
  const wmRe = new RegExp(
    WATERMARK_KEYWORDS.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'),
    'i',
  )
  let watermarksRemoved = 0
  let paragraphsNormalized = 0

  const cleaned = chapters.map((ch) => ({
    ...ch,
    sections: (ch.sections || []).map((sec) => ({
      ...sec,
      blocks: (sec.blocks || []).map((block) => {
        let content = String(block.content || '')
        const lines = content.split('\n')
        const kept = lines.filter((line) => {
          const t = line.trim()
          if (t && wmRe.test(t) && t.length < 200) {
            watermarksRemoved += 1
            return false
          }
          return true
        })
        content = kept
          .join('\n')
          .replace(/\n{3,}/g, '\n\n')
          .replace(/(学科网|ZXXK|zxxk)[^\n]{0,80}/gi, () => {
            watermarksRemoved += 1
            return ''
          })
          .trim()
        if (content !== block.content) paragraphsNormalized += 1
        return { ...block, content }
      }),
    })),
  }))

  return {
    chapters: cleaned,
    stats: { watermarksRemoved, paragraphsNormalized, blocksCleaned: paragraphsNormalized },
  }
}

/** 服务端二次清洗 */
export async function cleanBookChaptersRemote(chapters: BookChapter[]): Promise<{
  chapters: BookChapter[]
  cleanStats: BookDocxCleanStats
  cleanSummary: string
}> {
  const res = await fetch(buildTeacherRootApiUrl('teacher/book/docx-clean-chapters'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ chapters }),
  })
  const data = (await res.json()) as {
    success?: boolean
    chapters?: BookChapter[]
    cleanStats?: BookDocxCleanStats
    cleanSummary?: string
    error?: string
  }
  if (!res.ok || !data.success || !data.chapters) {
    throw new Error(data.error || '章节清洗失败')
  }
  return {
    chapters: data.chapters,
    cleanStats: data.cleanStats || {},
    cleanSummary: data.cleanSummary || buildCleanResultMessage(data.cleanStats || {}),
  }
}
