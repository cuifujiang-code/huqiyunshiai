import { alignToCss, layoutToInlineStyle } from './examLayoutStyles'
import { exportHtmlAsWord } from './exportDoc'
import type { ExamLayoutConfig, LayoutExamData } from '../types/examLayout'
import { formatQuestionNumber } from '../types/examLayout'

const OPTION_LABELS = ['A', 'B', 'C', 'D', 'E', 'F']

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function plainContent(text: string): string {
  return escapeHtml(text).replace(/\n/g, '<br/>')
}

function renderOptionsHtml(options: string[], layout: ExamLayoutConfig): string {
  const cleaned = options.filter((o) => o.trim())
  if (!cleaned.length) return ''

  const layoutStyle = layout.optionsLayout === 'horizontal'
    ? 'display:grid;grid-template-columns:1fr 1fr;gap:4px 16px;margin-top:8px;'
    : 'margin-top:8px;'

  const items = cleaned.map((opt, idx) => {
    const label = OPTION_LABELS[idx] || String.fromCharCode(65 + idx)
    const text = /^[A-F][.、)\s]/.test(opt.trim()) ? opt : `${label}. ${opt}`
    return `<div style="margin-bottom:4px;">${plainContent(text)}</div>`
  }).join('')

  return `<div style="${layoutStyle}">${items}</div>`
}

export function examLayoutToHtml(exam: LayoutExamData, layout: ExamLayoutConfig): string {
  const showInline = layout.answerMode === 'lecture'
  const showEnd = layout.answerMode === 'homework'
  const allQuestions = exam.sections.flatMap((s) => s.questions)

  let html = `<div style="${layoutToInlineStyle(layout)}">`

  if (layout.header.visible && layout.header.text.trim()) {
    html += `<div style="text-align:${alignToCss(layout.header.align)};margin-bottom:16px;padding-bottom:8px;border-bottom:1px solid #ddd;font-size:0.9em;color:#666;">${escapeHtml(layout.header.text)}</div>`
  }

  html += `<h1 style="text-align:center;font-size:1.25em;margin:0 0 8px;">${escapeHtml(exam.title)}</h1>`
  html += `<p style="text-align:center;font-size:0.85em;color:#666;margin:0 0 20px;">${escapeHtml(exam.grade)}${escapeHtml(exam.subject)} · 满分 ${exam.totalScore} 分</p>`

  for (const sec of exam.sections) {
    html += `<h2 style="font-size:1em;border-bottom:1px solid #ccc;padding-bottom:4px;margin:20px 0 12px;">${escapeHtml(sec.question_type)}（共 ${sec.questions.length} 题）</h2>`

    for (const q of sec.questions) {
      const num = formatQuestionNumber(q.number, layout.numberStyle)
      html += `<div style="margin-bottom:16px;">`
      html += `<p style="margin:0;"><strong>${escapeHtml(num)}</strong>`
      if (q.score != null) html += `<span style="color:#666;font-size:0.85em;">（${q.score}分）</span> `
      html += `${plainContent(q.content)}</p>`
      html += renderOptionsHtml(q.options, layout)

      if (showInline) {
        html += `<div style="margin-top:8px;padding:8px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:4px;font-size:0.92em;">`
        html += `<div style="font-weight:bold;color:#15803d;">答案</div><div>${plainContent(q.answer || '暂无')}</div>`
        if (q.analysis && q.analysis !== '暂无') {
          html += `<div style="margin-top:4px;font-weight:bold;color:#475569;">解析</div><div>${plainContent(q.analysis)}</div>`
        }
        html += `</div>`
      }
      html += `</div>`
    }
  }

  if (showEnd && allQuestions.length > 0) {
    html += `<div style="margin-top:32px;padding-top:16px;border-top:2px solid #999;">`
    html += `<h2 style="text-align:center;font-size:1.1em;">参考答案</h2>`
    for (const q of allQuestions) {
      const num = formatQuestionNumber(q.number, layout.numberStyle)
      html += `<p style="margin:8px 0;"><strong>${escapeHtml(num)}</strong> ${plainContent(q.answer || '暂无')}</p>`
      if (q.analysis && q.analysis !== '暂无') {
        html += `<p style="margin:4px 0 8px 24px;color:#475569;font-size:0.92em;"><strong>解析：</strong>${plainContent(q.analysis)}</p>`
      }
    }
    html += `</div>`
  }

  if (layout.footer.visible && layout.footer.text.trim()) {
    html += `<div style="text-align:${alignToCss(layout.footer.align)};margin-top:32px;padding-top:8px;border-top:1px solid #ddd;font-size:0.85em;color:#666;">${escapeHtml(layout.footer.text)}</div>`
  }

  html += `</div>`
  return html
}

export function exportExamLayoutWord(exam: LayoutExamData, layout: ExamLayoutConfig) {
  const html = examLayoutToHtml(exam, layout)
  exportHtmlAsWord(html, `${exam.title}.doc`)
}
