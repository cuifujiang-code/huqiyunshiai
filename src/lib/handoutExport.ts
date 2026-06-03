import type { HandoutContent, HandoutModule } from '../types/teacher'

function escapeHtml(text: string): string {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function moduleStyle(m: HandoutModule): string {
  const size = m.style?.fontSize ?? 14
  const color = m.style?.color ?? '#111827'
  return `font-size:${size}px;color:${color};`
}

const PRINT_CSS = `
@page { margin: 2cm 1.5cm; }
body { font-family: "Microsoft YaHei", SimSun, serif; color: #111; line-height: 1.6; }
.handout-cover { page-break-after: always; text-align: center; padding: 80px 40px; min-height: 70vh; display:flex; flex-direction:column; justify-content:center; }
.handout-cover h1 { font-size: 28px; margin: 0 0 16px; }
.handout-cover .subtitle { font-size: 18px; color: #374151; margin-bottom: 24px; }
.handout-cover .meta { font-size: 14px; color: #6b7280; }
.handout-toc { page-break-after: always; padding: 40px 20px; }
.handout-toc h2 { font-size: 20px; border-bottom: 2px solid #333; padding-bottom: 8px; }
.handout-toc ol { margin-top: 16px; padding-left: 24px; }
.handout-toc li { margin: 8px 0; }
.handout-module { page-break-inside: avoid; margin-bottom: 24px; }
.handout-module h2 { font-size: 16px; border-left: 4px solid #2563eb; padding-left: 8px; margin: 0 0 12px; }
.handout-doc-header { border-bottom: 1px solid #d1d5db; padding-bottom: 8px; margin-bottom: 20px; font-size: 12px; color: #6b7280; text-align: center; }
.handout-doc-footer { border-top: 1px solid #d1d5db; padding-top: 8px; margin-top: 32px; font-size: 12px; color: #6b7280; text-align: center; }
`

export function handoutToExportHtml(content: HandoutContent): string {
  const cover = content.cover ?? {
    title: content.title,
    subtitle: '',
    teacherName: '',
    date: new Date().toLocaleDateString('zh-CN'),
  }
  const header = content.headerText?.trim() || content.title
  const footer = content.footerText?.trim() || '华祺云师 AI · 讲义'

  let body = `<style>${PRINT_CSS}</style>`
  body += `<div class="handout-doc-header">${escapeHtml(header)}</div>`

  body += `<div class="handout-cover">`
  body += `<h1>${escapeHtml(cover.title || content.title)}</h1>`
  if (cover.subtitle) body += `<p class="subtitle">${escapeHtml(cover.subtitle)}</p>`
  body += `<p class="meta">`
  if (cover.teacherName) body += `主讲：${escapeHtml(cover.teacherName)}<br/>`
  if (cover.date) body += `日期：${escapeHtml(cover.date)}`
  body += `</p></div>`

  body += `<div class="handout-toc"><h2>目 录</h2><ol>`
  content.modules.forEach((m, i) => {
    body += `<li><a href="#mod-${i}">${escapeHtml(m.title)}</a></li>`
  })
  body += `</ol></div>`

  content.modules.forEach((m, i) => {
    body += `<div class="handout-module" id="mod-${i}">`
    body += `<h2 style="${moduleStyle(m)}">${escapeHtml(m.title)}</h2>`
    body += `<div style="${moduleStyle(m)}">${escapeHtml(m.content).replace(/\n/g, '<br/>')}</div>`
    body += `</div>`
  })

  body += `<div class="handout-doc-footer">${escapeHtml(footer)}</div>`
  return body
}

export function handoutPreviewHtml(content: HandoutContent): string {
  return handoutToExportHtml(content)
}
