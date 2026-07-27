import type { BookCoverStyle, BookRecord, ExportMode, KnowledgeGraph } from '../types/teacher'
import { renderLatexText } from '../components/common/MathRenderer'
import { mergeEmbeddedFigures, EMBEDDED_FIGURE_TOKEN } from './embeddedImages'
import { getLayoutTemplate, type BookLayoutTemplateId } from './bookLayoutTemplates'

export interface BookExportOptions {
  mode?: ExportMode
}

function escapeHtml(text: string): string {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

const COVER_STYLES: Record<BookCoverStyle, string> = {
  minimal: 'background:#fff;color:#111;border:2px solid #111;padding:60px 40px;text-align:center;',
  academic: 'background:linear-gradient(135deg,#1e3a5f,#2c5282);color:#fff;padding:60px 40px;text-align:center;',
  fresh: 'background:linear-gradient(135deg,#ecfdf5,#d1fae5);color:#065f46;padding:60px 40px;text-align:center;border:3px solid #34d399;',
}

function layoutCss(templateId: BookLayoutTemplateId, mode: ExportMode): string {
  const tpl = getLayoutTemplate(templateId)
  const s = tpl.settings
  const margin = mode === 'print' ? (s.marginMm ?? 20) + 4 : (s.marginMm ?? 20)
  let css = `
body { font-family: ${s.fontFamily}; font-size: ${s.fontSize}px; line-height: ${s.lineHeight ?? 1.6}; color: ${s.bodyColor}; }
.book-cover { page-break-after: always; min-height: 60vh; display:flex; flex-direction:column; justify-content:center; }
.book-cover h1 { font-size: 32px; margin: 0 0 12px; }
.book-cover .meta { font-size: 16px; opacity: 0.9; }
.chapter-title { font-size: 22px; font-weight: bold; margin: 32px 0 16px; page-break-before: always; border-bottom: 2px solid ${s.headingColor}; padding-bottom: 6px; color: ${s.headingColor}; }
.section-title { font-size: 18px; font-weight: 600; margin: 20px 0 12px; color: ${s.headingColor}; }
.block-title { font-size: 15px; font-weight: 600; margin: 12px 0 6px; }
.block-content { margin-bottom: 16px; }
.page-num { text-align: center; font-size: 11px; color: #6b7280; margin-top: 24px; }
.foreword, .epilogue { page-break-after: always; padding: 24px; }
.foreword h2, .epilogue h2 { color: ${s.headingColor}; border-bottom: 1px solid #ddd; padding-bottom: 8px; }
.knowledge-graph { page-break-before: always; padding: 20px; }
.kg-node { display: inline-block; margin: 8px; padding: 8px 14px; border: 2px solid #3b82f6; border-radius: 8px; background: #eff6ff; font-size: 13px; }
.kg-edge { font-size: 12px; color: #64748b; margin: 4px 0; }
.missing-answer-badge { background:#fef3c7;color:#92400e;padding:2px 6px;border-radius:4px;font-size:11px;margin-left:6px; }
`
  if (tpl.id === 'two-column') {
    css += `.book-body-columns { column-count: 2; column-gap: ${s.columnGapMm ?? 12}mm; }`
  }
  if (tpl.id === 'cornell') {
    css += `.cornell-row { display: grid; grid-template-columns: 28% 1fr; gap: ${s.columnGapMm ?? 8}mm; margin-bottom: 12px; }
.cornell-cue { border-right: 2px solid #99f6e4; padding-right: 8px; font-size: 12px; color: #0f766e; }
.cornell-notes { padding-left: 4px; }`
  }
  if (tpl.id === 'knowledge-example') {
    css += `.block-knowledge { background: #fffbeb; border-left: 4px solid #f59e0b; padding: 10px 12px; margin-bottom: 12px; }
.block-example { background: #eff6ff; border-left: 4px solid #3b82f6; padding: 10px 12px; margin-bottom: 12px; }`
  }
  if (tpl.id === 'workbook') {
    css += `.block-exercise { border: 1px dashed #94a3b8; padding: 16px; min-height: 80px; margin-bottom: 16px; }`
  }
  css += `@page { margin: ${margin}mm; }`
  return css
}

function knowledgeGraphHtml(graph: KnowledgeGraph | null | undefined): string {
  if (!graph?.nodes?.length) return ''
  let html = `<div class="knowledge-graph"><h2 style="text-align:center">知识网络图</h2><div style="text-align:center;margin:20px 0">`
  for (const n of graph.nodes) {
    html += `<span class="kg-node">${escapeHtml(n.label)}</span>`
  }
  html += `</div><div style="max-width:600px;margin:0 auto">`
  for (const e of graph.edges ?? []) {
    const from = graph.nodes.find((n) => n.id === e.from)?.label ?? e.from
    const to = graph.nodes.find((n) => n.id === e.to)?.label ?? e.to
    html += `<p class="kg-edge">${escapeHtml(from)} → ${escapeHtml(to)}${e.label ? `（${escapeHtml(e.label)}）` : ''}</p>`
  }
  html += `</div></div>`
  return html
}

function normalizeImgSrcInHtml(html: string): string {
  if (typeof window === 'undefined') return html
  return html.replace(/<img([^>]*?)src="([^"]+)"/gi, (match, attrs, src) => {
    if (src.startsWith('data:') || src.startsWith('http')) return match
    try {
      const full = new URL(src, window.location.origin).href
      return `<img${attrs}src="${full}"`
    } catch {
      return match
    }
  })
}

function renderBlockContent(content: string, figures?: string[]): string {
  if (!content.trim()) return '<p style="color:#9ca3af;font-style:italic">（暂无正文）</p>'
  let text = content
  if (figures?.length && content.includes(EMBEDDED_FIGURE_TOKEN)) {
    text = mergeEmbeddedFigures(content, figures)
  }
  return normalizeImgSrcInHtml(renderLatexText(text))
}

function renderBlock(b: BookRecord['chapters'][0]['sections'][0]['blocks'][0], templateId: BookLayoutTemplateId): string {
  const cls =
    templateId === 'knowledge-example' && b.type === 'knowledge'
      ? 'block-knowledge'
      : templateId === 'knowledge-example' && b.type === 'example'
        ? 'block-example'
        : templateId === 'workbook' && b.type === 'exercise'
          ? 'block-exercise'
          : ''

  const style = b.style
  const layoutBits = [
    style?.fontSize ? `font-size:${style.fontSize}px` : '',
    style?.color ? `color:${style.color}` : '',
    style?.fontFamily ? `font-family:${style.fontFamily}` : '',
    style?.align ? `text-align:${style.align}` : '',
    style?.marginTop ? `margin-top:${style.marginTop}px` : '',
    style?.width === 'half' ? 'display:inline-block;width:48%;vertical-align:top;margin-right:2%' : '',
  ]
    .filter(Boolean)
    .join(';')

  const styleAttr = layoutBits ? `${layoutBits};` : ''

  let html = `<div class="${cls}">`
  html += `<h4 class="block-title">${escapeHtml(b.title)}`
  if (b.missingAnswer) html += `<span class="missing-answer-badge">答案待补充</span>`
  html += `</h4>`

  if (templateId === 'cornell') {
    html += `<div class="cornell-row"><div class="cornell-cue">${escapeHtml(b.type === 'knowledge' ? '要点' : '关键词')}</div>`
    html += `<div class="cornell-notes" style="${styleAttr}">${renderBlockContent(b.content, b.figures)}</div></div>`
  } else {
    html += `<div class="block-content" style="${styleAttr}">${renderBlockContent(b.content, b.figures)}</div>`
  }
  html += `</div>`
  return html
}

export function bookToExportHtml(book: BookRecord, options: BookExportOptions = {}): string {
  const style = book.coverStyle ?? 'minimal'
  const templateId = (book.layoutTemplate ?? 'classic') as BookLayoutTemplateId
  const mode = options.mode ?? book.exportMode ?? 'print'
  const tpl = getLayoutTemplate(templateId)

  let page = 0
  let html = `<style>${layoutCss(templateId, mode)}</style>`
  html += `<div class="book-cover" style="${COVER_STYLES[style]}">`
  html += `<h1>${escapeHtml(book.title)}</h1>`
  html += `<p class="meta">${escapeHtml(book.grade)} · ${escapeHtml(book.level)}</p>`
  html += `</div>`

  if (book.foreword?.trim()) {
    html += `<div class="foreword"><h2>前言</h2><div>${escapeHtml(book.foreword).replace(/\n/g, '<br/>')}</div></div>`
  }

  html += knowledgeGraphHtml(book.knowledgeGraph)

  const colWrap = templateId === 'two-column' ? 'book-body-columns' : ''
  html += `<div class="${colWrap} ${tpl.bodyClass}">`

  for (const ch of book.chapters) {
    html += `<h2 class="chapter-title">${escapeHtml(ch.title)}</h2>`
    for (const sec of ch.sections) {
      html += `<h3 class="section-title">${escapeHtml(sec.title)}</h3>`
      for (const b of sec.blocks) {
        page += 1
        html += renderBlock(b, templateId)
        if (mode === 'print') html += `<p class="page-num">— ${page} —</p>`
      }
    }
  }
  html += `</div>`

  if (book.epilogue?.trim()) {
    html += `<div class="epilogue"><h2>后记</h2><div>${escapeHtml(book.epilogue).replace(/\n/g, '<br/>')}</div></div>`
  }

  return html
}

/**
 * 生成发送到服务端 Puppeteer PDF 引擎的完整 HTML body（不含 <style> 标签）
 * 服务端会用自己的专业排版 CSS 包裹
 */
export function bookToExportBodyHtml(book: BookRecord, options: BookExportOptions = {}): string {
  const style = book.coverStyle ?? 'academic'
  const templateId = (book.layoutTemplate ?? 'classic') as BookLayoutTemplateId
  const mode = options.mode ?? book.exportMode ?? 'print'
  const tpl = getLayoutTemplate(templateId)

  let html = ''

  // 封面
  html += `<div class="cover-page">`
  html += `<h1>${escapeHtml(book.title)}</h1>`
  html += `<div class="decorator"></div>`
  html += `<p class="subtitle">${escapeHtml(book.grade)} · ${escapeHtml(book.level)}</p>`
  if (book.foreword) {
    const shortForeword = book.foreword.length > 120 ? book.foreword.slice(0, 120) + '…' : book.foreword
    html += `<p class="meta">${escapeHtml(shortForeword)}</p>`
  }
  html += `</div>`

  // 前言
  if (book.foreword?.trim()) {
    html += `<div class="foreword" style="page-break-after:always">`
    html += `<h2>前言</h2>`
    html += `<div>${escapeHtml(book.foreword).replace(/\n/g, '<br/>')}</div>`
    html += `</div>`
  }

  // 知识网络图
  html += knowledgeGraphHtml(book.knowledgeGraph)

  // 正文章节
  const colWrap = templateId === 'two-column' ? 'book-body-columns' : ''
  html += `<div class="${colWrap} ${tpl.bodyClass}">`

  for (const ch of book.chapters) {
    html += `<h2 class="chapter-title">${escapeHtml(ch.title)}</h2>`
    for (const sec of ch.sections) {
      html += `<h3 class="section-title">${escapeHtml(sec.title)}</h3>`
      for (const b of sec.blocks) {
        html += renderBlock(b, templateId)
      }
    }
  }
  html += `</div>`

  // 后记
  if (book.epilogue?.trim()) {
    html += `<div class="epilogue" style="page-break-before:always">`
    html += `<h2>后记</h2>`
    html += `<div>${escapeHtml(book.epilogue).replace(/\n/g, '<br/>')}</div>`
    html += `</div>`
  }

  return html
}

/** 导出双版本 body HTML（学生版 + 教师版），用于服务端 Puppeteer PDF 渲染 */
export function bookToDualExportBodyHtml(book: BookRecord, options: BookExportOptions = {}): {
  studentHtml: string
  teacherHtml: string
} {
  const teacherHtml = bookToExportBodyHtml(book, options)

  // 学生版：过滤掉答案/解析内容
  const studentBook = filterBookForStudentVersion(book)
  const studentHtml = bookToExportBodyHtml(studentBook, options)

  return { studentHtml, teacherHtml }
}

export function bookBookmarkOutline(book: BookRecord): { title: string; level: number }[] {
  const items: { title: string; level: number }[] = [{ title: book.title, level: 0 }]
  if (book.foreword?.trim()) items.push({ title: '前言', level: 1 })
  for (const ch of book.chapters) {
    items.push({ title: ch.title, level: 1 })
    for (const sec of ch.sections) items.push({ title: sec.title, level: 2 })
  }
  if (book.epilogue?.trim()) items.push({ title: '后记', level: 1 })
  return items
}

export interface DualExportOptions {
  studentVersion: boolean
  format: 'pdf' | 'word'
}

const ANSWER_LINE_RE = /^\[?(解答|答案|解析)\]?/i

function stripStudentAnswers(content: string): string {
  return content
    .split('\n')
    .filter((line) => !ANSWER_LINE_RE.test(line.trim()))
    .join('\n')
    .replace(/\[解答\][\s\S]*?(?=\n\[题目\]|$)/gi, '')
    .replace(/\[答案\][\s\S]*?(?=\n\[题目\]|$)/gi, '')
    .trim()
}

function filterBookForStudentVersion(book: BookRecord): BookRecord {
  const filtered: BookRecord = JSON.parse(JSON.stringify(book))
  filtered.chapters = filtered.chapters.map((chapter) => ({
    ...chapter,
    sections: chapter.sections.map((section) => ({
      ...section,
      blocks: section.blocks
        .filter((block) => {
          if (block.title && ANSWER_LINE_RE.test(block.title)) return false
          if (block.content && /^\[?(解答|答案)\]?/.test(block.content.trim().slice(0, 20))) return false
          return true
        })
        .map((block) => ({
          ...block,
          content: stripStudentAnswers(block.content),
          missingAnswer: undefined,
        })),
    })),
  }))
  return filtered
}

/** 双版本导出：学生版（无解析/答案）与教师版 */
export async function exportBookDualVersion(
  book: BookRecord,
  options: DualExportOptions,
  helpers: {
    exportPdf: (el: HTMLElement, filename: string, opts?: { mode?: ExportMode; bookmarks?: { title: string; level?: number }[] }) => Promise<void>
    exportWord: (html: string, filename: string, opts?: { mode?: ExportMode; title?: string }) => void
    waitForImages?: (el: HTMLElement) => Promise<void>
    createExportElement: (html: string) => HTMLElement
  },
): Promise<void> {
  const filteredBook = options.studentVersion ? filterBookForStudentVersion(book) : book
  const suffix = options.studentVersion ? '学生版' : '教师版'
  const filename = `${book.title}_${suffix}`
  const html = bookToExportHtml(filteredBook, { mode: book.exportMode ?? 'print' })
  const el = helpers.createExportElement(html)

  try {
    if (helpers.waitForImages) {
      await helpers.waitForImages(el)
    }
    if (options.format === 'pdf') {
      await helpers.exportPdf(el, `${filename}.pdf`, {
        mode: book.exportMode ?? 'print',
        bookmarks: bookBookmarkOutline(filteredBook),
      })
    } else {
      helpers.exportWord(html, filename, {
        mode: book.exportMode ?? 'print',
        title: filename,
      })
    }
  } finally {
    el.remove()
  }
}
