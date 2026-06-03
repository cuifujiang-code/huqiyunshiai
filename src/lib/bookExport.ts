import type { BookChapter, BookCoverStyle, BookRecord, KnowledgeGraph } from '../types/teacher'

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

const BOOK_PRINT_CSS = `
body { font-family: "Microsoft YaHei", SimSun, serif; line-height: 1.6; color: #111; }
.book-cover { page-break-after: always; min-height: 60vh; display:flex; flex-direction:column; justify-content:center; }
.book-cover h1 { font-size: 32px; margin: 0 0 12px; }
.book-cover .meta { font-size: 16px; opacity: 0.9; }
.chapter-title { font-size: 22px; font-weight: bold; margin: 32px 0 16px; page-break-before: always; border-bottom: 2px solid #2563eb; padding-bottom: 6px; }
.section-title { font-size: 18px; font-weight: 600; margin: 20px 0 12px; color: #1e40af; }
.block-title { font-size: 15px; font-weight: 600; margin: 12px 0 6px; }
.block-content { margin-bottom: 16px; font-size: 14px; }
.page-num { text-align: center; font-size: 11px; color: #6b7280; margin-top: 24px; }
.knowledge-graph { page-break-before: always; padding: 20px; }
.kg-node { display: inline-block; margin: 8px; padding: 8px 14px; border: 2px solid #3b82f6; border-radius: 8px; background: #eff6ff; font-size: 13px; }
.kg-edge { font-size: 12px; color: #64748b; margin: 4px 0; }
`

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

export function bookToExportHtml(book: BookRecord): string {
  const style = book.coverStyle ?? 'minimal'
  let page = 0
  let html = `<style>${BOOK_PRINT_CSS}</style>`

  html += `<div class="book-cover" style="${COVER_STYLES[style]}">`
  html += `<h1>${escapeHtml(book.title)}</h1>`
  html += `<p class="meta">${escapeHtml(book.grade)} · ${escapeHtml(book.level)}</p>`
  html += `</div>`

  html += knowledgeGraphHtml(book.knowledgeGraph)

  for (const ch of book.chapters) {
    html += `<h2 class="chapter-title">${escapeHtml(ch.title)}</h2>`
    for (const sec of ch.sections) {
      html += `<h3 class="section-title">${escapeHtml(sec.title)}</h3>`
      for (const b of sec.blocks) {
        page += 1
        html += `<h4 class="block-title">${escapeHtml(b.title)}</h4>`
        html += `<div class="block-content">${escapeHtml(b.content).replace(/\n/g, '<br/>')}</div>`
        html += `<p class="page-num">— ${page} —</p>`
      }
    }
  }

  return html
}
