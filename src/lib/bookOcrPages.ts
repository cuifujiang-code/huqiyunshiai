/** 将 OCR 合并文本按页拆分为数组（与 handoutDoubaoOcr 输出格式一致） */

import type { BookChapter } from '../types/teacher'

const PAGE_MARKER_RE = /---\s*第\s*\d+\s*页\s*---\s*/gi

export function splitOcrTextByPage(ocrText: string): string[] {
  const raw = String(ocrText ?? '').trim()
  if (!raw) return []

  if (!PAGE_MARKER_RE.test(raw)) {
    PAGE_MARKER_RE.lastIndex = 0
    return [raw]
  }
  PAGE_MARKER_RE.lastIndex = 0

  const pages = raw
    .split(PAGE_MARKER_RE)
    .map((chunk) => chunk.trim())
    .filter(Boolean)

  return pages.length > 0 ? pages : [raw]
}

/** OCR 完成后按块顺序均分到各页（便于原件对比联动） */
export function assignBlocksToSourcePages(chapters: BookChapter[], pageCount: number): BookChapter[] {
  if (pageCount <= 0) return chapters

  const refs: { ci: number; si: number; bi: number }[] = []
  chapters.forEach((ch, ci) =>
    ch.sections.forEach((sec, si) =>
      sec.blocks.forEach((_, bi) => refs.push({ ci, si, bi })),
    ),
  )
  if (!refs.length) return chapters

  const next = structuredClone(chapters) as BookChapter[]
  refs.forEach((ref, idx) => {
    const pageIdx = Math.min(pageCount - 1, Math.floor((idx / refs.length) * pageCount))
    const block = next[ref.ci].sections[ref.si].blocks[ref.bi]
    block.style = { ...block.style, sourcePageIndex: pageIdx }
  })
  return next
}
