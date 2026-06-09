import type { ExportMode, HandoutContent, HandoutModule } from '../types/teacher'
import { countMissingAnswers } from './handoutImportUtils'

export interface HandoutExportOptions {
  mode?: ExportMode
  includeMissingAnswerNotice?: boolean
}

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
  const family = m.style?.fontFamily ?? 'Microsoft YaHei, SimSun, serif'
  return `font-size:${size}px;color:${color};font-family:${family};`
}

function modeCss(mode: ExportMode): string {
  if (mode === 'digital') {
    return `
@page { margin: 1.5cm 1.2cm; }
body { font-family: "Microsoft YaHei", SimSun, serif; color: #111; line-height: 1.65; }
a { color: #2563eb; text-decoration: none; }
.handout-module h2 a { color: inherit; }
`
  }
  return `
@page { margin: 2cm 1.8cm; }
body { font-family: SimSun, "Microsoft YaHei", serif; color: #000; line-height: 1.6; }
.handout-module { page-break-inside: avoid; }
`
}

const BASE_CSS = `
.handout-cover { page-break-after: always; text-align: center; padding: 80px 40px; min-height: 70vh; display:flex; flex-direction:column; justify-content:center; }
.handout-cover h1 { font-size: 28px; margin: 0 0 16px; }
.handout-cover .subtitle { font-size: 18px; color: #374151; margin-bottom: 24px; }
.handout-cover .meta { font-size: 14px; color: #6b7280; }
.handout-toc { page-break-after: always; padding: 40px 20px; }
.handout-toc h2 { font-size: 20px; border-bottom: 2px solid #333; padding-bottom: 8px; }
.handout-toc ol { margin-top: 16px; padding-left: 24px; }
.handout-toc li { margin: 8px 0; }
.handout-module { margin-bottom: 24px; }
.handout-module h2 { border-left: 4px solid #2563eb; padding-left: 8px; margin: 0 0 12px; }
.handout-doc-header { border-bottom: 1px solid #d1d5db; padding-bottom: 8px; margin-bottom: 20px; font-size: 12px; color: #6b7280; text-align: center; }
.handout-doc-footer { border-top: 1px solid #d1d5db; padding-top: 8px; margin-top: 32px; font-size: 12px; color: #6b7280; text-align: center; }
.missing-answer-badge { display:inline-block;background:#fef3c7;color:#92400e;padding:2px 8px;border-radius:4px;font-size:12px;margin-left:8px; }
.missing-answer-notice { background:#fffbeb;border:1px solid #fcd34d;padding:12px 16px;margin:16px 0;border-radius:6px;font-size:13px;color:#92400e; }
`

export function handoutToExportHtml(content: HandoutContent, options: HandoutExportOptions = {}): string {
  const mode = options.mode ?? content.exportMode ?? 'print'
  const cover = content.cover ?? {
    title: content.title,
    subtitle: '',
    teacherName: '',
    date: new Date().toLocaleDateString('zh-CN'),
  }
  const header = content.headerText?.trim() || content.title
  const footer = content.footerText?.trim() || '华祺云师 AI · 讲义'
  const missingCount = countMissingAnswers(content.modules)

  let body = `<style>${modeCss(mode)}${BASE_CSS}</style>`
  body += `<div class="handout-doc-header">${escapeHtml(header)}</div>`

  body += `<div class="handout-cover">`
  body += `<h1>${escapeHtml(cover.title || content.title)}</h1>`
  if (cover.subtitle) body += `<p class="subtitle">${escapeHtml(cover.subtitle)}</p>`
  body += `<p class="meta">`
  if (cover.teacherName) body += `主讲：${escapeHtml(cover.teacherName)}<br/>`
  if (cover.date) body += `日期：${escapeHtml(cover.date)}`
  body += `</p></div>`

  if (missingCount > 0 && options.includeMissingAnswerNotice !== false) {
    body += `<div class="missing-answer-notice">⚠ 本讲义含 ${missingCount} 处「答案待补充」，导出前请核对或补充答案。</div>`
  }

  body += `<div class="handout-toc"><h2>目 录</h2><ol>`
  content.modules.forEach((m, i) => {
    const anchor = mode === 'digital' ? `<a href="#mod-${i}">${escapeHtml(m.title)}</a>` : escapeHtml(m.title)
    body += `<li>${anchor}</li>`
  })
  body += `</ol></div>`

  content.modules.forEach((m, i) => {
    body += `<div class="handout-module" id="mod-${i}">`
    body += `<h2 style="${moduleStyle(m)}">${escapeHtml(m.title)}`
    if (m.missingAnswer) body += `<span class="missing-answer-badge">答案待补充</span>`
    body += `</h2>`
    body += `<div style="${moduleStyle(m)}">${escapeHtml(m.content).replace(/\n/g, '<br/>')}</div>`
    body += `</div>`
  })

  body += `<div class="handout-doc-footer">${escapeHtml(footer)}</div>`
  return body
}

export function handoutPreviewHtml(content: HandoutContent): string {
  return handoutToExportHtml(content, { mode: 'digital' })
}

/** PDF 书签结构 */
export function handoutBookmarkOutline(content: HandoutContent): { title: string; level: number }[] {
  const items: { title: string; level: number }[] = [{ title: content.title, level: 0 }]
  content.modules.forEach((m) => items.push({ title: m.title, level: 1 }))
  return items
}
